import http from "node:http";
import { timingSafeEqual } from "node:crypto";
import { createRateLimiter } from "./rateLimiter.js";
import { sendWithRetry } from "./mailer.js";
import { parseReceiptRequest, buildReceiptEmail } from "./receiptEmail.js";
import { createSessionToken, hashPassword, normalizeEmail, validateCredentials, verifyPassword, verifySessionToken } from "./auth.js";

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
    const declared = Number(req.headers["content-length"]);
    if (Number.isFinite(declared) && declared > maxBytes) {
      reject(new HttpError(413, "La petición es demasiado grande."));
      return;
    }
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new HttpError(413, "La petición es demasiado grande."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
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

export function createApp({ config, mailer, database, log = console, now = Date.now, sleep }) {
  const ipLimiter = createRateLimiter({ limit: config.limits.perIpPerHour, windowMs: HOUR, now });
  const emailLimiter = createRateLimiter({ limit: config.limits.perEmailPerHour, windowMs: HOUR, now });
  const authLimiter = createRateLimiter({ limit: 10, windowMs: 15 * 60 * 1000, now });
  const lookupLimiter = createRateLimiter({ limit: 20, windowMs: HOUR, now });

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
        "Access-Control-Allow-Headers": "Content-Type, X-Api-Key, Authorization",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
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
      send(res, 200, { account: { email: session.email, role: session.role } }, cors);
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
        if (error.code === "23505") throw new HttpError(409, "Ya existe una cuenta con ese correo.");
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
      send(res, 200, { repairs: await database.listRepairs(session) }, cors);
      return;
    }
    if (req.method === "PUT" && pathname === "/api/repairs") {
      const body = parseJson(await readBody(req, 12_000_000));
      if (!Array.isArray(body?.repairs) || body.repairs.length > 10_000) {
        throw new HttpError(422, "La lista de órdenes no es válida.");
      }
      if (body.repairs.some((repair) => !isValidRepair(repair))) {
        throw new HttpError(422, "Hay órdenes inválidas en la lista.");
      }
      await database.saveRepairs(session, body.repairs);
      send(res, 200, { ok: true }, cors);
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

  async function handleInventory(req, res, pathname, cors) {
    requireDatabase();
    requireAdmin(req);
    if (req.method === "GET" && pathname === "/api/inventory") {
      send(res, 200, { items: await database.loadInventory() }, cors);
      return;
    }
    if (req.method === "PUT" && pathname === "/api/inventory") {
      const body = parseJson(await readBody(req, 1_000_000));
      if (!Array.isArray(body?.items) || body.items.length > 10_000) {
        throw new HttpError(422, "La lista de repuestos no es válida.");
      }
      await database.saveInventory(body.items);
      send(res, 200, { ok: true }, cors);
      return;
    }
    throw new HttpError(404, "No encontrado.");
  }

  async function handleReceipt(req, res, cors) {
    const ip = clientIp(req);
    const ipCheck = ipLimiter.take(ip);
    if (!ipCheck.allowed) {
      throw new HttpError(429, "Demasiadas solicitudes. Intenta más tarde.", { "Retry-After": String(ipCheck.retryAfterSec) });
    }

    const authorizedWithSession = Boolean(getSession(req));
    if (config.apiKey && !sameSecret(req.headers["x-api-key"], config.apiKey) && !authorizedWithSession) {
      throw new HttpError(401, "No autorizado.");
    }
    if (!String(req.headers["content-type"] || "").toLowerCase().startsWith("application/json")) {
      throw new HttpError(415, "Se esperaba application/json.");
    }

    const body = parseJson(await readBody(req, config.limits.bodyBytes));

    const parsed = parseReceiptRequest(body);
    if (!parsed.ok) throw new HttpError(422, parsed.error);

    const emailCheck = emailLimiter.take(parsed.value.email.toLowerCase());
    if (!emailCheck.allowed) {
      throw new HttpError(429, "Ya se enviaron varios correos a esta dirección. Intenta más tarde.", {
        "Retry-After": String(emailCheck.retryAfterSec),
      });
    }

    const message = buildReceiptEmail(parsed.value, config.business);
    try {
      await sendWithRetry(mailer, message, { log, sleep });
    } catch (error) {
      log.error(`No se pudo enviar ${parsed.value.repair.id} a ${maskEmail(parsed.value.email)}: ${error?.message || error}`);
      throw new HttpError(502, "No se pudo enviar el correo. Intenta de nuevo en unos minutos.");
    }
    log.info(`Constancia ${parsed.value.repair.id} enviada a ${maskEmail(parsed.value.email)}`);
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
      if (pathname.startsWith("/api/settings/")) {
        await handleSettings(req, res, pathname, cors);
        return;
      }
      if (pathname === "/api/inventory") {
        await handleInventory(req, res, pathname, cors);
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
          const status = error?.code === "23505" ? 409 : 500;
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
    lookupLimiter.stop();
  });
  return server;
}
