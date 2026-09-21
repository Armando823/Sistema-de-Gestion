const electronAPI = typeof window !== "undefined" ? window.electronAPI : null;

function readLocal(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
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
  try {
    return electronAPI
      ? await electronAPI.repairs.list()
      : readLocal("repairs", []);
  } catch {
    return [];
  }
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
  try {
    return electronAPI
      ? await electronAPI.accounts.list()
      : readLocal("client-accounts", []);
  } catch {
    return [];
  }
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

export async function readClientSession() {
  if (electronAPI) {
    try {
      return await electronAPI.session.get();
    } catch {
      return "";
    }
  }
  try {
    return JSON.parse(sessionStorage.getItem("client-session") || "{}")?.email || "";
  } catch {
    return "";
  }
}

export async function saveClientSession(email) {
  if (electronAPI) {
    try {
      return await electronAPI.session.set(email);
    } catch {
      return false;
    }
  }
  try {
    sessionStorage.setItem("client-session", JSON.stringify({ email }));
    return true;
  } catch {
    return false;
  }
}

export async function clearClientSession() {
  if (electronAPI) {
    try {
      return await electronAPI.session.clear();
    } catch {
      return false;
    }
  }
  try {
    sessionStorage.removeItem("client-session");
    return true;
  } catch {
    return false;
  }
}

export async function readSetting(key, fallback = null) {
  if (electronAPI) {
    try {
      return (await electronAPI.settings.get(key)) ?? fallback;
    } catch {
      return fallback;
    }
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
  try {
    return electronAPI
      ? await electronAPI.inventory.get()
      : readLocal("workshop-inventory", []);
  } catch {
    return [];
  }
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
