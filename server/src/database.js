import pg from "pg";

const { Pool } = pg;

export function createDatabase(connectionString) {
  const pool = new Pool({
    connectionString,
    ssl: process.env.NODE_ENV === "production" ? true : undefined,
    max: 5,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
  });

  return {
    async initialize({ adminEmail, adminPassword, hashPassword }) {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS accounts (
          email TEXT PRIMARY KEY,
          password_hash TEXT NOT NULL,
          role TEXT NOT NULL CHECK (role IN ('admin', 'client')),
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
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
          authorized_by TEXT,
          signature TEXT,
          photos JSONB NOT NULL DEFAULT '[]'::jsonb,
          contact_email TEXT
        );
        CREATE TABLE IF NOT EXISTS app_counters (
          key TEXT PRIMARY KEY,
          value BIGINT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS repairs_owner_email_idx ON repairs(owner_email);
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
        "SELECT email, password_hash AS \"passwordHash\", role FROM accounts WHERE email = $1",
        [email],
      );
      return result.rows[0] ?? null;
    },

    async listRepairs(account) {
      const result = account.role === "admin"
        ? await pool.query("SELECT * FROM repairs ORDER BY id")
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
        authorizedBy: row.authorized_by || undefined,
        signature: row.signature || undefined,
        photos: row.photos,
        contactEmail: row.contact_email || undefined,
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
             authorized_by, signature, photos, contact_email)
          VALUES
            ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13)
          ON CONFLICT (id) DO UPDATE SET
            customer=EXCLUDED.customer, phone=EXCLUDED.phone, device=EXCLUDED.device,
            problem=EXCLUDED.problem, status=EXCLUDED.status, updated=EXCLUDED.updated,
            created_at=EXCLUDED.created_at, authorized_by=EXCLUDED.authorized_by,
            signature=EXCLUDED.signature, photos=EXCLUDED.photos, contact_email=EXCLUDED.contact_email,
            owner_email=CASE WHEN $14 = 'admin' THEN EXCLUDED.owner_email ELSE repairs.owner_email END
          WHERE $14 = 'admin'
        `;
        for (const repair of repairs) {
          const ownerEmail = account.role === "admin"
            ? (repair.ownerEmail || null)
            : account.email;
          await client.query(upsert, [
            repair.id, repair.customer, repair.phone, repair.device, repair.problem,
            repair.status, repair.updated, repair.createdAt || null, ownerEmail,
            repair.authorizedBy || null, repair.signature || null,
            JSON.stringify(repair.photos || []), repair.contactEmail || null, account.role,
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
