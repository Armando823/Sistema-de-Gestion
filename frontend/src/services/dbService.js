const electronAPI = typeof window !== "undefined" ? window.electronAPI : null;

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
  return electronAPI
    ? await electronAPI.repairs.list()
    : readLocal("repairs", []);
}

export async function saveRepairs(repairs) {
  try {
    return electronAPI
      ? await electronAPI.repairs.save(repairs)
      : writeLocal("repairs", repairs);
  } catch {
    return false;
  }
}

export async function listAccounts() {
  return electronAPI
    ? await electronAPI.accounts.list()
    : readLocal("client-accounts", []);
}

export async function createAccount(account) {
  try {
    if (electronAPI) return await electronAPI.accounts.create(account);
    const accounts = await listAccounts();
    return writeLocal("client-accounts", [...accounts, account]);
  } catch {
    return false;
  }
}

export async function updateAccountPassword(email, passwordHash) {
  try {
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
  try {
    return JSON.parse(sessionStorage.getItem("client-session") || "{}")?.email || "";
  } catch {
    return "";
  }
}

export async function saveClientSession(email) {
  try {
    sessionStorage.setItem("client-session", JSON.stringify({ email }));
    return true;
  } catch {
    return false;
  }
}

export async function clearClientSession() {
  try {
    sessionStorage.removeItem("client-session");
    return true;
  } catch {
    return false;
  }
}

export async function readSetting(key, fallback = null) {
  if (electronAPI) {
    return (await electronAPI.settings.get(key)) ?? fallback;
  }
  return readLocal(key, fallback);
}

export async function saveSetting(key, value) {
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
  return electronAPI
    ? await electronAPI.inventory.get()
    : readLocal("workshop-inventory", []);
}

export async function saveInventory(items) {
  try {
    return electronAPI
      ? await electronAPI.inventory.save(items)
      : writeLocal("workshop-inventory", items);
  } catch {
    return false;
  }
}
