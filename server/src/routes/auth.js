import { createHmac, randomInt } from "node:crypto";
import {
  createSessionToken,
  hashPassword,
  normalizeEmail,
  validateCredentials,
  verifyPassword,
} from "../auth.js";
import { normalizePhone } from "../phone.js";

function hashPhoneCode(phone, code, secret) {
  return createHmac("sha256", secret).update(`${phone}:${code}`).digest("hex");
}

export function createAuthHandlers({
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
}) {
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
      send(res, 200, {
        account: { email: session.email, role: session.role, phone: session.phone },
      }, cors);
      return;
    }
    if (req.method === "POST" && pathname === "/api/auth/phone/request") {
      const body = parseJson(await readBody(req, config.limits.bodyBytes));
      const phone = normalizePhone(body?.phone);
      if (!phone) {
        throw new HttpError(422, "Escribe el celular con código de país, por ejemplo +573001234567.");
      }
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
      send(res, 200, {
        ok: true,
        message: "Si el número está disponible, recibirás un código por WhatsApp.",
      }, cors);
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
    }
    const stored = await database.getAccount(email);
    const valid = stored && await verifyPassword(body.password, stored.passwordHash);
    if (!valid) throw new HttpError(401, "El correo o la contraseña no son correctos.");
    account = { email: stored.email, role: stored.role };
    const token = createSessionToken(account, config.sessionSecret, now());
    send(res, 200, { token, account }, cors);
  }

  return { handleAuth };
}
