import {
  clearClientSession as clearStoredSession,
  loginSharedAccount,
} from "./dbService";

export const clearClientSession = clearStoredSession;

export async function authenticateAdmin(email, password) {
  try {
    const account = await loginSharedAccount(email.trim().toLowerCase(), password);
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
