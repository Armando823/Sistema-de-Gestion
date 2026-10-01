import http from "node:http";
import { timingSafeEqual, createHash } from "node:crypto";
import { createRateLimiter } from "./rateLimiter.js";
import { sendWithRetry } from "./mailer.js";
import { parseReceiptRequest, buildReceiptEmail } from "./receiptEmail.js";

const HOUR = 60 * 60 * 1000;

function sameSecret(received, expected) {
  // Se comparan hashes para que la longitud no filtre información.
  const a = createHash("sha256").update(String(received ?? "")).digest();
  const b = createHash("sha256").update(String(expected)).digest();
  return timingSafeEqual(a, b);
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

export function createApp({ config, mailer, log = console, now = Date.now, sleep }) {
  const ipLimiter = createRateLimiter({ limit: config.limits.perIpPerHour, windowMs: HOUR, now });
  const emailLimiter = createRateLimiter({ limit: config.limits.perEmailPerHour, windowMs: HOUR, now });

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
        "Access-Control-Allow-Headers": "Content-Type, X-Api-Key",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        Vary: "Origin",
      };
    }
    return {};
  }

  async function handleReceipt(req, res, cors) {
    const ip = clientIp(req);
    const ipCheck = ipLimiter.take(ip);
    if (!ipCheck.allowed) {
      throw new HttpError(429, "Demasiadas solicitudes. Intenta más tarde.", { "Retry-After": String(ipCheck.retryAfterSec) });
    }

    if (config.apiKey && !sameSecret(req.headers["x-api-key"], config.apiKey)) {
      throw new HttpError(401, "No autorizado.");
    }
    if (!String(req.headers["content-type"] || "").toLowerCase().startsWith("application/json")) {
      throw new HttpError(415, "Se esperaba application/json.");
    }

    const raw = await readBody(req, config.limits.bodyBytes);
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      throw new HttpError(400, "JSON inválido.");
    }

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
        if (!res.headersSent) send(res, 500, { ok: false, error: "Error interno." }, cors);
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
  });
  return server;
}
