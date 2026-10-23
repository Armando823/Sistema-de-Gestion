import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";

const migrationDirectory = new URL("../migrations/", import.meta.url);
const baselineMigrationIds = [
  "001_accounts",
  "002_repairs",
  "003_app_counters",
  "004_phone_login_codes",
  "005_app_settings",
  "006_inventory",
];
const legacySchema = {
  accounts: {
    email: "varchar(254)",
    password_hash: "varchar(255)",
    role: "enum('admin','client')",
    phone: "varchar(24)",
    created_at: "timestamp(3)",
  },
  repairs: {
    id: "varchar(12)",
    customer: "varchar(160)",
    phone: "varchar(32)",
    device: "varchar(160)",
    problem: "text",
    status: "varchar(40)",
    updated: "varchar(80)",
    created_at: "varchar(40)",
    owner_email: "varchar(254)",
    owner_phone: "varchar(24)",
    authorized_by: "varchar(160)",
    signature: "mediumtext",
    photos: "json",
    contact_email: "varchar(254)",
    whatsapp_opt_in: "tinyint(1)",
  },
  app_counters: {
    counter_key: "varchar(64)",
    value: "bigint unsigned",
  },
  phone_login_codes: {
    phone: "varchar(24)",
    code_hash: "char(64)",
    expires_at: "datetime(3)",
    attempts: "tinyint unsigned",
  },
  app_settings: {
    key: "varchar(100)",
    value: "json",
  },
  inventory: {
    id: "varchar(100)",
    value: "json",
  },
};

const migrationSchema = {
  "007_repair_revisions": {
    repair_revisions: {
      repair_id: "varchar(12)",
      version: "bigint unsigned",
    },
  },
  "008_customer_warranties": {
    customer_warranties: {
      customer_key: "varchar(280)",
      expires_on: "date",
      updated_by: "varchar(254)",
      updated_at: "timestamp(3)",
    },
  },
};

function migrationChecksum(sql) {
  return createHash("sha256").update(sql).digest("hex");
}

async function loadMigrations() {
  const files = await readdir(migrationDirectory);
  const sqlFiles = files.filter((name) => name.endsWith(".sql"));
  const invalidNames = sqlFiles.filter((name) => !/^\d{3}_[a-z0-9_]+\.sql$/.test(name));
  if (invalidNames.length > 0) {
    throw new Error(`Nombre de migración inválido: ${invalidNames.join(", ")}.`);
  }
  const names = sqlFiles.sort();
  const migrations = [];
  for (const name of names) {
    const sql = (await readFile(new URL(name, migrationDirectory), "utf8"))
      .replace(/\r\n/g, "\n")
      .trim();
    const statement = sql.replace(/;\s*$/, "");
    if (!statement || statement.includes(";")) {
      throw new Error(`La migración ${name} debe contener exactamente una sentencia SQL.`);
    }
    migrations.push({
      id: name.slice(0, -4),
      sql,
      checksum: migrationChecksum(sql),
    });
  }
  if (migrations.length === 0) throw new Error("No hay migraciones SQL disponibles.");
  for (const [index, migration] of migrations.entries()) {
    const expectedOrder = String(index + 1).padStart(3, "0");
    if (!migration.id.startsWith(`${expectedOrder}_`)) {
      throw new Error(`La secuencia de migraciones está incompleta antes de ${migration.id}.`);
    }
  }
  return migrations;
}

async function inspectTables(connection, names) {
  const placeholders = names.map(() => "?").join(", ");
  const [tables] = await connection.execute(
    `SELECT TABLE_NAME AS tableName, ENGINE AS engine
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (${placeholders})`,
    names,
  );
  const [columns] = await connection.execute(
    `SELECT TABLE_NAME AS tableName, COLUMN_NAME AS columnName, COLUMN_TYPE AS columnType
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (${placeholders})`,
    names,
  );
  return {
    tables: new Map(tables.map((table) => [table.tableName, table])),
    columns: new Map(columns.map((column) => [
      `${column.tableName}.${column.columnName}`,
      column.columnType.toLowerCase().replace(/\s+/g, ""),
    ])),
  };
}

async function validateSchema(connection, expected, description) {
  const tableNames = Object.keys(expected);
  const actual = await inspectTables(connection, tableNames);
  const problems = [];
  for (const [tableName, columns] of Object.entries(expected)) {
    const table = actual.tables.get(tableName);
    if (!table) {
      problems.push(`falta la tabla ${tableName}`);
      continue;
    }
    if (table.engine?.toLowerCase() !== "innodb") {
      problems.push(`${tableName} no usa InnoDB`);
    }
    for (const [columnName, expectedType] of Object.entries(columns)) {
      const actualType = actual.columns.get(`${tableName}.${columnName}`);
      if (!actualType) problems.push(`falta ${tableName}.${columnName}`);
      else if (actualType !== expectedType.toLowerCase().replace(/\s+/g, "")) {
        problems.push(`${tableName}.${columnName} tiene tipo ${actualType}; se esperaba ${expectedType}`);
      }
    }
  }
  if (problems.length > 0) {
    throw new Error(`El esquema ${description} no es compatible: ${problems.join("; ")}.`);
  }
}

async function baselineLegacySchema(connection, migrations) {
  const names = Object.keys(legacySchema);
  const actual = await inspectTables(connection, names);
  const present = names.filter((name) => actual.tables.has(name));
  if (present.length === 0) {
    const [[tableRow]] = await connection.query(
      `SELECT COUNT(*) AS tableCount
       FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_TYPE = 'BASE TABLE'
         AND TABLE_NAME <> 'schema_migrations'`,
    );
    if (Number(tableRow.tableCount) > 0) {
      throw new Error("La base contiene tablas sin historial que no corresponden al esquema conocido.");
    }
    return false;
  }
  await validateSchema(connection, legacySchema, "existente sin historial de migraciones");
  const [indexRows] = await connection.execute(
    `SELECT TABLE_NAME AS tableName, INDEX_NAME AS indexName, NON_UNIQUE AS nonUnique,
            SEQ_IN_INDEX AS sequence, COLUMN_NAME AS columnName
     FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (${names.map(() => "?").join(", ")})
     ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX`,
    names,
  );
  const indexes = new Map();
  for (const row of indexRows) {
    const key = `${row.tableName}.${row.indexName}`;
    if (!indexes.has(key)) indexes.set(key, { columns: [], nonUnique: Number(row.nonUnique) });
    indexes.get(key).columns.push(row.columnName);
  }
  const expectedIndexes = {
    "accounts.PRIMARY": { columns: ["email"], nonUnique: 0 },
    "accounts.accounts_phone_idx": { columns: ["phone"], nonUnique: 0 },
    "repairs.PRIMARY": { columns: ["id"], nonUnique: 0 },
    "repairs.repairs_owner_email_idx": { columns: ["owner_email"], nonUnique: 1 },
    "repairs.repairs_owner_phone_idx": { columns: ["owner_phone"], nonUnique: 1 },
    "app_counters.PRIMARY": { columns: ["counter_key"], nonUnique: 0 },
    "phone_login_codes.PRIMARY": { columns: ["phone"], nonUnique: 0 },
    "app_settings.PRIMARY": { columns: ["key"], nonUnique: 0 },
    "inventory.PRIMARY": { columns: ["id"], nonUnique: 0 },
  };
  for (const [indexName, expected] of Object.entries(expectedIndexes)) {
    const actualIndex = indexes.get(indexName);
    if (!actualIndex || actualIndex.nonUnique !== expected.nonUnique ||
        actualIndex.columns.join(",") !== expected.columns.join(",")) {
      throw new Error(`El esquema base existente no es compatible: falta o difiere el índice ${indexName}.`);
    }
  }
  const [foreignKeys] = await connection.execute(
    `SELECT kcu.CONSTRAINT_NAME AS constraintName, kcu.TABLE_NAME AS tableName,
            kcu.COLUMN_NAME AS columnName, kcu.REFERENCED_TABLE_NAME AS referencedTable,
            kcu.REFERENCED_COLUMN_NAME AS referencedColumn, rc.DELETE_RULE AS deleteRule
     FROM information_schema.KEY_COLUMN_USAGE kcu
     JOIN information_schema.REFERENTIAL_CONSTRAINTS rc
       ON rc.CONSTRAINT_SCHEMA = kcu.CONSTRAINT_SCHEMA
       AND rc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
       AND rc.TABLE_NAME = kcu.TABLE_NAME
     WHERE kcu.CONSTRAINT_SCHEMA = DATABASE()
       AND kcu.TABLE_NAME = 'repairs'
       AND kcu.CONSTRAINT_NAME = 'repairs_owner_email_fk'`,
  );
  const ownerForeignKey = foreignKeys[0];
  if (!ownerForeignKey || ownerForeignKey.columnName !== "owner_email" ||
      ownerForeignKey.referencedTable !== "accounts" ||
      ownerForeignKey.referencedColumn !== "email" ||
      ownerForeignKey.deleteRule !== "SET NULL") {
    throw new Error("El esquema base existente no es compatible: difiere repairs_owner_email_fk.");
  }
  const knownMigrations = new Map(migrations.map((migration) => [migration.id, migration]));
  for (const migrationId of baselineMigrationIds) {
    const migration = knownMigrations.get(migrationId);
    if (!migration) throw new Error(`Falta la migración base ${migrationId}.`);
    await connection.execute(
      "INSERT INTO schema_migrations (migration_id, checksum) VALUES (?, ?)",
      [migration.id, migration.checksum],
    );
  }
  return true;
}

async function assertRevisionBackfill(connection) {
  const [rows] = await connection.execute(
    `SELECT COUNT(*) AS missing
     FROM repairs LEFT JOIN repair_revisions ON repair_revisions.repair_id = repairs.id
     WHERE repair_revisions.repair_id IS NULL`,
  );
  if (Number(rows[0].missing) > 0) {
    throw new Error("La migración de revisiones dejó órdenes sin versión inicial.");
  }
}

export async function applyMigrations(pool) {
  const migrations = await loadMigrations();
  const connection = await pool.getConnection();
  let lockAcquired = false;
  let lockName;
  try {
    const [[databaseRow]] = await connection.query("SELECT DATABASE() AS databaseName");
    if (!databaseRow?.databaseName) throw new Error("La conexión MySQL no seleccionó una base de datos.");
    lockName = `schema-migrations-${createHash("sha256")
      .update(databaseRow.databaseName)
      .digest("hex")
      .slice(0, 32)}`;
    const [[lockRow]] = await connection.execute("SELECT GET_LOCK(?, 30) AS acquired", [lockName]);
    if (Number(lockRow.acquired) !== 1) throw new Error("No se pudo adquirir el bloqueo para migrar MySQL.");
    lockAcquired = true;

    await connection.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
        migration_id VARCHAR(128) NOT NULL PRIMARY KEY,
        checksum CHAR(64) NOT NULL,
        applied_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`,
    );

    let [appliedRows] = await connection.execute(
      "SELECT migration_id AS migrationId, checksum FROM schema_migrations ORDER BY migration_id",
    );
    if (appliedRows.length === 0) {
      await baselineLegacySchema(connection, migrations);
      [appliedRows] = await connection.execute(
        "SELECT migration_id AS migrationId, checksum FROM schema_migrations ORDER BY migration_id",
      );
    }
    const knownMigrations = new Map(migrations.map((migration) => [migration.id, migration]));
    const applied = new Map();
    for (const row of appliedRows) {
      const migration = knownMigrations.get(row.migrationId);
      if (!migration) throw new Error(`La base registra una migración desconocida: ${row.migrationId}.`);
      if (row.checksum !== migration.checksum) {
        throw new Error(`Cambió el contenido de la migración ya aplicada ${row.migrationId}.`);
      }
      applied.set(row.migrationId, row.checksum);
    }

    let pendingMigrationSeen = false;
    for (const migration of migrations) {
      if (!applied.has(migration.id)) {
        pendingMigrationSeen = true;
      } else if (pendingMigrationSeen) {
        throw new Error(`El historial de migraciones no es secuencial antes de ${migration.id}.`);
      }
    }

    let appliedCount = 0;
    for (const migration of migrations) {
      if (applied.has(migration.id)) continue;
      await connection.query(migration.sql);
      if (migrationSchema[migration.id]) {
        await validateSchema(connection, migrationSchema[migration.id], `creado por ${migration.id}`);
      }
      if (migration.id === "009_backfill_repair_revisions") {
        await assertRevisionBackfill(connection);
      }
      await connection.execute(
        "INSERT INTO schema_migrations (migration_id, checksum) VALUES (?, ?)",
        [migration.id, migration.checksum],
      );
      appliedCount += 1;
    }
    return { applied: appliedCount, current: migrations.at(-1).id };
  } finally {
    try {
      if (lockAcquired) await connection.execute("SELECT RELEASE_LOCK(?)", [lockName]);
    } finally {
      connection.release();
    }
  }
}
