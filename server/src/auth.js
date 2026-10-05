import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHmac } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const TOKEN_TTL_SECONDS = 60 * 60 * 12;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(email) {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

export function validateCredentials(email, password) {
  if (!EMAIL_PATTERN.test(email) || email.length > 254) return "El correo no es válido.";
  if (typeof password !== "string" || password.length < 8 || password.length > 200) {
    return "La contraseña debe tener entre 8 y 200 caracteres.";
  }
  return "";
}

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export async function verifyPassword(password, stored) {
  if (typeof stored !== "string") return false;
  const [algorithm, saltHex, hashHex, extra] = stored.split("$");
  if (algorithm !== "scrypt" || extra !== undefined || !/^[a-f0-9]{32}$/i.test(saltHex) ||
      !/^[a-f0-9]{128}$/i.test(hashHex)) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = await scrypt(password, Buffer.from(saltHex, "hex"), expected.length);
  return timingSafeEqual(actual, expected);
}

export function createSessionToken(account, secret, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({
    email: account.email,
    role: account.role,
    ...(account.phone ? { phone: account.phone } : {}),
    exp: Math.floor(now / 1000) + TOKEN_TTL_SECONDS,
  })).toString("base64url");
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifySessionToken(token, secret, now = Date.now()) {
  if (typeof token !== "string") return null;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra !== undefined) return null;
  const expected = createHmac("sha256", secret).update(payload).digest();
  let actual;
  try {
    actual = Buffer.from(signature, "base64url");
  } catch {
    return null;
  }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (typeof session.email !== "string" ||
        !["admin", "client"].includes(session.role) ||
        !Number.isInteger(session.exp) ||
        session.exp <= Math.floor(now / 1000)) return null;
    return {
      email: session.email,
      role: session.role,
      ...(typeof session.phone === "string" ? { phone: session.phone } : {}),
    };
  } catch {
    return null;
  }
}
