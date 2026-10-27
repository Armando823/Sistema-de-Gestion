import http from "node:http";
import { randomUUID } from "node:crypto";
import { createReadStream, existsSync, statSync } from "node:fs";
import { join, extname, resolve } from "node:path";
import { createRateLimiter } from "./rateLimiter.js";
import { parseReceiptRequest } from "./receiptEmail.js";
import { verifySessionToken } from "./auth.js";
import { createAdminHandlers } from "./routes/admin.js";
import { createAuthHandlers } from "./routes/auth.js";
import { createNotificationHandlers } from "./routes/notifications.js";
import { createRepairHandlers } from "./routes/repairs.js";
import { createSettingsHandlers } from "./routes/settings.js";

const HOUR = 60 * 60 * 1000;

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

export function createApp({ config, mailer, database, whatsapp, log = console, now = Date.now, sleep, staticDir = null }) {
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

  function securityHeaders() {
    const headers = {
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    };
    if (config.production) {
      headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains";
    }
    return headers;
  }

  function send(res, status, payload, headers = {}) {
    const body = JSON.stringify(payload);
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Length": Buffer.byteLength(body),
      "Cache-Control": "no-store",
      ...securityHeaders(),
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

  async function getSession(req) {
    const authorization = String(req.headers.authorization || "");
    const match = /^Bearer\s+(.+)$/i.exec(authorization);
    if (!match) return null;
    const session = verifySessionToken(match[1], config.sessionSecret, now());
    if (!session) return null;
    if (session.sid && typeof database?.isSessionValid === "function") {
      if (!(await database.isSessionValid(session.sid))) return null;
    }
    return session;
  }

  async function requireSession(req) {
    const session = await getSession(req);
    if (!session) throw new HttpError(401, "Inicia sesión para continuar.");
    return session;
  }

  async function requireAdmin(req) {
    const session = await requireSession(req);
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
    getSession,
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
  const { handleSettings } = createSettingsHandlers({
    database,
    requireDatabase,
    requireSession,
    readBody,
    parseJson,
    send,
    HttpError,
  });
  const { handleReceipt, handleWhatsAppRepairCode } = createNotificationHandlers({
    config,
    database,
    mailer,
    whatsapp,
    log,
    sleep,
    clientIp,
    ipLimiter,
    emailLimiter,
    orderCodeLimiter,
    requireDatabase,
    requireSession,
    getSession,
    readBody,
    parseJson,
    send,
    HttpError,
  });
  const server = http.createServer(async (req, res) => {
    const requestId = randomUUID();
    req.requestId = requestId;
    res.setHeader("X-Request-Id", requestId);
    const cors = corsHeaders(req);
    try {
      const { pathname } = new URL(req.url, "http://localhost");

      // Servir archivos estáticos del frontend (SPA) si se configura staticDir.
      if (staticDir && req.method === "GET" && !pathname.startsWith("/api/") && pathname !== "/health" && pathname !== "/ready") {
        const safePath = resolve(staticDir, "." + pathname);
        if (safePath.startsWith(resolve(staticDir)) && existsSync(safePath) && statSync(safePath).isFile()) {
          const ext = extname(safePath).toLowerCase();
          const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".woff": "font/woff", ".woff2": "font/woff2" };
          res.writeHead(200, { "Content-Type": types[ext] || "application/octet-stream", "Cache-Control": "public, max-age=31536000, immutable" });
          createReadStream(safePath).pipe(res);
          return;
        }
        // SPA fallback
        const indexFile = join(staticDir, "index.html");
        if (existsSync(indexFile)) {
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          createReadStream(indexFile).pipe(res);
          return;
        }
      }

      if (req.method === "OPTIONS") {
        res.writeHead(204, { ...securityHeaders(), ...cors });
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
        log.error(`[${requestId}] Error inesperado: ${error?.stack || error}`);
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
