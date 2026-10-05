const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  repairs: {
    list: () => ipcRenderer.invoke("db:repairs:list"),
    save: (repairs) => ipcRenderer.invoke("db:repairs:save", repairs),
  },
  accounts: {
    list: () => ipcRenderer.invoke("db:accounts:list"),
    create: (account) => ipcRenderer.invoke("db:accounts:create", account),
    updatePassword: (email, passwordHash) =>
      ipcRenderer.invoke("db:accounts:update-password", email, passwordHash),
  },
  session: {
    get: () => ipcRenderer.invoke("db:session:get"),
    set: (email) => ipcRenderer.invoke("db:session:set", email),
    clear: () => ipcRenderer.invoke("db:session:clear"),
  },
  settings: {
    get: (key) => ipcRenderer.invoke("db:settings:get", key),
    set: (key, value) => ipcRenderer.invoke("db:settings:set", key, value),
    delete: (key) => ipcRenderer.invoke("db:settings:delete", key),
  },
  admin: {
    status: () => ipcRenderer.invoke("admin:status"),
    setup: (password) => ipcRenderer.invoke("admin:setup", password),
    login: (username, password) => ipcRenderer.invoke("admin:login", username, password),
  },
  notify: {
    receipt: (payload) => ipcRenderer.invoke("notify:receipt", payload),
  },
  inventory: {
    get: () => ipcRenderer.invoke("db:inventory:get"),
    save: (items) => ipcRenderer.invoke("db:inventory:save", items),
  },
});
