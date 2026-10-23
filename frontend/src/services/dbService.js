const apiBase = String(import.meta.env?.VITE_API_URL || "").replace(/\/+$/, "");
const SESSION_KEY = "shared-session";

function readWebSession() {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null");
  } catch {
    return null;
  }
}

async function request(path, options = {}, authenticated = true) {
  const session = readWebSession();
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(authenticated && session?.token ? { Authorization: `Bearer ${session.token}` } : {}),
      ...options.headers,
    },
  });
  const data = response.status === 204 ? {} : await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Error ${response.status} del servidor.`);
  return data;
}

export function usesSharedApi() {
  return true;
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

export async function loadRepairs() {
  return (await request("/api/repairs")).repairs;
}

export async function saveRepairs(repairs) {
  try {
    await request("/api/repairs", { method: "PUT", body: JSON.stringify({ repairs }) });
    return true;
  } catch {
    return false;
  }
}

export async function readClientSession() {
  return readWebSession()?.email || "";
}

export async function saveClientSession(email) {
  const session = readWebSession();
  return Boolean(session?.token && session.email === email);
}

export async function clearClientSession() {
  clearSharedSession();
  return true;
}

export async function readSetting(key, fallback = null) {
  return (await request(`/api/settings/${encodeURIComponent(key)}`)).value ?? fallback;
}

export async function saveSetting(key, value) {
  await request(`/api/settings/${encodeURIComponent(key)}`, {
    method: "PUT",
    body: JSON.stringify({ value }),
  });
  return true;
}

export async function deleteSetting(key) {
  await request(`/api/settings/${encodeURIComponent(key)}`, { method: "DELETE" });
  return true;
}

export async function loadInventory() {
  return (await request("/api/inventory")).items;
}

export async function saveInventory(items) {
  await request("/api/inventory", { method: "PUT", body: JSON.stringify({ items }) });
  return true;
}
