import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomInt } from "node:crypto";
import { readFile } from "node:fs/promises";
import mysql from "mysql2/promise";
import { createDatabase } from "../src/database.js";

const connectionString = process.env.MYSQL_TEST_URL;
const migrationDirectory = new URL("../migrations/", import.meta.url);
const baseMigrations = [
  "001_accounts.sql",
  "002_repairs.sql",
  "003_app_counters.sql",
  "004_phone_login_codes.sql",
  "005_app_settings.sql",
  "006_inventory.sql",
];
const allMigrations = [
  ...baseMigrations,
  "007_repair_revisions.sql",
  "008_customer_warranties.sql",
  "009_backfill_repair_revisions.sql",
  "010_audit_history.sql",
  "011_inventory_movements.sql",
];

test("las migraciones instalan, adoptan y recuperan esquemas MySQL sin perder datos", {
  skip: !connectionString,
}, async (t) => {
  const sourceUrl = new URL(connectionString);
  if (!["localhost", "127.0.0.1", "::1"].includes(sourceUrl.hostname) ||
      !decodeURIComponent(sourceUrl.pathname.slice(1)).endsWith("_test")) {
    throw new Error("MYSQL_TEST_URL solo puede apuntar a MySQL local cuyo nombre termine en _test.");
  }

  const administrativeConnection = await mysql.createConnection({
    host: sourceUrl.hostname,
    port: Number(sourceUrl.port || 3306),
    user: decodeURIComponent(sourceUrl.username),
    password: decodeURIComponent(sourceUrl.password),
  });
  const suffix = randomInt(1_000_000, 9_999_999);
  const databaseNames = [
    `migration_empty_${suffix}_test`,
    `migration_legacy_${suffix}_test`,
    `migration_current_${suffix}_test`,
    `migration_unrecognized_${suffix}_test`,
  ];
  const createdDatabases = new Set();
  const databasePools = [];

  function createTestDatabase(name) {
    const url = new URL(connectionString);
    url.pathname = `/${name}`;
    const database = createDatabase(url.toString());
    databasePools.push(database);
    return database;
  }

  async function executeFiles(name, files) {
    const url = new URL(connectionString);
    url.pathname = `/${name}`;
    const connection = await mysql.createConnection(url.toString());
    try {
      for (const file of files) {
        await connection.query(await readFile(new URL(file, migrationDirectory), "utf8"));
      }
    } finally {
      await connection.end();
    }
  }

  async function seedRepair(name, id) {
    const url = new URL(connectionString);
    url.pathname = `/${name}`;
    const connection = await mysql.createConnection(url.toString());
    try {
      await connection.execute(
        `INSERT INTO repairs
          (id, customer, phone, device, problem, status, updated, photos, whatsapp_opt_in)
         VALUES (?, 'Migration test', '+573001234567', 'Equipo', 'Prueba', 'Recibido', 'hoy', JSON_ARRAY(), FALSE)`,
        [id],
      );
    } finally {
      await connection.end();
    }
  }

  async function queryDatabase(name, statement, values = []) {
    const url = new URL(connectionString);
    url.pathname = `/${name}`;
    const connection = await mysql.createConnection(url.toString());
    try {
      const [rows] = await connection.execute(statement, values);
      return rows;
    } finally {
      await connection.end();
    }
  }

  t.after(async () => {
    for (const database of databasePools) await database.close();
    try {
      for (const name of createdDatabases) {
        await administrativeConnection.query(`DROP DATABASE IF EXISTS \`${name}\``);
      }
    } finally {
      await administrativeConnection.end();
    }
  });

  for (const name of databaseNames) {
    await administrativeConnection.query(
      `CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`,
    );
    createdDatabases.add(name);
  }

  const unrecognizedUrl = new URL(connectionString);
  unrecognizedUrl.pathname = `/${databaseNames[3]}`;
  const unrecognizedSetup = await mysql.createConnection(unrecognizedUrl.toString());
  try {
    await unrecognizedSetup.query("CREATE TABLE unrelated_data (id INT NOT NULL PRIMARY KEY)");
  } finally {
    await unrecognizedSetup.end();
  }
  const unrecognizedDatabase = createTestDatabase(databaseNames[3]);
  await assert.rejects(
    unrecognizedDatabase.migrate(),
    /tablas sin historial que no corresponden al esquema conocido/,
  );
  assert.equal(
    Number((await queryDatabase(
      databaseNames[3],
      "SELECT COUNT(*) AS tableCount FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()",
    ))[0].tableCount),
    2,
    "el migrador no debe adoptar ni ampliar una base desconocida",
  );

  const freshDatabase = createTestDatabase(databaseNames[0]);
  const secondFreshDatabase = createTestDatabase(databaseNames[0]);
  const parallelResults = await Promise.all([
    freshDatabase.migrate(),
    secondFreshDatabase.migrate(),
  ]);
  assert.deepEqual(parallelResults.map(({ applied }) => applied).sort(), [0, 11]);
  assert.equal((await freshDatabase.migrate()).applied, 0);
  const checksumSql = (await readFile(
    new URL("001_accounts.sql", migrationDirectory),
    "utf8",
  )).replace(/\r\n/g, "\n").trim();
  const checksum = createHash("sha256").update(checksumSql).digest("hex");
  const checksumSetupUrl = new URL(connectionString);
  checksumSetupUrl.pathname = `/${databaseNames[0]}`;
  const checksumSetup = await mysql.createConnection(checksumSetupUrl.toString());
  try {
    await checksumSetup.execute(
      "UPDATE schema_migrations SET checksum = ? WHERE migration_id = ?",
      ["0".repeat(64), "001_accounts"],
    );
  } finally {
    await checksumSetup.end();
  }
  await assert.rejects(freshDatabase.migrate(), /Cambió el contenido de la migración ya aplicada 001_accounts/);
  const checksumRestore = await mysql.createConnection(checksumSetupUrl.toString());
  try {
    await checksumRestore.execute(
      "UPDATE schema_migrations SET checksum = ? WHERE migration_id = ?",
      [checksum, "001_accounts"],
    );
    await checksumRestore.execute(
      "DELETE FROM schema_migrations WHERE migration_id = ?",
      ["002_repairs"],
    );
  } finally {
    await checksumRestore.end();
  }
  await assert.rejects(freshDatabase.migrate(), /El historial de migraciones no es secuencial/);
  const gapRestore = await mysql.createConnection(checksumSetupUrl.toString());
  try {
    const secondChecksumSql = (await readFile(
      new URL("002_repairs.sql", migrationDirectory),
      "utf8",
    )).replace(/\r\n/g, "\n").trim();
    await gapRestore.execute(
      "INSERT INTO schema_migrations (migration_id, checksum) VALUES (?, ?)",
      ["002_repairs", createHash("sha256").update(secondChecksumSql).digest("hex")],
    );
  } finally {
    await gapRestore.end();
  }
  const freshHistory = await queryDatabase(
    databaseNames[0],
    "SELECT migration_id FROM schema_migrations ORDER BY migration_id",
  );
  assert.equal(freshHistory.length, allMigrations.length);
  assert.equal(
    Number((await queryDatabase(
      databaseNames[0],
      "SELECT COUNT(*) AS tableCount FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()",
    ))[0].tableCount),
    11,
  );

  await executeFiles(databaseNames[1], baseMigrations);
  await seedRepair(databaseNames[1], "REP-91000001");
  const legacyUrl = new URL(connectionString);
  legacyUrl.pathname = `/${databaseNames[1]}`;
  const legacySetup = await mysql.createConnection(legacyUrl.toString());
  try {
    await legacySetup.query(
      "CREATE TABLE repair_revisions (repair_id INT NOT NULL PRIMARY KEY) ENGINE=InnoDB",
    );
  } finally {
    await legacySetup.end();
  }

  const legacyDatabase = createTestDatabase(databaseNames[1]);
  await assert.rejects(legacyDatabase.migrate(), /repair_revisions\.repair_id/);
  const failedHistory = await queryDatabase(
    databaseNames[1],
    "SELECT migration_id FROM schema_migrations ORDER BY migration_id",
  );
  assert.equal(failedHistory.length, baseMigrations.length);
  assert.equal(
    (await queryDatabase(databaseNames[1], "SELECT id FROM repairs WHERE id = ?", ["REP-91000001"])).length,
    1,
  );

  const repairRecovery = await mysql.createConnection(legacyUrl.toString());
  try {
    await repairRecovery.query("DROP TABLE repair_revisions");
  } finally {
    await repairRecovery.end();
  }
  assert.equal((await legacyDatabase.migrate()).applied, 5);
  assert.deepEqual(
    await queryDatabase(
      databaseNames[1],
      "SELECT version FROM repair_revisions WHERE repair_id = ?",
      ["REP-91000001"],
    ),
    [{ version: 1 }],
  );
  assert.equal(
    (await queryDatabase(databaseNames[1], "SELECT migration_id FROM schema_migrations")).length,
    allMigrations.length,
  );

  await executeFiles(databaseNames[2], allMigrations);
  await seedRepair(databaseNames[2], "REP-91000002");
  const currentUrl = new URL(connectionString);
  currentUrl.pathname = `/${databaseNames[2]}`;
  const currentSetup = await mysql.createConnection(currentUrl.toString());
  try {
    await currentSetup.execute(
      "INSERT INTO repair_revisions (repair_id, version) VALUES (?, 7)",
      ["REP-91000002"],
    );
    await currentSetup.execute(
      "INSERT INTO customer_warranties (customer_key, expires_on, updated_by) VALUES (?, ?, ?)",
      ["email:migration@example.test", "2027-02-28", "admin@example.test"],
    );
  } finally {
    await currentSetup.end();
  }

  const currentDatabase = createTestDatabase(databaseNames[2]);
  assert.equal((await currentDatabase.migrate()).applied, 5);
  assert.deepEqual(
    await queryDatabase(
      databaseNames[2],
      "SELECT version FROM repair_revisions WHERE repair_id = ?",
      ["REP-91000002"],
    ),
    [{ version: 7 }],
  );
  assert.deepEqual(
    await queryDatabase(
      databaseNames[2],
      "SELECT DATE_FORMAT(expires_on, '%Y-%m-%d') AS expires_on FROM customer_warranties WHERE customer_key = ?",
      ["email:migration@example.test"],
    ),
    [{ expires_on: "2027-02-28" }],
  );
});
