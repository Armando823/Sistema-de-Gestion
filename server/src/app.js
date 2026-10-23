import http from "node:http";
import { timingSafeEqual } from "node:crypto";
import { createRateLimiter } from "./rateLimiter.js";
import { sendWithRetry } from "./mailer.js";
import { parseReceiptRequest, buildReceiptEmail } from "./receiptEmail.js";
import { normalizeEmail, verifySessionToken } from "./auth.js";
import { normalizePhone } from "./phone.js";
import { createAdminHandlers } from "./routes/admin.js";
import { createAuthHandlers } from "./routes/auth.js";
import { createRepairHandlers } from "./routes/repairs.js";

const HOUR = 60 * 60 * 1000;

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
  const { handleRepairs, handleRepairLookup } = createRepairHandlers({
    database,
    config,
    requireDatabase,
    requireSession,
    requireAdmin,
    readBody,
    parseJson,
    send,
    HttpError,
    lookupLimiter,
    clientIp,
    now,
    parseReceiptRequest,
  });
  const { handleAuth } = createAuthHandlers({
    database,
    config,
    requireDatabase,
    requireSession,
    readBody,
    parseJson,
    send,
    HttpError,
    authLimiter,
    phoneCodeIpLimiter,
    phoneCodeLimiter,
    clientIp,
    now,
    whatsapp,
    log,
  });

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
