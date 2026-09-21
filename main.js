const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("node:path");
const Database = require("better-sqlite3");

let database;

function parsePhotos(value) {
  try {
    const photos = JSON.parse(value || "[]");
    return Array.isArray(photos) ? photos : [];
  } catch {
    return [];
  }
}

function getDatabase() {
  if (database) return database;

  const databasePath = path.join(app.getPath("userData"), "taller-digital.db");
  database = new Database(databasePath);
  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");
  database.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      email TEXT PRIMARY KEY,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      email TEXT,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (email) REFERENCES accounts(email) ON DELETE SET NULL
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS inventory (
      id INTEGER PRIMARY KEY,
      item TEXT NOT NULL,
      sku TEXT NOT NULL,
      category TEXT NOT NULL,
      stock INTEGER NOT NULL,
      minimum INTEGER NOT NULL,
      cost REAL NOT NULL,
      supplier TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS repairs (
      id TEXT PRIMARY KEY,
      customer TEXT NOT NULL,
      phone TEXT NOT NULL,
      device TEXT NOT NULL,
      problem TEXT NOT NULL,
      status TEXT NOT NULL,
      updated TEXT NOT NULL,
      owner_email TEXT,
      authorized_by TEXT,
      signature TEXT,
      photos TEXT NOT NULL DEFAULT '[]'
    );
  `);
  return database;
}

function registerDatabaseHandlers() {
  ipcMain.handle("db:repairs:list", () => {
    const rows = getDatabase().prepare("SELECT * FROM repairs ORDER BY id").all();
    return rows.map((row) => ({
      id: row.id,
      customer: row.customer,
      phone: row.phone,
      device: row.device,
      problem: row.problem,
      status: row.status,
      updated: row.updated,
      ownerEmail: row.owner_email || undefined,
      authorizedBy: row.authorized_by || undefined,
      signature: row.signature || undefined,
      photos: parsePhotos(row.photos),
    }));
  });

  ipcMain.handle("db:repairs:save", (_event, repairs) => {
    const db = getDatabase();
    const save = db.transaction((items) => {
      db.prepare("DELETE FROM repairs").run();
      const insert = db.prepare(`
        INSERT INTO repairs
          (id, customer, phone, device, problem, status, updated, owner_email, authorized_by, signature, photos)
        VALUES
          (@id, @customer, @phone, @device, @problem, @status, @updated, @ownerEmail, @authorizedBy, @signature, @photos)
      `);
      for (const repair of items) {
        insert.run({
          ...repair,
          ownerEmail: repair.ownerEmail || null,
          authorizedBy: repair.authorizedBy || null,
          signature: repair.signature || null,
          photos: JSON.stringify(repair.photos || []),
        });
      }
    });
    save(Array.isArray(repairs) ? repairs : []);
    return true;
  });

  ipcMain.handle("db:accounts:list", () =>
    getDatabase().prepare("SELECT email, password_hash AS passwordHash, created_at AS createdAt FROM accounts").all(),
  );

  ipcMain.handle("db:accounts:create", (_event, account) => {
    getDatabase().prepare(`
      INSERT INTO accounts (email, password_hash, created_at)
      VALUES (@email, @passwordHash, @createdAt)
    `).run(account);
    return true;
  });

  ipcMain.handle("db:session:get", () => {
    const row = getDatabase().prepare("SELECT email FROM sessions WHERE id = 1").get();
    return row?.email || "";
  });

  ipcMain.handle("db:session:set", (_event, email) => {
    getDatabase().prepare(`
      INSERT INTO sessions (id, email, updated_at)
      VALUES (1, ?, ?)
      ON CONFLICT(id) DO UPDATE SET email = excluded.email, updated_at = excluded.updated_at
    `).run(email, new Date().toISOString());
    return true;
  });

  ipcMain.handle("db:session:clear", () => {
    getDatabase().prepare("DELETE FROM sessions WHERE id = 1").run();
    return true;
  });

  ipcMain.handle("db:settings:get", (_event, key) => {
    const row = getDatabase().prepare("SELECT value FROM settings WHERE key = ?").get(key);
    return row ? JSON.parse(row.value) : null;
  });

  ipcMain.handle("db:settings:set", (_event, key, value) => {
    getDatabase().prepare(`
      INSERT INTO settings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(key, JSON.stringify(value));
    return true;
  });

  ipcMain.handle("db:settings:delete", (_event, key) => {
    getDatabase().prepare("DELETE FROM settings WHERE key = ?").run(key);
    return true;
  });

  ipcMain.handle("db:inventory:get", () =>
    getDatabase().prepare("SELECT id, item, sku, category, stock, minimum, cost, supplier FROM inventory ORDER BY id").all(),
  );

  ipcMain.handle("db:inventory:save", (_event, items) => {
    const db = getDatabase();
    const save = db.transaction((inventory) => {
      db.prepare("DELETE FROM inventory").run();
      const insert = db.prepare(`
        INSERT INTO inventory (id, item, sku, category, stock, minimum, cost, supplier)
        VALUES (@id, @item, @sku, @category, @stock, @minimum, @cost, @supplier)
      `);
      for (const item of inventory) insert.run(item);
    });
    save(Array.isArray(items) ? items : []);
    return true;
  });
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1024,
    minHeight: 700,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  if (process.env.ELECTRON_START_URL) {
    window.loadURL(process.env.ELECTRON_START_URL);
  } else {
    window.loadFile(path.join(__dirname, "frontend", "dist", "index.html"));
  }
}

app.whenReady().then(() => {
  getDatabase();
  registerDatabaseHandlers();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (database) database.close();
  if (process.platform !== "darwin") app.quit();
});
