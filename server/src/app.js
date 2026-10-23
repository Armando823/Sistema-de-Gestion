import http from "node:http";
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { createRateLimiter } from "./rateLimiter.js";
import { sendWithRetry } from "./mailer.js";
import { parseReceiptRequest, buildReceiptEmail } from "./receiptEmail.js";
import { createSessionToken, hashPassword, normalizeEmail, validateCredentials, verifyPassword, verifySessionToken } from "./auth.js";
import { normalizePhone } from "./phone.js";
import { createAdminHandlers } from "./routes/admin.js";

const HOUR = 60 * 60 * 1000;

function hashPhoneCode(phone, code, secret) {
  return createHmac("sha256", secret).update(`${phone}:${code}`).digest("hex");
}

function sameSecret(received, expected) {
  const receivedBytes = Buffer.from(String(received ?? ""));
  const expectedBytes = Buffer.from(String(expected));
  return (
    receivedBytes.length === expectedBytes.length &&
    timingSafeEqual(receivedBytes, expectedBytes)
  );
}

function maskEmail(email) {
  const [user = "", domain = ""] = String(email).split("@");
  return `${user.slice(0, 1)}***@${domain}`;
}

class HttpError extends Error {
  constructor(status, message, headers = {}) {
    super(message);
    this.status = status;
    this.headers = headers;
  }
}

function readBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    req.on("error", fail);

    const declared = Number(req.headers["content-length"]);
    if (Number.isFinite(declared) && declared > maxBytes) {
      req.resume();
      fail(new HttpError(413, "La petición es demasiado grande."));
      return;
    }
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      if (settled) return;
      size += chunk.length;
      if (size > maxBytes) {
        chunks.length = 0;
        fail(new HttpError(413, "La petición es demasiado grande."));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (settled) return;
      settled = true;
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
  });
}

function parseJson(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    throw new HttpError(400, "JSON inválido.");
  }
}

function isValidRepair(repair) {
  const statuses = ["Recibido", "En diagnóstico", "Esperando repuesto", "En reparación", "Listo para entregar", "Entregado"];
  return Boolean(
    repair &&
    typeof repair === "object" &&
    /^REP-\d{4,8}$/.test(repair.id) &&
    statuses.includes(repair.status) &&
    (repair.whatsappOptIn === undefined || typeof repair.whatsappOptIn === "boolean") &&
    Array.isArray(repair.photos ?? []) &&
    (repair.photos ?? []).length <= 3 &&
    (repair.photos ?? []).every((photo) =>
      typeof photo === "string" &&
      photo.length <= 2_500_000 &&
      /^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(photo),
    ) &&
    parseReceiptRequest({
      email: "valid@example.com",
      repair: { ...repair, signature: repair.signature || "" },
    }).ok
  );
}

const repairBackupFields = new Set([
  "id",
  "customer",
  "phone",
  "device",
  "problem",
  "status",
  "updated",
  "createdAt",
  "ownerEmail",
  "ownerPhone",
  "authorizedBy",
  "signature",
  "photos",
  "contactEmail",
  "whatsappOptIn",
  "version",
]);

function isValidBackupEmail(value) {
  return typeof value === "string" &&
    value.length <= 254 &&
    /^[^\s@,;<>()]+@[^\s@,;<>()]+\.[^\s@,;<>()]+$/.test(value);
}

function normalizeBackupRepair(repair) {
  if (!repair || typeof repair !== "object" || Array.isArray(repair) ||
      Object.keys(repair).some((key) => !repairBackupFields.has(key)) ||
      !isValidRepair(repair)) {
    return null;
  }
  if (repair.version !== undefined &&
      (!Number.isSafeInteger(repair.version) || repair.version < 1)) {
    return null;
  }
  if (repair.createdAt !== undefined && repair.createdAt !== null &&
      (typeof repair.createdAt !== "string" || repair.createdAt.length > 40)) {
    return null;
  }
  if (repair.ownerEmail !== undefined && !isValidBackupEmail(repair.ownerEmail)) {
    return null;
  }
  if (repair.ownerPhone !== undefined &&
      (typeof repair.ownerPhone !== "string" || normalizePhone(repair.ownerPhone) !== repair.ownerPhone)) {
    return null;
  }
  const { version, ...backupRepair } = repair;
  return backupRepair;
}

export function createApp({ config, mailer, database, whatsapp, log = console, now = Date.now, sleep }) {
  const ipLimiter = createRateLimiter({ limit: config.limits.perIpPerHour, windowMs: HOUR, now });
  const emailLimiter = createRateLimiter({ limit: config.limits.perEmailPerHour, windowMs: HOUR, now });
  const authLimiter = createRateLimiter({ limit: 10, windowMs: 15 * 60 * 1000, now });
  const phoneCodeIpLimiter = createRateLimiter({ limit: 5, windowMs: 15 * 60 * 1000, now });
  const phoneCodeLimiter = createRateLimiter({ limit: 3, windowMs: 15 * 60 * 1000, now });
  const lookupLimiter = createRateLimiter({ limit: 20, windowMs: HOUR, now });
  const orderCodeLimiter = createRateLimiter({ limit: 5, windowMs: HOUR, now });

  function clientIp(req) {
    if (config.trustProxy) {
      // Con un proxy inverso propio (nginx), la última dirección de la lista
      // es la que añadió el proxy; las anteriores las puede falsear el cliente.
      const forwarded = String(req.headers["x-forwarded-for"] || "").split(",").map((p) => p.trim()).filter(Boolean);
      if (forwarded.length > 0) return forwarded[forwarded.length - 1];
    }
    return req.socket.remoteAddress || "unknown";
  }

  function send(res, status, payload, headers = {}) {
    const body = JSON.stringify(payload);
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Length": Buffer.byteLength(body),
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    });
    res.end(body);
  }

  function corsHeaders(req) {
    const origin = req.headers.origin;
    if (origin && config.allowedOrigins.includes(origin)) {
      return {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Headers": "Content-Type, X-Api-Key, Authorization, If-None-Match",
        "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
        "Access-Control-Expose-Headers": "ETag",
        Vary: "Origin",
      };
    }
    return {};
  }

  function requireDatabase() {
    if (!database) throw new HttpError(503, "La base de datos compartida no está configurada.");
  }

  function getSession(req) {
    const authorization = String(req.headers.authorization || "");
    const match = /^Bearer\s+(.+)$/i.exec(authorization);
    return match ? verifySessionToken(match[1], config.sessionSecret, now()) : null;
  }

  function requireSession(req) {
    const session = getSession(req);
    if (!session) throw new HttpError(401, "Inicia sesión para continuar.");
    return session;
  }

  function requireAdmin(req) {
    const session = requireSession(req);
    if (session.role !== "admin") throw new HttpError(403, "No tienes permisos para esta operación.");
    return session;
  }

  const { handleCustomerWarranties, handleInventory } = createAdminHandlers({
    database,
    requireDatabase,
    requireAdmin,
    readBody,
    parseJson,
    send,
    HttpError,
  });

  function takeAuthLimit(req) {
    const result = authLimiter.take(clientIp(req));
    if (!result.allowed) {
      throw new HttpError(429, "No se pudo completar el acceso. Inténtalo de nuevo más tarde.", {
        "Retry-After": String(result.retryAfterSec),
      });
    }
  }

  async function handleAuth(req, res, pathname, cors) {
    requireDatabase();
    if (req.method === "GET" && pathname === "/api/auth/me") {
      const session = requireSession(req);
      send(res, 200, { account: { email: session.email, role: session.role, phone: session.phone } }, cors);
      return;
    }
    if (req.method === "POST" && pathname === "/api/auth/phone/request") {
      const body = parseJson(await readBody(req, config.limits.bodyBytes));
      const phone = normalizePhone(body?.phone);
      if (!phone) throw new HttpError(422, "Escribe el celular con código de país, por ejemplo +573001234567.");
      const ipRate = phoneCodeIpLimiter.take(clientIp(req));
      const phoneRate = phoneCodeLimiter.take(phone);
      if (!ipRate.allowed || !phoneRate.allowed) {
        throw new HttpError(429, "No se pudo enviar el código. Inténtalo más tarde.", {
          "Retry-After": String(Math.max(ipRate.retryAfterSec || 0, phoneRate.retryAfterSec || 0)),
        });
      }
      const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
      await database.savePhoneLoginCode(
        phone,
        hashPhoneCode(phone, code, config.sessionSecret),
        now() + 10 * 60 * 1000,
      );
      try {
        await whatsapp.sendLoginCode(phone, code);
      } catch (error) {
        log.error(`No se pudo enviar el código de acceso por WhatsApp: ${error?.message || error}`);
        throw new HttpError(502, "No se pudo enviar el código por WhatsApp. Revisa la configuración del servidor.");
      }
      send(res, 200, { ok: true, message: "Si el número está disponible, recibirás un código por WhatsApp." }, cors);
      return;
    }
    if (req.method === "POST" && pathname === "/api/auth/phone/verify") {
      takeAuthLimit(req);
      const body = parseJson(await readBody(req, config.limits.bodyBytes));
      const phone = normalizePhone(body?.phone);
      const code = typeof body?.code === "string" ? body.code.trim() : "";
      if (!phone || !/^\d{6}$/.test(code)) {
        throw new HttpError(422, "El celular o el código no son válidos.");
      }
      const valid = await database.consumePhoneLoginCode(
        phone,
        hashPhoneCode(phone, code, config.sessionSecret),
        now(),
      );
      if (!valid) throw new HttpError(401, "El código no es válido o venció. Solicita uno nuevo.");
      const stored = await database.getOrCreatePhoneAccount(phone);
      if (!stored || stored.role !== "client") {
        throw new HttpError(403, "Esta cuenta no puede ingresar desde el acceso de cliente.");
      }
      const account = { email: stored.email, role: stored.role, phone: stored.phone };
      const token = createSessionToken(account, config.sessionSecret, now());
      send(res, 200, { token, account }, cors);
      return;
    }
    if (req.method !== "POST" || !["/api/auth/login", "/api/auth/register"].includes(pathname)) {
      throw new HttpError(404, "No encontrado.");
    }
    takeAuthLimit(req);
    const body = parseJson(await readBody(req, config.limits.bodyBytes));
    const email = normalizeEmail(body?.email);
    const validationError = validateCredentials(email, body?.password);
    if (validationError) throw new HttpError(422, validationError);
    let account;
    if (pathname === "/api/auth/register") {
      try {
        const passwordHash = await hashPassword(body.password);
        await database.createAccount(email, passwordHash);
      } catch (error) {
        if (["23505", "ER_DUP_ENTRY"].includes(error.code)) {
          throw new HttpError(409, "Ya existe una cuenta con ese correo.");
        }
        throw error;
      }
      account = { email, role: "client" };
      send(res, 201, { account }, cors);
      return;
    } else {
      const stored = await database.getAccount(email);
      const valid = stored && await verifyPassword(body.password, stored.passwordHash);
      if (!valid) throw new HttpError(401, "El correo o la contraseña no son correctos.");
      account = { email: stored.email, role: stored.role };
    }
    const token = createSessionToken(account, config.sessionSecret, now());
    send(res, 200, { token, account }, cors);
  }

  async function handleRepairs(req, res, pathname, cors) {
    requireDatabase();
    const session = requireSession(req);
    if (req.method === "POST" && pathname === "/api/repairs/next-id") {
      send(res, 200, { id: await database.nextRepairId() }, cors);
      return;
    }
    if (req.method === "GET" && pathname === "/api/repairs") {
      const revision = await database.getRepairSyncRevision();
      const etag = `"repairs-${revision}"`;
      const responseHeaders = {
        ...cors,
        ETag: etag,
        "Cache-Control": "private, no-cache",
        Vary: cors.Vary ? `${cors.Vary}, Authorization` : "Authorization",
      };
      if (req.headers["if-none-match"] === etag) {
        res.writeHead(304, responseHeaders);
        res.end();
        return;
      }
      send(res, 200, { repairs: await database.listRepairs(session) }, responseHeaders);
      return;
    }
    if (req.method === "POST" && pathname === "/api/repairs/import") {
      const adminSession = requireAdmin(req);
      const body = parseJson(await readBody(req, config.limits.repairImportBytes));
      const repair = normalizeBackupRepair(body?.repair);
      if (!repair) throw new HttpError(422, "La orden del respaldo no es válida.");
      try {
        const importedRepair = await database.createRepair(adminSession, repair);
        send(res, 201, { repair: importedRepair }, cors);
      } catch (error) {
        if (["ER_DUP_ENTRY", "23505"].includes(error.code)) {
          throw new HttpError(409, "La orden ya existe.");
        }
        throw error;
      }
      return;
    }
    if (req.method === "POST" && pathname === "/api/repairs") {
      const body = parseJson(await readBody(req, config.limits.bodyBytes));
      if (!isValidRepair(body?.repair)) throw new HttpError(422, "La orden no es válida.");
      const repair = await database.createRepair(session, body.repair);
      send(res, 201, { repair }, cors);
      return;
    }
    const updateMatch = /^\/api\/repairs\/(REP-\d{4,8})$/.exec(pathname);
    if (req.method === "PATCH" && updateMatch) {
      const adminSession = requireAdmin(req);
      const body = parseJson(await readBody(req, config.limits.bodyBytes));
      const patch = body?.patch;
      if (!Number.isSafeInteger(body?.expectedVersion) || body.expectedVersion < 1 ||
          !patch || typeof patch !== "object" || Array.isArray(patch)) {
        throw new HttpError(422, "La versión o los cambios de la orden no son válidos.");
      }
      const keys = Object.keys(patch);
      if (keys.length === 0 || keys.some((key) => !["status", "photos"].includes(key))) {
        throw new HttpError(422, "Solo se permite actualizar el estado o las fotos de la orden.");
      }
      if (patch.status !== undefined &&
          !["Recibido", "En diagnóstico", "Esperando repuesto", "En reparación", "Listo para entregar", "Entregado"].includes(patch.status)) {
        throw new HttpError(422, "El estado de la orden no es válido.");
      }
      if (patch.photos !== undefined &&
          (!Array.isArray(patch.photos) || patch.photos.length > 3 ||
            patch.photos.some((photo) =>
              typeof photo !== "string" ||
              photo.length > 2_500_000 ||
              !/^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(photo),
            ))) {
        throw new HttpError(422, "Las fotos de la orden no son válidas.");
      }
      const repair = await database.updateRepair(
        updateMatch[1],
        body.expectedVersion,
        { ...patch, updated: new Date(now()).toISOString() },
        adminSession.email,
      );
      if (!repair) throw new HttpError(404, "No se encontró la orden.");
      if (repair.conflict) {
        throw new HttpError(409, "La orden cambió en otra sesión. Actualiza la lista e inténtalo de nuevo.");
      }
      send(res, 200, { repair }, cors);
      return;
    }
    const historyMatch = /^\/api\/repairs\/(REP-\d{4,8})\/status-history$/.exec(pathname);
    if (req.method === "GET" && historyMatch) {
      requireAdmin(req);
      const query = new URL(req.url, "http://localhost").searchParams;
      const beforeId = query.get("beforeId");
      const limit = query.has("limit") ? Number(query.get("limit")) : 50;
      if ((beforeId !== null &&
            (!/^[1-9]\d{0,19}$/.test(beforeId) || BigInt(beforeId) > 18446744073709551615n)) ||
          !Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
        throw new HttpError(422, "Los parámetros de paginación no son válidos.");
      }
      const history = await database.listRepairStatusHistory(historyMatch[1], {
        beforeId: beforeId || "18446744073709551615",
        limit,
      });
      send(res, 200, {
        history,
        nextBeforeId: history.length === limit ? history[history.length - 1].id : null,
      }, cors);
      return;
    }
    const deleteMatch = /^\/api\/repairs\/(REP-\d{4,8})$/.exec(pathname);
    if (req.method === "DELETE" && deleteMatch) {
      requireAdmin(req);
      await database.deleteRepair(deleteMatch[1]);
      send(res, 200, { ok: true }, cors);
      return;
    }
    throw new HttpError(404, "No encontrado.");
  }

  async function handleRepairLookup(req, res, cors) {
    requireDatabase();
    if (req.method !== "POST") throw new HttpError(405, "Método no permitido.", { Allow: "POST, OPTIONS" });
    const rate = lookupLimiter.take(clientIp(req));
    if (!rate.allowed) {
      throw new HttpError(429, "Demasiadas consultas. Intenta más tarde.", {
        "Retry-After": String(rate.retryAfterSec),
      });
    }
    const body = parseJson(await readBody(req, 4_096));
    const id = typeof body?.id === "string" ? body.id.trim().toUpperCase() : "";
    const phone = typeof body?.phone === "string" ? body.phone.trim() : "";
    if (!/^REP-\d{4,8}$/.test(id) || phone.length < 7 || phone.length > 30) {
      throw new HttpError(422, "El código o teléfono no son válidos.");
    }
    const repair = await database.lookupRepair(id, phone);
    send(res, 200, { repair: repair ?? null }, cors);
  }

  async function handleSettings(req, res, pathname, cors) {
    requireDatabase();
    const session = requireSession(req);
    const key = decodeURIComponent(pathname.slice("/api/settings/".length));
    if (!["workshop-settings", "workshop-logo", "workshop-warranties"].includes(key)) {
      throw new HttpError(404, "No encontrado.");
    }
    if (req.method === "GET") {
      if (session.role !== "admin" && key !== "workshop-settings") {
        throw new HttpError(403, "No tienes permisos para esta operación.");
      }
      let value = await database.getSetting(key);
      if (session.role !== "admin" && key === "workshop-settings" && value) {
        const { businessName, businessPhone, businessEmail, businessAddress, serviceHours, responseTime, currency, timezone } = value;
        value = { businessName, businessPhone, businessEmail, businessAddress, serviceHours, responseTime, currency, timezone };
      }
      send(res, 200, { value }, cors);
      return;
    }
    if (session.role !== "admin") throw new HttpError(403, "No tienes permisos para esta operación.");
    if (req.method === "PUT") {
      const body = parseJson(await readBody(req, 3_500_000));
      await database.saveSetting(key, body?.value);
      send(res, 200, { ok: true }, cors);
      return;
    }
    if (req.method === "DELETE") {
      await database.deleteSetting(key);
      send(res, 200, { ok: true }, cors);
      return;
    }
    throw new HttpError(405, "Método no permitido.", { Allow: "GET, PUT, DELETE, OPTIONS" });
  }

  async function handleWhatsAppRepairCode(req, res, cors) {
    requireDatabase();
    const session = requireSession(req);
    if (req.method !== "POST") throw new HttpError(405, "Método no permitido.", { Allow: "POST, OPTIONS" });
    const rate = orderCodeLimiter.take(session.phone || session.email);
    if (!rate.allowed) {
      throw new HttpError(429, "No se pudo enviar el mensaje. Inténtalo más tarde.", {
        "Retry-After": String(rate.retryAfterSec),
      });
    }
    const body = parseJson(await readBody(req, 4_096));
    const id = typeof body?.repairId === "string" ? body.repairId.trim().toUpperCase() : "";
    if (!/^REP-\d{4,8}$/.test(id)) throw new HttpError(422, "El código de reparación no es válido.");
    const repair = await database.getRepairById(id);
    if (!repair) throw new HttpError(404, "No se encontró la reparación.");
    let destination;
    if (session.role === "admin") {
      destination = normalizePhone(repair.phone);
    } else if (session.phone &&
      (repair.owner_email === session.email ||
        (!repair.owner_email && repair.owner_phone === session.phone && normalizePhone(repair.phone) === session.phone))) {
      destination = session.phone;
    } else {
      throw new HttpError(403, "No tienes permisos para enviar este código.");
    }
    if (repair.whatsapp_opt_in !== true) {
      throw new HttpError(403, "No se registró autorización para recibir mensajes por WhatsApp.");
    }
    if (!destination) throw new HttpError(422, "El celular debe incluir el código de país para WhatsApp.");
    try {
      await whatsapp.sendRepairCode(destination, id);
    } catch (error) {
      log.error(`No se pudo enviar el código de ${id} por WhatsApp: ${error?.message || error}`);
      throw new HttpError(502, "No se pudo enviar el código por WhatsApp. Inténtalo de nuevo más tarde.");
    }
    send(res, 200, { ok: true }, cors);
  }

  async function handleReceipt(req, res, cors) {
    const ip = clientIp(req);
    const ipCheck = ipLimiter.take(ip);
    if (!ipCheck.allowed) {
      throw new HttpError(429, "Demasiadas solicitudes. Intenta más tarde.", { "Retry-After": String(ipCheck.retryAfterSec) });
    }

    const session = getSession(req);
    const authorizedWithApiKey = config.apiKey && sameSecret(req.headers["x-api-key"], config.apiKey);
    if (!authorizedWithApiKey && !session) {
      throw new HttpError(401, "No autorizado.");
    }
    if (!String(req.headers["content-type"] || "").toLowerCase().startsWith("application/json")) {
      throw new HttpError(415, "Se esperaba application/json.");
    }

    const body = parseJson(await readBody(req, config.limits.bodyBytes));

    const parsed = parseReceiptRequest(body);
    if (!parsed.ok) throw new HttpError(422, parsed.error);

    let receipt = parsed.value;
    if (session) {
      requireDatabase();
      const stored = await database.getRepairById(parsed.value.repair.id);
      const isOwner = stored && (
        session.role === "admin" ||
        stored.owner_email === session.email ||
        (!stored.owner_email && session.phone && stored.owner_phone === session.phone)
      );
      if (!isOwner) throw new HttpError(403, "No tienes permisos para enviar esta constancia.");
      const savedEmail = typeof stored.contact_email === "string" ? stored.contact_email.trim() : "";
      if (!savedEmail || normalizeEmail(parsed.value.email) !== normalizeEmail(savedEmail)) {
        throw new HttpError(403, "El correo no coincide con el registrado en la orden.");
      }
      const savedReceipt = parseReceiptRequest({
        email: savedEmail,
        repair: {
          id: stored.id,
          customer: stored.customer,
          phone: stored.phone,
          device: stored.device,
          problem: stored.problem,
          status: stored.status,
          authorizedBy: stored.authorized_by || "",
          updated: stored.updated || "",
          signature: stored.signature || "",
        },
      });
      if (!savedReceipt.ok) throw new HttpError(422, savedReceipt.error);
      receipt = savedReceipt.value;
    }

    const emailCheck = emailLimiter.take(receipt.email.toLowerCase());
    if (!emailCheck.allowed) {
      throw new HttpError(429, "Ya se enviaron varios correos a esta dirección. Intenta más tarde.", {
        "Retry-After": String(emailCheck.retryAfterSec),
      });
    }

    const message = buildReceiptEmail(receipt, config.business);
    try {
      await sendWithRetry(mailer, message, { log, sleep });
    } catch (error) {
      log.error(`No se pudo enviar ${receipt.repair.id} a ${maskEmail(receipt.email)}: ${error?.message || error}`);
      throw new HttpError(502, "No se pudo enviar el correo. Intenta de nuevo en unos minutos.");
    }
    log.info(`Constancia ${receipt.repair.id} enviada a ${maskEmail(receipt.email)}`);
    send(res, 200, { ok: true }, cors);
  }

  const server = http.createServer(async (req, res) => {
    const cors = corsHeaders(req);
    try {
      const { pathname } = new URL(req.url, "http://localhost");

      if (req.method === "OPTIONS") {
        res.writeHead(204, cors);
        res.end();
        return;
      }
      if (req.method === "GET" && pathname === "/ready") {
        if (!database) {
          send(res, 503, { status: "unavailable", dependency: "database" });
          return;
        }
        try {
          await database.checkHealth();
          send(res, 200, { status: "ok" });
        } catch (error) {
          log.warn(`La base de datos no está disponible: ${error?.message || error}`);
          send(res, 503, { status: "unavailable", dependency: "database" });
        }
        return;
      }
      if (req.method === "GET" && pathname === "/health") {
        send(res, 200, { status: "ok" });
        return;
      }
      if (pathname.startsWith("/api/auth/")) {
        await handleAuth(req, res, pathname, cors);
        return;
      }
      if (pathname === "/api/repairs/lookup") {
        await handleRepairLookup(req, res, cors);
        return;
      }
      if (pathname === "/api/repairs" || pathname.startsWith("/api/repairs/")) {
        await handleRepairs(req, res, pathname, cors);
        return;
      }
      if (pathname === "/api/customers/warranties") {
        await handleCustomerWarranties(req, res, pathname, cors);
        return;
      }
      if (pathname.startsWith("/api/settings/")) {
        await handleSettings(req, res, pathname, cors);
        return;
      }
      if (pathname === "/api/inventory" || pathname.startsWith("/api/inventory/")) {
        await handleInventory(req, res, pathname, cors);
        return;
      }
      if (pathname === "/api/whatsapp/repair-code") {
        await handleWhatsAppRepairCode(req, res, cors);
        return;
      }
      if (pathname === "/api/notifications/receipt") {
        if (req.method !== "POST") throw new HttpError(405, "Método no permitido.", { Allow: "POST, OPTIONS" });
        await handleReceipt(req, res, cors);
        return;
      }
      throw new HttpError(404, "No encontrado.");
    } catch (error) {
      if (error instanceof HttpError) {
        send(res, error.status, { ok: false, error: error.message }, { ...cors, ...error.headers });
      } else {
        log.error(`Error inesperado: ${error?.stack || error}`);
        if (!res.headersSent) {
          const status = ["23505", "ER_DUP_ENTRY"].includes(error?.code) ? 409 : 500;
          send(res, status, { ok: false, error: status === 409 ? "El registro ya existe." : "Error interno." }, cors);
        }
      }
    }
  });

  // Defensa contra conexiones lentas o colgadas.
  server.headersTimeout = 15_000;
  server.requestTimeout = 30_000;
  server.keepAliveTimeout = 5_000;
  server.on("close", () => {
    ipLimiter.stop();
    emailLimiter.stop();
    authLimiter.stop();
    phoneCodeIpLimiter.stop();
    phoneCodeLimiter.stop();
    lookupLimiter.stop();
    orderCodeLimiter.stop();
  });
  return server;
}
