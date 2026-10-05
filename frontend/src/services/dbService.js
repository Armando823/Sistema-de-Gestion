const electronAPI = typeof window !== "undefined" ? window.electronAPI : null;
const apiBase = String(import.meta.env?.VITE_API_URL || "").replace(/\/+$/, "");
const hasSharedApi = Boolean(apiBase);
const SESSION_KEY = "shared-session";

function readWebSession() {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null");
  } catch {
    return null;
  }
}

async function request(path, options = {}, authenticated = true) {
  if (!hasSharedApi) throw new Error("El servidor compartido no está configurado.");
  const session = readWebSession();
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(authenticated && session?.token ? { Authorization: `Bearer ${session.token}` } : {}),
      ...options.headers,
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Error ${response.status} del servidor.`);
  return data;
}

export function usesSharedApi() {
  return !electronAPI && (hasSharedApi || import.meta.env?.PROD === true);
}

export async function loginSharedAccount(email, password) {
  const data = await request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  }, false);
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ ...data.account, token: data.token }));
  return data.account;
}

export async function requestSharedPhoneCode(phone) {
  return request("/api/auth/phone/request", {
    method: "POST",
    body: JSON.stringify({ phone }),
  }, false);
}

export async function loginSharedPhone(phone, code) {
  const data = await request("/api/auth/phone/verify", {
    method: "POST",
    body: JSON.stringify({ phone, code }),
  }, false);
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ ...data.account, token: data.token }));
  return data.account;
}

export async function sendSharedRepairCode(repairId) {
  return request("/api/whatsapp/repair-code", {
    method: "POST",
    body: JSON.stringify({ repairId }),
  });
}

export async function registerSharedAccount(email, password) {
  return (await request("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  }, false)).account;
}

export async function restoreSharedSession() {
  if (!usesSharedApi()) return null;
  const session = readWebSession();
  if (!session?.token) return null;
  try {
    const data = await request("/api/auth/me");
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ ...data.account, token: session.token }));
    return data.account;
  } catch (error) {
    sessionStorage.removeItem(SESSION_KEY);
    if (/Inicia sesión|401/.test(error.message)) return null;
    throw error;
  }
}

export function clearSharedSession() {
  sessionStorage.removeItem(SESSION_KEY);
}

export async function lookupSharedRepair(id, phone) {
  return (await request("/api/repairs/lookup", {
    method: "POST",
    body: JSON.stringify({ id, phone }),
  }, false)).repair;
}

export async function nextSharedRepairId() {
  return (await request("/api/repairs/next-id", { method: "POST" })).id;
}

export async function sendSharedNotification(payload) {
  return request("/api/notifications/receipt", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function deleteSharedRepair(id) {
  await request(`/api/repairs/${encodeURIComponent(id)}`, { method: "DELETE" });
}

function readLocal(key, fallback) {
  const value = localStorage.getItem(key);
  return value === null ? fallback : JSON.parse(value);
}

function writeLocal(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function isDesktop() {
  return Boolean(electronAPI);
}

export async function loadRepairs() {
  if (usesSharedApi()) return (await request("/api/repairs")).repairs;
  return electronAPI
    ? await electronAPI.repairs.list()
    : readLocal("repairs", []);
}

export async function saveRepairs(repairs) {
  try {
    if (usesSharedApi()) {
      await request("/api/repairs", { method: "PUT", body: JSON.stringify({ repairs }) });
      return true;
    }
    return electronAPI
      ? await electronAPI.repairs.save(repairs)
      : writeLocal("repairs", repairs);
  } catch {
    return false;
  }
}

export async function listAccounts() {
  if (usesSharedApi()) return [];
  return electronAPI
    ? await electronAPI.accounts.list()
    : readLocal("client-accounts", []);
}

export async function createAccount(account) {
  try {
    if (usesSharedApi()) {
      await registerSharedAccount(account.email, account.password);
      return true;
    }
    if (electronAPI) return await electronAPI.accounts.create(account);
    const accounts = await listAccounts();
    return writeLocal("client-accounts", [...accounts, account]);
  } catch {
    return false;
  }
}

export async function updateAccountPassword(email, passwordHash) {
  try {
    if (usesSharedApi()) return false;
    if (electronAPI) return await electronAPI.accounts.updatePassword(email, passwordHash);
    const accounts = await listAccounts();
    const account = accounts.find((item) => item.email === email);
    if (!account) return false;
    account.passwordHash = passwordHash;
    return writeLocal("client-accounts", accounts);
  } catch {
    return false;
  }
}

export async function readClientSession() {
  if (usesSharedApi()) return readWebSession()?.email || "";
  try {
    return JSON.parse(sessionStorage.getItem("client-session") || "{}")?.email || "";
  } catch {
    return "";
  }
}

export async function saveClientSession(email) {
  try {
    if (usesSharedApi()) {
      const session = readWebSession();
      if (!session?.token || session.email !== email) return false;
      return true;
    }
    sessionStorage.setItem("client-session", JSON.stringify({ email }));
    return true;
  } catch {
    return false;
  }
}

export async function clearClientSession() {
  try {
    if (usesSharedApi()) {
      clearSharedSession();
      return true;
    }
    sessionStorage.removeItem("client-session");
    return true;
  } catch {
    return false;
  }
}

export async function readSetting(key, fallback = null) {
  if (usesSharedApi()) {
    return (await request(`/api/settings/${encodeURIComponent(key)}`)).value ?? fallback;
  }
  if (electronAPI) {
    return (await electronAPI.settings.get(key)) ?? fallback;
  }
  return readLocal(key, fallback);
}

export async function saveSetting(key, value) {
  if (usesSharedApi()) {
    try {
      await request(`/api/settings/${encodeURIComponent(key)}`, {
        method: "PUT",
        body: JSON.stringify({ value }),
      });
      return true;
    } catch {
      return false;
    }
  }
  if (electronAPI) {
    try {
      return await electronAPI.settings.set(key, value);
    } catch {
      return false;
    }
  }
  return writeLocal(key, value);
}

export async function deleteSetting(key) {
  if (usesSharedApi()) {
    try {
      await request(`/api/settings/${encodeURIComponent(key)}`, { method: "DELETE" });
      return true;
    } catch {
      return false;
    }
  }
  if (electronAPI) {
    try {
      return await electronAPI.settings.delete(key);
    } catch {
      return false;
    }
  }
  try {
    localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export async function loadInventory() {
  if (usesSharedApi()) return (await request("/api/inventory")).items;
  return electronAPI
    ? await electronAPI.inventory.get()
    : readLocal("workshop-inventory", []);
}

export async function saveInventory(items) {
  try {
    if (usesSharedApi()) {
      await request("/api/inventory", { method: "PUT", body: JSON.stringify({ items }) });
      return true;
    }
    return electronAPI
      ? await electronAPI.inventory.save(items)
      : writeLocal("workshop-inventory", items);
  } catch {
    return false;
  }
}
