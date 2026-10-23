import mysql from "mysql2/promise";
import { normalizePhone } from "./phone.js";
import { createMySqlConnectionOptions, createPhoneLockName } from "./mysqlConnection.js";

function mapRepair(row) {
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
    photos: row.photos,
    contactEmail: row.contact_email || undefined,
    whatsappOptIn: Boolean(row.whatsapp_opt_in),
  };
}

export function createDatabase(connectionString, { production = false, sslCa } = {}) {
  const pool = mysql.createPool({
    ...createMySqlConnectionOptions(connectionString, { production, ca: sslCa }),
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0,
    connectTimeout: 10_000,
    timezone: "Z",
    charset: "utf8mb4",
  });

  async function execute(connection, sql, values = []) {
    const [result] = await connection.execute(sql, values);
    return result;
  }

  async function rows(connection, sql, values = []) {
    const result = await execute(connection, sql, values);
    return result;
  }

  async function maximumRepairNumber(connection) {
    const result = await rows(
      connection,
      `SELECT COALESCE(MAX(CAST(SUBSTRING(id, 5) AS UNSIGNED)), 1000) AS maximum
       FROM repairs
       WHERE id REGEXP '^REP-[0-9]{4,8}$'`,
    );
    return Number(result[0].maximum);
  }

  return {
    async checkHealth() {
      await pool.execute("SELECT 1");
    },

    async initialize({ adminEmail, adminPassword, hashPassword }) {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS accounts (
          email VARCHAR(254) NOT NULL PRIMARY KEY,
          password_hash VARCHAR(255) NULL,
          role VARCHAR(16) NOT NULL,
          phone VARCHAR(16) NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY accounts_phone_idx (phone)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS repairs (
          id VARCHAR(12) NOT NULL PRIMARY KEY,
          customer VARCHAR(80) NOT NULL,
          phone VARCHAR(30) NOT NULL,
          device VARCHAR(80) NOT NULL,
          problem VARCHAR(500) NOT NULL,
          status VARCHAR(32) NOT NULL,
          updated VARCHAR(40) NOT NULL,
          created_at VARCHAR(40) NULL,
          owner_email VARCHAR(254) NULL,
          owner_phone VARCHAR(16) NULL,
          authorized_by VARCHAR(80) NULL,
          signature MEDIUMTEXT NULL,
          photos JSON NOT NULL,
          contact_email VARCHAR(254) NULL,
          whatsapp_opt_in BOOLEAN NOT NULL DEFAULT FALSE,
          KEY repairs_owner_email_idx (owner_email),
          KEY repairs_owner_phone_idx (owner_phone),
          CONSTRAINT repairs_owner_email_fk
            FOREIGN KEY (owner_email) REFERENCES accounts(email) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS app_counters (
          key_name VARCHAR(32) NOT NULL PRIMARY KEY,
          value BIGINT UNSIGNED NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS phone_login_codes (
          phone VARCHAR(16) NOT NULL PRIMARY KEY,
          code_hash CHAR(64) NOT NULL,
          expires_at BIGINT NOT NULL,
          attempts INT UNSIGNED NOT NULL DEFAULT 0
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS app_settings (
          key_name VARCHAR(64) NOT NULL PRIMARY KEY,
          value JSON NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS inventory (
          id VARCHAR(64) NOT NULL PRIMARY KEY,
          value JSON NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

      if (adminEmail && adminPassword) {
        const normalized = adminEmail.trim().toLowerCase();
        const existing = await rows(pool, "SELECT role FROM accounts WHERE email = ?", [normalized]);
        if (existing.length === 0) {
          try {
            await execute(
              pool,
              "INSERT INTO accounts (email, password_hash, role) VALUES (?, ?, 'admin')",
              [normalized, await hashPassword(adminPassword)],
            );
          } catch (error) {
            if (error.code !== "ER_DUP_ENTRY") throw error;
          }
        }
        const account = await rows(pool, "SELECT role FROM accounts WHERE email = ?", [normalized]);
        if (account[0]?.role !== "admin") {
          throw new Error("ADMIN_EMAIL ya existe como cuenta de cliente; usa otro correo para el administrador.");
        }
      }

      const admin = await rows(pool, "SELECT 1 FROM accounts WHERE role = 'admin' LIMIT 1");
      if (admin.length === 0) {
        throw new Error("Configura ADMIN_EMAIL y ADMIN_PASSWORD para crear el primer administrador.");
      }

      const maximum = await maximumRepairNumber(pool);
      await execute(
        pool,
        `INSERT INTO app_counters (key_name, value) VALUES ('repair', ?)
         ON DUPLICATE KEY UPDATE value = GREATEST(value, VALUES(value))`,
        [maximum],
      );
    },

    async createAccount(email, passwordHash) {
      await execute(
        pool,
        "INSERT INTO accounts (email, password_hash, role) VALUES (?, ?, 'client')",
        [email, passwordHash],
      );
    },

    async getAccount(email) {
      const result = await rows(
        pool,
        `SELECT email, password_hash AS passwordHash, role, phone
         FROM accounts WHERE email = ?`,
        [email],
      );
      return result[0] ?? null;
    },

    async savePhoneLoginCode(phone, codeHash, expiresAt) {
      await execute(
        pool,
        `INSERT INTO phone_login_codes (phone, code_hash, expires_at, attempts)
         VALUES (?, ?, ?, 0)
         ON DUPLICATE KEY UPDATE
           code_hash = VALUES(code_hash),
           expires_at = VALUES(expires_at),
           attempts = 0`,
        [phone, codeHash, expiresAt],
      );
    },

    async consumePhoneLoginCode(phone, codeHash, now) {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const result = await rows(
          connection,
          "SELECT code_hash, expires_at, attempts FROM phone_login_codes WHERE phone = ? FOR UPDATE",
          [phone],
        );
        const stored = result[0];
        if (!stored || Number(stored.expires_at) <= now || stored.attempts >= 5) {
          await execute(connection, "DELETE FROM phone_login_codes WHERE phone = ?", [phone]);
          await connection.commit();
          return false;
        }
        if (stored.code_hash !== codeHash) {
          await execute(
            connection,
            "UPDATE phone_login_codes SET attempts = attempts + 1 WHERE phone = ?",
            [phone],
          );
          await connection.commit();
          return false;
        }
        await execute(connection, "DELETE FROM phone_login_codes WHERE phone = ?", [phone]);
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
      const lockName = createPhoneLockName(phone);
      let lockAcquired = false;
      try {
        const lockResult = await rows(connection, "SELECT GET_LOCK(?, 10) AS acquired", [lockName]);
        lockAcquired = Number(lockResult[0]?.acquired) === 1;
        if (!lockAcquired) throw new Error("No se pudo reservar el acceso temporal para este celular.");

        await connection.beginTransaction();
        let result = await rows(connection, "SELECT email, role, phone FROM accounts WHERE phone = ?", [phone]);
        if (result.length === 0) {
          const email = `whatsapp-${phone.replace(/\D/g, "")}@phone.invalid`;
          await execute(
            connection,
            `INSERT IGNORE INTO accounts (email, password_hash, role, phone)
             VALUES (?, NULL, 'client', ?)`,
            [email, phone],
          );
          result = await rows(connection, "SELECT email, role, phone FROM accounts WHERE phone = ?", [phone]);
        }

        const account = result[0];
        if (!account || account.role !== "client") {
          await connection.commit();
          return null;
        }

        const repairs = await rows(
          connection,
          `SELECT id, phone FROM repairs
           WHERE owner_phone IS NULL AND owner_email IS NULL`,
        );
        for (const repair of repairs) {
          if (normalizePhone(repair.phone) === phone) {
            await execute(connection, "UPDATE repairs SET owner_phone = ? WHERE id = ?", [phone, repair.id]);
          }
        }
        await connection.commit();
        return account;
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        if (lockAcquired) {
          try {
            await execute(connection, "SELECT RELEASE_LOCK(?)", [lockName]);
          } finally {
            connection.release();
          }
        } else {
          connection.release();
        }
      }
    },

    async listRepairs(account) {
      const result = account.role === "admin"
        ? await rows(pool, "SELECT * FROM repairs ORDER BY id")
        : await rows(
            pool,
            `SELECT * FROM repairs
             WHERE owner_email = ? OR (owner_email IS NULL AND owner_phone = ?)
             ORDER BY id`,
            [account.email, account.phone || ""],
          );
      return result
        .filter((row) =>
          account.role === "admin" ||
          row.owner_email === account.email ||
          (account.phone && row.owner_email === null && row.owner_phone === account.phone &&
            normalizePhone(row.phone) === account.phone),
        )
        .map(mapRepair);
    },

    async saveRepairs(account, repairs) {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        await rows(connection, "SELECT value FROM app_counters WHERE key_name = 'repair' FOR UPDATE");
        for (const repair of repairs) {
          const ownerEmail = account.role === "admin" ? (repair.ownerEmail || null) : account.email;
          const ownerPhone = account.role === "admin" ? (repair.ownerPhone || null) : (account.phone || null);
          const status = account.role === "admin" ? repair.status : "Recibido";
          const values = [
            repair.id, repair.customer, repair.phone, repair.device, repair.problem,
            status, repair.updated, repair.createdAt || null, ownerEmail, ownerPhone,
            repair.authorizedBy || null, repair.signature || null,
            JSON.stringify(repair.photos || []), repair.contactEmail || null,
            repair.whatsappOptIn === true,
          ];
          const duplicateUpdate = account.role === "admin"
            ? `customer = VALUES(customer), phone = VALUES(phone), device = VALUES(device),
               problem = VALUES(problem), status = VALUES(status), updated = VALUES(updated),
               created_at = VALUES(created_at), owner_email = VALUES(owner_email),
               owner_phone = VALUES(owner_phone), authorized_by = VALUES(authorized_by),
               signature = VALUES(signature), photos = VALUES(photos),
               contact_email = VALUES(contact_email), whatsapp_opt_in = VALUES(whatsapp_opt_in)`
            : "id = VALUES(id)";
          await execute(
            connection,
            `INSERT INTO repairs
              (id, customer, phone, device, problem, status, updated, created_at, owner_email,
               owner_phone, authorized_by, signature, photos, contact_email, whatsapp_opt_in)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE ${duplicateUpdate}`,
            values,
          );
        }
        const maximum = await maximumRepairNumber(connection);
        await execute(
          connection,
          "UPDATE app_counters SET value = GREATEST(value, ?) WHERE key_name = 'repair'",
          [maximum],
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
        const counter = await rows(
          connection,
          "SELECT value FROM app_counters WHERE key_name = 'repair' FOR UPDATE",
        );
        const maximum = await maximumRepairNumber(connection);
        const value = Math.max(Number(counter[0]?.value ?? 1000), maximum) + 1;
        if (!Number.isSafeInteger(value) || value > 99_999_999) {
          throw new Error("Se alcanzó el límite de códigos de reparación.");
        }
        await execute(connection, "UPDATE app_counters SET value = ? WHERE key_name = 'repair'", [value]);
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
      await execute(pool, "DELETE FROM repairs WHERE id = ?", [id]);
    },

    async getRepairById(id) {
      const result = await rows(pool, "SELECT * FROM repairs WHERE id = ?", [id]);
      return result[0] ?? null;
    },

    async lookupRepair(id, phone) {
      const result = await rows(
        pool,
        "SELECT * FROM repairs WHERE id = ? AND owner_email IS NULL",
        [id],
      );
      const row = result[0];
      const storedPhone = normalizePhone(row?.phone);
      const requestedPhone = normalizePhone(phone);
      if (!storedPhone || storedPhone !== requestedPhone) return null;
      return mapRepair(row);
    },

    async getSetting(key) {
      const result = await rows(pool, "SELECT value FROM app_settings WHERE key_name = ?", [key]);
      return result[0]?.value ?? null;
    },

    async saveSetting(key, value) {
      await execute(
        pool,
        `INSERT INTO app_settings (key_name, value) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE value = VALUES(value)`,
        [key, JSON.stringify(value)],
      );
    },

    async deleteSetting(key) {
      await execute(pool, "DELETE FROM app_settings WHERE key_name = ?", [key]);
    },

    async loadInventory() {
      const result = await rows(pool, "SELECT value FROM inventory ORDER BY id");
      return result.map(({ value }) => value);
    },

    async saveInventory(items) {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        await execute(connection, "DELETE FROM inventory");
        for (const item of items) {
          await execute(
            connection,
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
