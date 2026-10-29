import {
  clearClientSession as clearStoredSession,
  readClientSession as readStoredSession,
  saveClientSession as saveStoredSession,
  loginSharedAccount,
  registerSharedAccount,
} from "./dbService";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 10;
const MAX_PASSWORD_LENGTH = 200;

function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

function validateCredentials(email, password) {
  if (typeof email !== "string" || typeof password !== "string") {
    return "El correo o la contraseña no son válidos.";
  }
  if (!EMAIL_PATTERN.test(email)) return "Escribe un correo electrónico válido.";
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `La contraseña debe tener mínimo ${MIN_PASSWORD_LENGTH} caracteres.`;
  }
  if (password.length > MAX_PASSWORD_LENGTH) return "La contraseña es demasiado larga.";
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return "La contraseña debe incluir al menos una letra y un número.";
  }
  return "";
}

export const readClientSession = readStoredSession;
export const saveClientSession = saveStoredSession;
export const clearClientSession = clearStoredSession;

export async function registerClient(email, password) {
  if (typeof email !== "string") return { error: "Escribe un correo electrónico válido." };
  const normalizedEmail = normalizeEmail(email);
  const validationError = validateCredentials(normalizedEmail, password);
  if (validationError) return { error: validationError };
  try {
    return { account: await registerSharedAccount(normalizedEmail, password) };
  } catch (error) {
    return { error: error.message };
  }
}

export async function authenticateClient(email, password) {
  if (typeof email !== "string" || typeof password !== "string") {
    return { error: "El correo o la contraseña no son válidos." };
  }
  const normalizedEmail = normalizeEmail(email);
  const validationError = validateCredentials(normalizedEmail, password);
  if (validationError) return { error: "El correo o la contraseña no son válidos." };

  try {
    const account = await loginSharedAccount(normalizedEmail, password);
    if (!account) return { error: "No se pudo iniciar sesión. Inténtalo de nuevo." };
    if (account.role !== "client") {
      await clearClientSession();
      return { error: "Usa el acceso administrativo para esta cuenta." };
    }
    return { account };
  } catch (error) {
    return { error: error.message };
  }
}

export async function authenticateAdmin(email, password) {
  try {
    const account = await loginSharedAccount(normalizeEmail(email), password);
    if (!account) return { error: "No se pudo iniciar sesión. Inténtalo de nuevo." };
    if (account.role !== "admin") {
      await clearClientSession();
      return { error: "Esta cuenta no tiene permisos de administrador." };
    }
    return { account };
  } catch (error) {
    return { error: error.message };
  }
}
