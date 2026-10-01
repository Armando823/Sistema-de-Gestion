// Autenticación del administrador (proceso principal de Electron).
// La contraseña se define la primera vez que se abre la app y se guarda como
// hash scrypt con sal aleatoria. Nunca se guarda ni se compila en claro.
const crypto = require("node:crypto");

const CREDENTIAL_KEY = "admin_credential";
const ADMIN_USERNAME = "admin";
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 200;
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MS = 30_000;
const KEY_LENGTH = 64;

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, KEY_LENGTH);
}

function validatePassword(password) {
  if (typeof password !== "string") return "Contraseña no válida.";
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `La contraseña debe tener mínimo ${MIN_PASSWORD_LENGTH} caracteres.`;
  }
  if (password.length > MAX_PASSWORD_LENGTH) return "La contraseña es demasiado larga.";
  return "";
}

// `store` debe ofrecer get(key) y set(key, value) (p. ej. la tabla settings).
// `now` se puede inyectar para probar el bloqueo temporal.
function createAdminAuth(store, now = () => Date.now()) {
  let failedAttempts = 0;
  let lockedUntil = 0;

  function isConfigured() {
    const credential = store.get(CREDENTIAL_KEY);
    return Boolean(credential && credential.salt && credential.hash);
  }

  function setup(password) {
    if (isConfigured()) return { error: "El administrador ya tiene una contraseña." };
    const validationError = validatePassword(password);
    if (validationError) return { error: validationError };

    const salt = crypto.randomBytes(16);
    store.set(CREDENTIAL_KEY, {
      v: 1,
      salt: salt.toString("base64"),
      hash: hashPassword(password, salt).toString("base64"),
    });
    return { ok: true };
  }

  function login(username, password) {
    if (now() < lockedUntil) {
      const seconds = Math.ceil((lockedUntil - now()) / 1000);
      return { error: `Demasiados intentos. Espera ${seconds} segundos.` };
    }
    const credential = store.get(CREDENTIAL_KEY);
    if (!credential || typeof password !== "string" || password.length > MAX_PASSWORD_LENGTH) {
      return { error: "El usuario o la contraseña no son correctos." };
    }

    const expected = Buffer.from(credential.hash, "base64");
    const actual = hashPassword(password, Buffer.from(credential.salt, "base64"));
    const validUser = String(username || "").trim().toLowerCase() === ADMIN_USERNAME;
    const validPassword =
      actual.length === expected.length && crypto.timingSafeEqual(actual, expected);

    if (validUser && validPassword) {
      failedAttempts = 0;
      return { ok: true };
    }
    failedAttempts += 1;
    if (failedAttempts >= MAX_FAILED_ATTEMPTS) {
      failedAttempts = 0;
      lockedUntil = now() + LOCK_MS;
    }
    return { error: "El usuario o la contraseña no son correctos." };
  }

  return { isConfigured, setup, login };
}

module.exports = { createAdminAuth, CREDENTIAL_KEY, ADMIN_USERNAME };
