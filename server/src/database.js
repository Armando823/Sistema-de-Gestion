import mysql from "mysql2/promise";
import { normalizePhone } from "./phone.js";
import { createMysqlSslConfig } from "./mysqlTls.js";

const schema = [
  `CREATE TABLE IF NOT EXISTS accounts (
    email VARCHAR(254) NOT NULL PRIMARY KEY,
    password_hash VARCHAR(255) NULL,
    role ENUM('admin', 'client') NOT NULL,
    phone VARCHAR(24) NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE KEY accounts_phone_idx (phone)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`,
  `CREATE TABLE IF NOT EXISTS repairs (
    id VARCHAR(12) NOT NULL PRIMARY KEY,
    customer VARCHAR(160) NOT NULL,
    phone VARCHAR(32) NOT NULL,
    device VARCHAR(160) NOT NULL,
    problem TEXT NOT NULL,
    status VARCHAR(40) NOT NULL,
    updated VARCHAR(80) NOT NULL,
    created_at VARCHAR(40) NULL,
    owner_email VARCHAR(254) NULL,
    owner_phone VARCHAR(24) NULL,
    authorized_by VARCHAR(160) NULL,
    signature MEDIUMTEXT NULL,
    photos JSON NOT NULL,
    contact_email VARCHAR(254) NULL,
    whatsapp_opt_in BOOLEAN NOT NULL DEFAULT FALSE,
    KEY repairs_owner_email_idx (owner_email),
    KEY repairs_owner_phone_idx (owner_phone),
    CONSTRAINT repairs_owner_email_fk FOREIGN KEY (owner_email)
      REFERENCES accounts(email) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`,
  `CREATE TABLE IF NOT EXISTS app_counters (
    counter_key VARCHAR(64) NOT NULL PRIMARY KEY,
    value BIGINT UNSIGNED NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`,
  `CREATE TABLE IF NOT EXISTS phone_login_codes (
    phone VARCHAR(24) NOT NULL PRIMARY KEY,
    code_hash CHAR(64) NOT NULL,
    expires_at DATETIME(3) NOT NULL,
    attempts TINYINT UNSIGNED NOT NULL DEFAULT 0
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`,
  `CREATE TABLE IF NOT EXISTS app_settings (
    \`key\` VARCHAR(100) NOT NULL PRIMARY KEY,
    value JSON NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`,
  `CREATE TABLE IF NOT EXISTS inventory (
    id VARCHAR(100) NOT NULL PRIMARY KEY,
    value JSON NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`,
];

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
  });

  return {
    async checkHealth() {
      await pool.query("SELECT 1");
    },

    async initialize({ adminEmail, adminPassword, hashPassword }) {
      for (const statement of schema) await pool.query(statement);
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
        ? await pool.execute("SELECT * FROM repairs ORDER BY id")
        : await pool.execute(
            "SELECT * FROM repairs WHERE owner_email = ? OR owner_phone = ? ORDER BY id",
            [account.email, account.phone || ""],
          );
      return rows
        .filter((row) => account.role === "admin" ||
          row.owner_email === account.email ||
          (!row.owner_email && row.owner_phone === account.phone && normalizePhone(row.phone) === account.phone))
        .map(mapRepair);
    },

    async saveRepairs(account, repairs) {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        for (const repair of repairs) {
          const ownerEmail = account.role === "admin" ? (repair.ownerEmail || null) : account.email;
          const ownerPhone = account.role === "admin" ? (repair.ownerPhone || null) : (account.phone || null);
          const values = [
            repair.id, repair.customer, repair.phone, repair.device, repair.problem,
            account.role === "admin" ? repair.status : "Recibido",
            repair.updated, repair.createdAt || null, ownerEmail, ownerPhone,
            repair.authorizedBy || null, repair.signature || null,
            JSON.stringify(repair.photos || []), repair.contactEmail || null,
            repair.whatsappOptIn === true,
          ];
          const insert = `INSERT INTO repairs
            (id, customer, phone, device, problem, status, updated, created_at, owner_email,
             owner_phone, authorized_by, signature, photos, contact_email, whatsapp_opt_in)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
          if (account.role === "admin") {
            await connection.execute(
              `${insert} ON DUPLICATE KEY UPDATE
                customer = VALUES(customer), phone = VALUES(phone), device = VALUES(device),
                problem = VALUES(problem), status = VALUES(status), updated = VALUES(updated),
                created_at = VALUES(created_at), owner_email = VALUES(owner_email),
                owner_phone = VALUES(owner_phone), authorized_by = VALUES(authorized_by),
                signature = VALUES(signature), photos = VALUES(photos),
                contact_email = VALUES(contact_email), whatsapp_opt_in = VALUES(whatsapp_opt_in)`,
              values,
            );
          } else {
            await connection.execute(`${insert} ON DUPLICATE KEY UPDATE id = id`, values);
          }
        }
        await connection.execute(
          `UPDATE app_counters SET value = GREATEST(value, (
            SELECT COALESCE(MAX(CAST(SUBSTRING(id, 5) AS UNSIGNED)), 1000)
            FROM repairs WHERE id REGEXP '^REP-[0-9]{4,8}$'
          )) WHERE counter_key = 'repair'`,
        );
        await connection.commit();
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
      await pool.execute("DELETE FROM repairs WHERE id = ?", [id]);
    },

    async getRepairById(id) {
      const [rows] = await pool.execute("SELECT * FROM repairs WHERE id = ?", [id]);
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

    async saveInventory(items) {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        await connection.execute("DELETE FROM inventory");
        for (const item of items) {
          await connection.execute(
            "INSERT INTO inventory (id, value) VALUES (?, ?)",
            [String(item.id), JSON.stringify(item)],
          );
        }
        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    },

    close: () => pool.end(),
  };
}
