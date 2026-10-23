const apiBase = String(import.meta.env?.VITE_API_URL || "").replace(/\/+$/, "");
const SESSION_KEY = "shared-session";
const repairSnapshots = new Map();

function readWebSession() {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null");
  } catch {
    return null;
  }
}

async function request(path, options = {}, authenticated = true, allowNotModified = false) {
  const session = readWebSession();
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(authenticated && session?.token ? { Authorization: `Bearer ${session.token}` } : {}),
      ...options.headers,
    },
  });
  if (allowNotModified && response.status === 304) {
    return { notModified: true, etag: response.headers.get("ETag") };
  }
  const data = response.status === 204 ? {} : await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || `Error ${response.status} del servidor.`);
    error.status = response.status;
    throw error;
  }
  if (allowNotModified) return { data, etag: response.headers.get("ETag") };
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
  const token = readWebSession()?.token;
  if (token) repairSnapshots.delete(token);
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

export async function createSharedRepair(repair) {
  return (await request("/api/repairs", {
    method: "POST",
    body: JSON.stringify({ repair }),
  })).repair;
}

export async function importSharedRepair(repair) {
  return (await request("/api/repairs/import", {
    method: "POST",
    body: JSON.stringify({ repair }),
  })).repair;
}

export async function updateSharedRepair(id, expectedVersion, patch) {
  return (await request(`/api/repairs/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ expectedVersion, patch }),
  })).repair;
}

export async function loadRepairs() {
  const token = readWebSession()?.token;
  const previous = token ? repairSnapshots.get(token) : null;
  const response = await request(
    "/api/repairs",
    { headers: previous?.etag ? { "If-None-Match": previous.etag } : {} },
    true,
    true,
  );
  if (response.notModified) {
    if (previous) return previous.repairs;
    return loadRepairsUnconditionally(token);
  }
  if (token) repairSnapshots.set(token, { etag: response.etag, repairs: response.data.repairs });
  return response.data.repairs;
}

async function loadRepairsUnconditionally(token) {
  const response = await request("/api/repairs", {}, true, true);
  if (response.notModified) throw new Error("El servidor no devolvió las órdenes solicitadas.");
  if (token) repairSnapshots.set(token, { etag: response.etag, repairs: response.data.repairs });
  return response.data.repairs;
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

export async function createInventoryItem(item) {
  return (await request("/api/inventory", {
    method: "POST",
    body: JSON.stringify({ item }),
  })).item;
}

export async function updateInventoryItem(item, stockDelta) {
  return (await request(`/api/inventory/${encodeURIComponent(item.id)}`, {
    method: "PUT",
    body: JSON.stringify({ item, stockDelta }),
  })).item;
}

export async function adjustInventoryStock(id, delta) {
  return (await request(`/api/inventory/${encodeURIComponent(id)}/stock`, {
    method: "PATCH",
    body: JSON.stringify({ delta }),
  })).item;
}

export async function deleteInventoryItem(id) {
  await request(`/api/inventory/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function loadCustomerWarranties() {
  return (await request("/api/customers/warranties")).warranties;
}

export async function saveCustomerWarranty(customerKey, expiresOn) {
  await request("/api/customers/warranties", {
    method: "PUT",
    body: JSON.stringify({ customerKey, expiresOn }),
  });
  return true;
}
