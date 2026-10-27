import mysql from "mysql2/promise";
import { normalizePhone } from "./phone.js";
import { createMysqlSslConfig } from "./mysqlTls.js";
import { applyMigrations } from "./migrations.js";

function parseJson(value, fallback) {
  if (typeof value !== "string") return value ?? fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function mapRepair(row) {
  if (!row) return null;
  return {
    id: row.id,
    customer: row.customer,
    phone: row.phone,
    device: row.device,
    problem: row.problem,
    status: row.status,
    updated: row.updated,
    createdAt: row.created_at || undefined,
    ownerEmail: row.owner_email || undefined,
    ownerPhone: row.owner_phone || undefined,
    authorizedBy: row.authorized_by || undefined,
    signature: row.signature || undefined,
    photos: parseJson(row.photos, []),
    contactEmail: row.contact_email || undefined,
    whatsappOptIn: Boolean(row.whatsapp_opt_in),
    version: Number(row.version ?? 1),
  };
}

export function createDatabase(connectionString, { production = false, sslCa } = {}) {
  const url = new URL(connectionString);
  if (url.protocol !== "mysql:") {
    throw new Error("MYSQL_URL debe usar el protocolo mysql://.");
  }
  const pool = mysql.createPool({
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.slice(1)),
    ssl: createMysqlSslConfig({ production, ca: sslCa }),
    connectionLimit: 5,
    connectTimeout: 10_000,
    waitForConnections: true,
    queueLimit: 0,
    charset: "utf8mb4",
    decimalNumbers: true,
    dateStrings: ["DATE"],
  });

  async function incrementRepairSyncRevision(connection) {
    const [result] = await connection.execute(
      "UPDATE app_counters SET value = value + 1 WHERE counter_key = 'repair_sync'",
    );
    if (result.affectedRows !== 1) {
      throw new Error("No se inicializó la revisión de sincronización de órdenes.");
    }
  }

  return {
    migrate: () => applyMigrations(pool),

    async checkHealth() {
      await pool.query("SELECT 1");
    },

    async initialize({ adminEmail, adminPassword, hashPassword }) {
      await pool.execute(
        `INSERT INTO app_counters (counter_key, value)
         SELECT 'repair', GREATEST(1000, COALESCE(MAX(CAST(SUBSTRING(id, 5) AS UNSIGNED)), 1000))
         FROM repairs
         ON DUPLICATE KEY UPDATE value = GREATEST(value, VALUES(value))`,
      );

      if (adminEmail && adminPassword) {
        const normalized = adminEmail.trim().toLowerCase();
        const [rows] = await pool.execute("SELECT role FROM accounts WHERE email = ?", [normalized]);
        if (rows.length === 0) {
          await pool.execute(
            "INSERT INTO accounts (email, password_hash, role) VALUES (?, ?, 'admin')",
            [normalized, await hashPassword(adminPassword)],
          );
        } else if (rows[0].role !== "admin") {
          throw new Error("ADMIN_EMAIL ya existe como cuenta de cliente; usa otro correo para el administrador.");
        }
      }
      const [admins] = await pool.execute("SELECT 1 FROM accounts WHERE role = 'admin' LIMIT 1");
      if (admins.length === 0) {
        throw new Error("Configura ADMIN_EMAIL y ADMIN_PASSWORD para crear el primer administrador.");
      }
    },

    async createAccount(email, passwordHash) {
      await pool.execute(
        "INSERT INTO accounts (email, password_hash, role) VALUES (?, ?, 'client')",
        [email, passwordHash],
      );
    },

    async getAccount(email) {
      const [rows] = await pool.execute(
        "SELECT email, password_hash AS passwordHash, role, phone FROM accounts WHERE email = ?",
        [email],
      );
      return rows[0] ?? null;
    },

    async savePhoneLoginCode(phone, codeHash, expiresAt) {
      const email = `whatsapp-${phone.replace(/\D/g, "")}@phone.invalid`;
      await pool.execute(
        `INSERT IGNORE INTO accounts (email, password_hash, role, phone)
         VALUES (?, NULL, 'client', ?)`,
        [email, phone],
      );
      await pool.execute(
        `INSERT INTO phone_login_codes (phone, code_hash, expires_at, attempts)
         VALUES (?, ?, ?, 0)
         ON DUPLICATE KEY UPDATE
           code_hash = VALUES(code_hash),
           expires_at = VALUES(expires_at),
           attempts = 0`,
        [phone, codeHash, new Date(expiresAt)],
      );
    },

    async consumePhoneLoginCode(phone, codeHash, now) {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const [rows] = await connection.execute(
          "SELECT code_hash, expires_at, attempts FROM phone_login_codes WHERE phone = ? FOR UPDATE",
          [phone],
        );
        const stored = rows[0];
        if (!stored || new Date(stored.expires_at).getTime() <= now || stored.attempts >= 5) {
          await connection.execute("DELETE FROM phone_login_codes WHERE phone = ?", [phone]);
          await connection.commit();
          return false;
        }
        if (stored.code_hash !== codeHash) {
          await connection.execute(
            "UPDATE phone_login_codes SET attempts = attempts + 1 WHERE phone = ?",
            [phone],
          );
          await connection.commit();
          return false;
        }
        await connection.execute("DELETE FROM phone_login_codes WHERE phone = ?", [phone]);
        await connection.commit();
        return true;
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    },

    async getOrCreatePhoneAccount(phone) {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const [rows] = await connection.execute(
          "SELECT email, role, phone FROM accounts WHERE phone = ? FOR UPDATE",
          [phone],
        );
        let account = rows[0];
        if (!account) {
          const email = `whatsapp-${phone.replace(/\D/g, "")}@phone.invalid`;
          await connection.execute(
            `INSERT IGNORE INTO accounts (email, password_hash, role, phone)
             VALUES (?, NULL, 'client', ?)`,
            [email, phone],
          );
          const [created] = await connection.execute(
            "SELECT email, role, phone FROM accounts WHERE phone = ?",
            [phone],
          );
          account = created[0];
        }
        if (!account || account.role !== "client") {
          await connection.commit();
          return null;
        }
        const [repairs] = await connection.execute(
          "SELECT id, phone FROM repairs WHERE owner_phone IS NULL AND owner_email IS NULL",
        );
        for (const repair of repairs) {
          if (normalizePhone(repair.phone) === phone) {
            await connection.execute("UPDATE repairs SET owner_phone = ? WHERE id = ?", [phone, repair.id]);
          }
        }
        if (repairs.some((repair) => normalizePhone(repair.phone) === phone)) {
          await incrementRepairSyncRevision(connection);
        }
        await connection.commit();
        return account;
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    },

    async listRepairs(account) {
      const [rows] = account.role === "admin"
        ? await pool.execute(
            `SELECT repairs.*, COALESCE(repair_revisions.version, 1) AS version
             FROM repairs LEFT JOIN repair_revisions ON repair_revisions.repair_id = repairs.id
             ORDER BY repairs.id`,
          )
        : await pool.execute(
            `SELECT repairs.*, COALESCE(repair_revisions.version, 1) AS version
             FROM repairs LEFT JOIN repair_revisions ON repair_revisions.repair_id = repairs.id
             WHERE owner_email = ? OR owner_phone = ? ORDER BY repairs.id`,
            [account.email, account.phone || ""],
          );
      return rows
        .filter((row) => account.role === "admin" ||
          row.owner_email === account.email ||
          (!row.owner_email && row.owner_phone === account.phone && normalizePhone(row.phone) === account.phone))
        .map(mapRepair);
    },

    async getRepairSyncRevision() {
      const [rows] = await pool.execute(
        "SELECT CAST(value AS CHAR) AS revision FROM app_counters WHERE counter_key = 'repair_sync'",
      );
      if (!rows[0]) throw new Error("No se inicializó la revisión de sincronización de órdenes.");
      return rows[0].revision;
    },

    async createRepair(account, repair) {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const ownerEmail = account.role === "admin" ? (repair.ownerEmail || null) : account.email;
        const ownerPhone = account.role === "admin" ? (repair.ownerPhone || null) : (account.phone || null);
        const status = account.role === "admin" ? repair.status : "Recibido";
        await connection.execute(
          `INSERT INTO repairs
            (id, customer, phone, device, problem, status, updated, created_at, owner_email,
             owner_phone, authorized_by, signature, photos, contact_email, whatsapp_opt_in)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            repair.id, repair.customer, repair.phone, repair.device, repair.problem,
            status, repair.updated, repair.createdAt || null, ownerEmail, ownerPhone,
            repair.authorizedBy || null, repair.signature || null,
            JSON.stringify(repair.photos || []), repair.contactEmail || null,
            repair.whatsappOptIn === true,
          ],
        );
        await connection.execute(
          "INSERT INTO repair_revisions (repair_id, version) VALUES (?, 1)",
          [repair.id],
        );
        await incrementRepairSyncRevision(connection);
        await connection.commit();
        return {
          ...repair,
          status,
          ownerEmail: ownerEmail || undefined,
          ownerPhone: ownerPhone || undefined,
          version: 1,
        };
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    },

    async updateRepair(id, expectedVersion, patch, actorEmail) {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const [repairs] = await connection.execute(
          "SELECT * FROM repairs WHERE id = ? FOR UPDATE",
          [id],
        );
        const row = repairs[0];
        if (!row) {
          await connection.rollback();
          return null;
        }
        const [revisions] = await connection.execute(
          "SELECT version FROM repair_revisions WHERE repair_id = ? FOR UPDATE",
          [id],
        );
        const currentVersion = Number(revisions[0]?.version ?? 1);
        if (currentVersion !== expectedVersion) {
          await connection.rollback();
          return { conflict: true, version: currentVersion };
        }
        const assignments = [];
        const values = [];
        if (patch.status !== undefined) {
          assignments.push("status = ?");
          values.push(patch.status);
        }
        if (patch.photos !== undefined) {
          assignments.push("photos = ?");
          values.push(JSON.stringify(patch.photos));
        }
        assignments.push("updated = ?");
        values.push(patch.updated, id);
        await connection.execute(
          `UPDATE repairs SET ${assignments.join(", ")} WHERE id = ?`,
          values,
        );
        if (patch.status !== undefined && patch.status !== row.status) {
          await connection.execute(
            `INSERT INTO repair_status_history
              (repair_id, previous_status, new_status, actor_email)
             VALUES (?, ?, ?, ?)`,
            [id, row.status, patch.status, actorEmail],
          );
        }
        const nextVersion = currentVersion + 1;
        await connection.execute(
          `INSERT INTO repair_revisions (repair_id, version) VALUES (?, ?)
           ON DUPLICATE KEY UPDATE version = VALUES(version)`,
          [id, nextVersion],
        );
        await incrementRepairSyncRevision(connection);
        const [updatedRows] = await connection.execute(
          `SELECT repairs.*, ? AS version FROM repairs WHERE id = ?`,
          [nextVersion, id],
        );
        await connection.commit();
        return mapRepair(updatedRows[0]);
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    },

    async nextRepairId() {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const [rows] = await connection.execute(
          `SELECT value, (SELECT COALESCE(MAX(CAST(SUBSTRING(id, 5) AS UNSIGNED)), 1000)
            FROM repairs WHERE id REGEXP '^REP-[0-9]{4,8}$') AS maximum
           FROM app_counters WHERE counter_key = 'repair' FOR UPDATE`,
        );
        const stored = rows[0];
        if (!stored) throw new Error("No se inicializó el contador de órdenes.");
        const value = Math.max(Number(stored.value), Number(stored.maximum)) + 1;
        if (!Number.isSafeInteger(value) || value > 99_999_999) {
          throw new Error("Se alcanzó el límite de códigos de reparación.");
        }
        await connection.execute(
          "UPDATE app_counters SET value = ? WHERE counter_key = 'repair'",
          [value],
        );
        await connection.commit();
        return `REP-${String(value).padStart(4, "0")}`;
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    },

    async deleteRepair(id) {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const [result] = await connection.execute("DELETE FROM repairs WHERE id = ?", [id]);
        if (result.affectedRows > 0) await incrementRepairSyncRevision(connection);
        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    },

    async getRepairById(id) {
      const [rows] = await pool.execute(
        `SELECT repairs.*, COALESCE(repair_revisions.version, 1) AS version
         FROM repairs LEFT JOIN repair_revisions ON repair_revisions.repair_id = repairs.id
         WHERE repairs.id = ?`,
        [id],
      );
      return rows[0]
        ? {
            ...rows[0],
            photos: parseJson(rows[0].photos, []),
            whatsapp_opt_in: Boolean(rows[0].whatsapp_opt_in),
          }
        : null;
    },

    async lookupRepair(id, phone) {
      const [rows] = await pool.execute(
        "SELECT * FROM repairs WHERE id = ? AND owner_email IS NULL",
        [id],
      );
      const row = rows[0];
      if (!row || !normalizePhone(row.phone) || normalizePhone(row.phone) !== normalizePhone(phone)) return null;
      return { ...mapRepair(row), ownerEmail: undefined, ownerPhone: undefined };
    },

    async listRepairStatusHistory(
      id,
      { beforeId = "18446744073709551615", limit = 50 } = {},
    ) {
      const [rows] = await pool.execute(
        `SELECT id, repair_id AS repairId, previous_status AS previousStatus,
                new_status AS newStatus, actor_email AS actorEmail, occurred_at AS occurredAt
         FROM repair_status_history
         WHERE repair_id = ? AND id < ?
         ORDER BY id DESC LIMIT ?`,
        [id, beforeId, limit],
      );
      return rows.map((row) => ({ ...row, id: String(row.id) }));
    },

    async listCustomerWarranties() {
      const [rows] = await pool.execute(
        "SELECT customer_key, expires_on FROM customer_warranties ORDER BY customer_key",
      );
      return Object.fromEntries(rows.map((row) => [
        row.customer_key,
        row.expires_on ? String(row.expires_on).slice(0, 10) : null,
      ]));
    },

    async saveCustomerWarranty(customerKey, expiresOn, updatedBy) {
      if (expiresOn === null) {
        await pool.execute("DELETE FROM customer_warranties WHERE customer_key = ?", [customerKey]);
        return;
      }
      await pool.execute(
        `INSERT INTO customer_warranties (customer_key, expires_on, updated_by)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE expires_on = VALUES(expires_on), updated_by = VALUES(updated_by)`,
        [customerKey, expiresOn, updatedBy],
      );
    },

    async getSetting(key) {
      const [rows] = await pool.execute("SELECT value FROM app_settings WHERE `key` = ?", [key]);
      return parseJson(rows[0]?.value, null);
    },

    async saveSetting(key, value) {
      await pool.execute(
        `INSERT INTO app_settings (\`key\`, value) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE value = VALUES(value)`,
        [key, JSON.stringify(value)],
      );
    },

    async deleteSetting(key) {
      await pool.execute("DELETE FROM app_settings WHERE `key` = ?", [key]);
    },

    async loadInventory() {
      const [rows] = await pool.execute("SELECT value FROM inventory ORDER BY id");
      return rows.map((row) => parseJson(row.value, null));
    },

    async createInventoryItem(item, actorEmail) {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        await connection.execute(
          "INSERT INTO inventory (id, value) VALUES (?, ?)",
          [String(item.id), JSON.stringify(item)],
        );
        await connection.execute(
          `INSERT INTO inventory_movements
            (item_id, item_name, action, quantity_delta, stock_after, actor_email)
           VALUES (?, ?, 'created', ?, ?, ?)`,
          [String(item.id), item.item, item.stock, item.stock, actorEmail],
        );
        await connection.commit();
        return item;
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    },

    async updateInventoryItem(id, item, stockDelta, actorEmail) {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const [rows] = await connection.execute(
          "SELECT value FROM inventory WHERE id = ? FOR UPDATE",
          [id],
        );
        if (!rows[0]) {
          await connection.rollback();
          return null;
        }
        const stored = parseJson(rows[0].value, null);
        const stock = stored.stock + stockDelta;
        if (!Number.isSafeInteger(stock) || stock < 0) {
          await connection.rollback();
          return { conflict: true, stock: stored.stock };
        }
        const updated = { ...item, id: stored.id, stock };
        await connection.execute(
          "UPDATE inventory SET value = ? WHERE id = ?",
          [JSON.stringify(updated), id],
        );
        await connection.execute(
          `INSERT INTO inventory_movements
            (item_id, item_name, action, quantity_delta, stock_after, actor_email)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            id,
            updated.item,
            stockDelta === 0 ? "updated" : "stock_adjusted",
            stockDelta,
            updated.stock,
            actorEmail,
          ],
        );
        await connection.commit();
        return updated;
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    },

    async adjustInventoryStock(id, delta, actorEmail) {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const [rows] = await connection.execute(
          "SELECT value FROM inventory WHERE id = ? FOR UPDATE",
          [id],
        );
        if (!rows[0]) {
          await connection.rollback();
          return null;
        }
        const item = parseJson(rows[0].value, null);
        const stock = item.stock + delta;
        if (!Number.isSafeInteger(stock) || stock < 0) {
          await connection.rollback();
          return { conflict: true, stock: item.stock };
        }
        const updated = { ...item, stock };
        await connection.execute(
          "UPDATE inventory SET value = ? WHERE id = ?",
          [JSON.stringify(updated), id],
        );
        await connection.execute(
          `INSERT INTO inventory_movements
            (item_id, item_name, action, quantity_delta, stock_after, actor_email)
           VALUES (?, ?, 'stock_adjusted', ?, ?, ?)`,
          [id, updated.item, delta, updated.stock, actorEmail],
        );
        await connection.commit();
        return updated;
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    },

    async deleteInventoryItem(id, actorEmail) {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const [rows] = await connection.execute(
          "SELECT value FROM inventory WHERE id = ? FOR UPDATE",
          [id],
        );
        if (!rows[0]) {
          await connection.rollback();
          return false;
        }
        const item = parseJson(rows[0].value, null);
        await connection.execute(
          `INSERT INTO inventory_movements
            (item_id, item_name, action, quantity_delta, stock_after, actor_email)
           VALUES (?, ?, 'deleted', ?, NULL, ?)`,
          [id, item.item, -item.stock, actorEmail],
        );
        await connection.execute("DELETE FROM inventory WHERE id = ?", [id]);
        await connection.commit();
        return true;
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    },

    async listInventoryMovements({ beforeId = "18446744073709551615", limit = 50 } = {}) {
      const [rows] = await pool.execute(
        `SELECT id, item_id AS itemId, item_name AS itemName, action,
                quantity_delta AS quantityDelta, stock_after AS stockAfter,
                actor_email AS actorEmail, occurred_at AS occurredAt
         FROM inventory_movements
         WHERE id < ?
         ORDER BY id DESC LIMIT ?`,
        [beforeId, limit],
      );
      return rows.map((row) => ({
        ...row,
        id: String(row.id),
        quantityDelta: Number(row.quantityDelta),
        stockAfter: row.stockAfter === null ? null : Number(row.stockAfter),
      }));
    },

    close: () => pool.end(),
  };
}
 