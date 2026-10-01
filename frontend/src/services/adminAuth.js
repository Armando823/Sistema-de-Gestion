// Acceso del administrador desde la interfaz. La verificación real ocurre en el
// proceso principal de Electron (ver adminAuth.js en la raíz del proyecto).
const adminApi = typeof window !== "undefined" ? window.electronAPI?.admin : null;

// Solo para `npm run dev` en el navegador (sin Electron). Vite elimina este
// bloque de las compilaciones de producción, así que no llega a ningún instalador.
const DEV_FALLBACK = import.meta.env.DEV
  ? { username: "admin", password: "Admin123" }
  : null;

const UNAVAILABLE = {
  error: "El acceso administrativo solo está disponible en la aplicación de escritorio.",
};

export async function getAdminStatus() {
  try {
    if (adminApi) return await adminApi.status();
  } catch {
    return { configured: true, error: "No se pudo consultar el estado del administrador." };
  }
  return DEV_FALLBACK ? { configured: true } : { configured: true, ...UNAVAILABLE };
}

export async function setupAdmin(password) {
  try {
    if (adminApi) return await adminApi.setup(password);
  } catch {
    return { error: "No se pudo guardar la contraseña." };
  }
  return UNAVAILABLE;
}

export async function loginAdmin(username, password) {
  try {
    if (adminApi) return await adminApi.login(username, password);
  } catch {
    return { error: "No se pudo verificar el acceso." };
  }
  if (DEV_FALLBACK) {
    const ok =
      username.trim().toLowerCase() === DEV_FALLBACK.username &&
      password === DEV_FALLBACK.password;
    return ok ? { ok: true } : { error: "El usuario o la contraseña no son correctos." };
  }
  return UNAVAILABLE;
}
