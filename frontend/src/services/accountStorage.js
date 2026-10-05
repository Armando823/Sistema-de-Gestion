import {
  clearClientSession as clearStoredSession,
  createAccount,
  listAccounts,
  readClientSession as readStoredSession,
  saveClientSession as saveStoredSession,
  updateAccountPassword,
  usesSharedApi,
  loginSharedAccount,
  registerSharedAccount,
} from "./dbService";
import { hashPassword, verifyPassword } from "../utils/password";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 200;

function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

export const readClientSession = readStoredSession;
export const saveClientSession = saveStoredSession;
export const clearClientSession = clearStoredSession;

function validateCredentials(email, password) {
  if (typeof email !== "string" || typeof password !== "string") {
    return "El correo o la contraseña no son válidos.";
  }
  if (!EMAIL_PATTERN.test(email)) return "Escribe un correo electrónico válido.";
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `La contraseña debe tener mínimo ${MIN_PASSWORD_LENGTH} caracteres.`;
  }
  if (password.length > MAX_PASSWORD_LENGTH) return "La contraseña es demasiado larga.";
  return "";
}

export async function registerClient(email, password) {
  if (typeof email !== "string") return { error: "Escribe un correo electrónico válido." };
  const normalizedEmail = normalizeEmail(email);
  const validationError = validateCredentials(normalizedEmail, password);
  if (validationError) return { error: validationError };

  if (usesSharedApi()) {
    try {
      return { account: await registerSharedAccount(normalizedEmail, password) };
    } catch (error) {
      return { error: error.message };
    }
  }

  const accounts = await listAccounts();
  if (accounts.some((account) => account.email === normalizedEmail)) {
    return { error: "Ya existe una cuenta con ese correo." };
  }

  const account = {
    email: normalizedEmail,
    passwordHash: await hashPassword(password),
    createdAt: new Date().toISOString(),
  };
  if (!await createAccount(account)) {
    return { error: "No se pudo guardar la cuenta en este navegador." };
  }
  return { account: { email: normalizedEmail } };
}

export async function authenticateClient(email, password) {
  if (typeof email !== "string" || typeof password !== "string") {
    return { error: "El correo o la contraseña no son válidos." };
  }
  const normalizedEmail = normalizeEmail(email);
  const validationError = validateCredentials(normalizedEmail, password);
  if (validationError) return { error: "El correo o la contraseña no son válidos." };

  if (usesSharedApi()) {
    try {
      const account = await loginSharedAccount(normalizedEmail, password);
      if (account.role !== "client") {
        await clearClientSession();
        return { error: "Usa el acceso administrativo para esta cuenta." };
      }
      return { account };
    } catch (error) {
      return { error: error.message };
    }
  }

  const account = (await listAccounts()).find((candidate) => candidate.email === normalizedEmail);
  const verification = account
    ? await verifyPassword(password, account.passwordHash)
    : { valid: false, needsRehash: false };
  if (account && verification.valid && verification.needsRehash) {
    account.passwordHash = await hashPassword(password);
    if (!await updateAccountPassword(account.email, account.passwordHash)) {
      return { error: "No se pudo actualizar la protección de la cuenta." };
    }
  }
  return account
    ? verification.valid
      ? { account: { email: account.email } }
      : { error: "El correo o la contraseña no son correctos." }
    : { error: "El correo o la contraseña no son correctos." };
}

export async function authenticateAdmin(email, password) {
  if (!usesSharedApi()) return { error: "El acceso administrativo compartido no está configurado." };
  try {
    const account = await loginSharedAccount(normalizeEmail(email), password);
    if (account.role !== "admin") {
      await clearClientSession();
      return { error: "Esta cuenta no tiene permisos de administrador." };
    }
    return { account };
  } catch (error) {
    return { error: error.message };
  }
}
