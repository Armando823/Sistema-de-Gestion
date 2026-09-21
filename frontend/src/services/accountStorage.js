import {
  clearClientSession as clearStoredSession,
  createAccount,
  listAccounts,
  readClientSession as readStoredSession,
  saveClientSession as saveStoredSession,
} from "./dbService";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

export const readClientSession = readStoredSession;
export const saveClientSession = saveStoredSession;
export const clearClientSession = clearStoredSession;

async function hashPassword(password) {
  const encodedPassword = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest("SHA-256", encodedPassword);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function validateCredentials(email, password) {
  if (!EMAIL_PATTERN.test(email)) return "Escribe un correo electrónico válido.";
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `La contraseña debe tener mínimo ${MIN_PASSWORD_LENGTH} caracteres.`;
  }
  return "";
}

export async function registerClient(email, password) {
  const normalizedEmail = normalizeEmail(email);
  const validationError = validateCredentials(normalizedEmail, password);
  if (validationError) return { error: validationError };

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
  const normalizedEmail = normalizeEmail(email);
  const validationError = validateCredentials(normalizedEmail, password);
  if (validationError) return { error: "El correo o la contraseña no son válidos." };

  const passwordHash = await hashPassword(password);
  const account = (await listAccounts()).find(
    (candidate) =>
      candidate.email === normalizedEmail &&
      candidate.passwordHash === passwordHash,
  );
  return account
    ? { account: { email: account.email } }
    : { error: "El correo o la contraseña no son correctos." };
}
