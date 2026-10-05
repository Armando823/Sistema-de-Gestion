import pg from "pg";

const { Pool } = pg;

export function createDatabase(connectionString) {
  const pool = new Pool({
    connectionString,
    ssl: process.env.NODE_ENV === "production"
      ? { rejectUnauthorized: false }
      : undefined,
    max: 5,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
  });

  return {
    async initialize({ adminEmail, adminPassword, hashPassword }) {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS accounts (
          email TEXT PRIMARY KEY,
          password_hash TEXT,
          role TEXT NOT NULL CHECK (role IN ('admin', 'client')),
          phone TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        ALTER TABLE accounts ADD COLUMN IF NOT EXISTS phone TEXT;
        ALTER TABLE accounts ALTER COLUMN password_hash DROP NOT NULL;
        CREATE UNIQUE INDEX IF NOT EXISTS accounts_phone_idx
          ON accounts(phone) WHERE phone IS NOT NULL;
        CREATE TABLE IF NOT EXISTS repairs (
          id TEXT PRIMARY KEY,
          customer TEXT NOT NULL,
          phone TEXT NOT NULL,
          device TEXT NOT NULL,
          problem TEXT NOT NULL,
          status TEXT NOT NULL,
          updated TEXT NOT NULL,
          created_at TEXT,
          owner_email TEXT REFERENCES accounts(email) ON DELETE SET NULL,
          owner_phone TEXT,
          authorized_by TEXT,
          signature TEXT,
          photos JSONB NOT NULL DEFAULT '[]'::jsonb,
          contact_email TEXT,
          whatsapp_opt_in BOOLEAN NOT NULL DEFAULT false
        );
        ALTER TABLE repairs ADD COLUMN IF NOT EXISTS owner_phone TEXT;
        ALTER TABLE repairs ADD COLUMN IF NOT EXISTS whatsapp_opt_in BOOLEAN NOT NULL DEFAULT false;
        CREATE TABLE IF NOT EXISTS app_counters (
          key TEXT PRIMARY KEY,
          value BIGINT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS repairs_owner_email_idx ON repairs(owner_email);
        CREATE INDEX IF NOT EXISTS repairs_owner_phone_idx ON repairs(owner_phone);
        CREATE TABLE IF NOT EXISTS phone_login_codes (
          phone TEXT PRIMARY KEY,
          code_hash TEXT NOT NULL,
          expires_at TIMESTAMPTZ NOT NULL,
          attempts INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS app_settings (
          key TEXT PRIMARY KEY,
          value JSONB NOT NULL
        );
        CREATE TABLE IF NOT EXISTS inventory (
          id TEXT PRIMARY KEY,
          value JSONB NOT NULL
        );
        INSERT INTO app_counters (key, value)
        SELECT 'repair', COALESCE(MAX(SUBSTRING(id FROM 5)::BIGINT), 1000)
        FROM repairs
        WHERE id ~ '^REP-[0-9]{4,8}$'
        ON CONFLICT (key) DO UPDATE
          SET value = GREATEST(app_counters.value, EXCLUDED.value);
      `);
      if (adminEmail && adminPassword) {
        const normalized = adminEmail.trim().toLowerCase();
        const result = await pool.query("SELECT role FROM accounts WHERE email = $1", [normalized]);
        if (result.rowCount === 0) {
          await pool.query(
            "INSERT INTO accounts (email, password_hash, role) VALUES ($1, $2, 'admin')",
            [normalized, await hashPassword(adminPassword)],
          );
        } else if (result.rows[0].role !== "admin") {
          throw new Error("ADMIN_EMAIL ya existe como cuenta de cliente; usa otro correo para el administrador.");
        }
      }
      const admin = await pool.query("SELECT 1 FROM accounts WHERE role = 'admin' LIMIT 1");
      if (admin.rowCount === 0) {
        throw new Error("Configura ADMIN_EMAIL y ADMIN_PASSWORD para crear el primer administrador.");
      }
    },

    async createAccount(email, passwordHash) {
      await pool.query(
        "INSERT INTO accounts (email, password_hash, role) VALUES ($1, $2, 'client')",
        [email, passwordHash],
      );
    },

    async getAccount(email) {
      const result = await pool.query(
        "SELECT email, password_hash AS \"passwordHash\", role, phone FROM accounts WHERE email = $1",
        [email],
      );
      return result.rows[0] ?? null;
    },

    async savePhoneLoginCode(phone, codeHash, expiresAt) {
      await pool.query(
        `INSERT INTO phone_login_codes (phone, code_hash, expires_at, attempts)
         VALUES ($1, $2, $3, 0)
         ON CONFLICT (phone) DO UPDATE SET
           code_hash = EXCLUDED.code_hash,
           expires_at = EXCLUDED.expires_at,
           attempts = 0`,
        [phone, codeHash, new Date(expiresAt)],
      );
    },

    async consumePhoneLoginCode(phone, codeHash, now) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await client.query(
          "SELECT code_hash, expires_at, attempts FROM phone_login_codes WHERE phone = $1 FOR UPDATE",
          [phone],
        );
        const stored = result.rows[0];
        if (!stored || new Date(stored.expires_at).getTime() <= now || stored.attempts >= 5) {
          await client.query("DELETE FROM phone_login_codes WHERE phone = $1", [phone]);
          await client.query("COMMIT");
          return false;
        }
        if (stored.code_hash !== codeHash) {
          await client.query(
            `UPDATE phone_login_codes
             SET attempts = attempts + 1
             WHERE phone = $1`,
            [phone],
          );
          await client.query("COMMIT");
          return false;
        }
        await client.query("DELETE FROM phone_login_codes WHERE phone = $1", [phone]);
        await client.query("COMMIT");
        return true;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async getOrCreatePhoneAccount(phone) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [phone]);
        let result = await client.query(
          "SELECT email, role, phone FROM accounts WHERE phone = $1",
          [phone],
        );
        if (result.rowCount === 0) {
          const email = `whatsapp-${phone.replace(/\D/g, "")}@phone.invalid`;
          result = await client.query(
            `INSERT INTO accounts (email, password_hash, role, phone)
             VALUES ($1, NULL, 'client', $2)
             ON CONFLICT (email) DO UPDATE SET phone = EXCLUDED.phone
             RETURNING email, role, phone`,
            [email, phone],
          );
        }
        const account = result.rows[0];
        if (account.role !== "client") {
          await client.query("COMMIT");
          return null;
        }
        await client.query(
          `UPDATE repairs
           SET owner_phone = $1
           WHERE owner_phone IS NULL
             AND right(regexp_replace(phone, '\\D', '', 'g'), 10) = right(regexp_replace($1, '\\D', '', 'g'), 10)`,
          [phone],
        );
        await client.query("COMMIT");
        return account;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async listRepairs(account) {
      const result = account.role === "admin"
        ? await pool.query("SELECT * FROM repairs ORDER BY id")
        : account.phone
          ? await pool.query(
              `SELECT * FROM repairs
               WHERE owner_email = $1 OR owner_phone = $2
               ORDER BY id`,
              [account.email, account.phone],
            )
          : await pool.query("SELECT * FROM repairs WHERE owner_email = $1 ORDER BY id", [account.email]);
      return result.rows.map((row) => ({
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
        whatsappOptIn: row.whatsapp_opt_in,
      }));
    },

    async saveRepairs(account, repairs) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT pg_advisory_xact_lock(731942, 1)");
        const upsert = `
          INSERT INTO repairs
            (id, customer, phone, device, problem, status, updated, created_at, owner_email,
               owner_phone, authorized_by, signature, photos, contact_email, whatsapp_opt_in)
          VALUES
              ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,$15)
          ON CONFLICT (id) DO UPDATE SET
            customer=EXCLUDED.customer, phone=EXCLUDED.phone, device=EXCLUDED.device,
            problem=EXCLUDED.problem, status=EXCLUDED.status, updated=EXCLUDED.updated,
            created_at=EXCLUDED.created_at, authorized_by=EXCLUDED.authorized_by,
            signature=EXCLUDED.signature, photos=EXCLUDED.photos, contact_email=EXCLUDED.contact_email,
            whatsapp_opt_in=EXCLUDED.whatsapp_opt_in,
            owner_email=CASE WHEN $16 = 'admin' THEN EXCLUDED.owner_email ELSE repairs.owner_email END,
            owner_phone=CASE WHEN $16 = 'admin' THEN EXCLUDED.owner_phone ELSE COALESCE(repairs.owner_phone, EXCLUDED.owner_phone) END
          WHERE $16 = 'admin'
        `;
        for (const repair of repairs) {
          const ownerEmail = account.role === "admin"
            ? (repair.ownerEmail || null)
            : account.email;
          const ownerPhone = account.role === "admin"
            ? (repair.ownerPhone || null)
            : (account.phone || null);
          await client.query(upsert, [
            repair.id, repair.customer, repair.phone, repair.device, repair.problem,
            repair.status, repair.updated, repair.createdAt || null, ownerEmail, ownerPhone,
            repair.authorizedBy || null, repair.signature || null,
            JSON.stringify(repair.photos || []), repair.contactEmail || null,
            repair.whatsappOptIn === true, account.role,
          ]);
        }
        await client.query(`
          UPDATE app_counters
          SET value = GREATEST(value, (
            SELECT COALESCE(MAX(SUBSTRING(id FROM 5)::BIGINT), 1000)
            FROM repairs
            WHERE id ~ '^REP-[0-9]{4,8}$'
          ))
          WHERE key = 'repair'
        `);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async nextRepairId() {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT pg_advisory_xact_lock(731942, 1)");
        const result = await client.query(`
          UPDATE app_counters
          SET value = GREATEST(value, (
            SELECT COALESCE(MAX(SUBSTRING(id FROM 5)::BIGINT), 1000)
            FROM repairs
            WHERE id ~ '^REP-[0-9]{4,8}$'
          )) + 1
          WHERE key = 'repair'
          RETURNING value
        `);
        const value = Number(result.rows[0]?.value);
        if (!Number.isSafeInteger(value) || value > 99_999_999) {
          throw new Error("Se alcanzó el límite de códigos de reparación.");
        }
        await client.query("COMMIT");
        return `REP-${String(value).padStart(4, "0")}`;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async deleteRepair(id) {
      await pool.query("DELETE FROM repairs WHERE id = $1", [id]);
    },

    async getRepairById(id) {
      const result = await pool.query("SELECT * FROM repairs WHERE id = $1", [id]);
      return result.rows[0] ?? null;
    },

    async lookupRepair(id, phone) {
      const result = await pool.query(
        "SELECT * FROM repairs WHERE id = $1 AND owner_email IS NULL",
        [id],
      );
      const digits = (value) => String(value).replace(/\D/g, "");
      const storedPhone = digits(result.rows[0]?.phone);
      const requestedPhone = digits(phone);
      const comparableDigits = Math.min(storedPhone.length, requestedPhone.length, 10);
      if (comparableDigits < 7 ||
          storedPhone.slice(-comparableDigits) !== requestedPhone.slice(-comparableDigits)) return null;
      const row = result.rows[0];
      return {
        id: row.id,
        customer: row.customer,
        phone: row.phone,
        device: row.device,
        problem: row.problem,
        status: row.status,
        updated: row.updated,
        createdAt: row.created_at || undefined,
        ownerEmail: undefined,
        authorizedBy: row.authorized_by || undefined,
        signature: row.signature || undefined,
        photos: row.photos,
        contactEmail: row.contact_email || undefined,
      };
    },

    async getSetting(key) {
      const result = await pool.query("SELECT value FROM app_settings WHERE key = $1", [key]);
      return result.rows[0]?.value ?? null;
    },

    async saveSetting(key, value) {
      await pool.query(
        `INSERT INTO app_settings (key, value) VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [key, JSON.stringify(value)],
      );
    },

    async deleteSetting(key) {
      await pool.query("DELETE FROM app_settings WHERE key = $1", [key]);
    },

    async loadInventory() {
      const result = await pool.query("SELECT value FROM inventory ORDER BY id");
      return result.rows.map((row) => row.value);
    },

    async saveInventory(items) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("DELETE FROM inventory");
        for (const item of items) {
          await client.query(
            "INSERT INTO inventory (id, value) VALUES ($1, $2::jsonb)",
            [String(item.id), JSON.stringify(item)],
          );
        }
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    close: () => pool.end(),
  };
}
