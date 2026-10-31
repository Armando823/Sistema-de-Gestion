import test from "node:test";
import assert from "node:assert/strict";
import { randomInt } from "node:crypto";
import mysql from "mysql2/promise";
import { createDatabase } from "../src/database.js";

const connectionString = process.env.MYSQL_TEST_URL;

test("MySQL asocia y consulta teléfonos solo con coincidencia E.164 exacta", {
  skip: !connectionString,
}, async (t) => {
  const testUrl = new URL(connectionString);
  if (!["localhost", "127.0.0.1", "::1"].includes(testUrl.hostname) || !testUrl.pathname.endsWith("_test")) {
    throw new Error("MYSQL_TEST_URL solo puede apuntar a MySQL local cuyo nombre termine en _test.");
  }
  const database = createDatabase(connectionString);
  const firstId = randomInt(10_000_000, 99_999_994);
  const ids = Array.from({ length: 6 }, (_, index) => `REP-${firstId + index}`);
  const adminEmail = `integration-admin-${firstId}@example.invalid`;
  const phone = `+57${randomInt(300_000_000, 399_999_999)}`;
  const phoneEmail = `whatsapp-${phone.replace(/\D/g, "")}@phone.invalid`;
  let initialized = false;
  let seeded = false;
  let phoneAccountCreated = false;
  let warrantySaved = false;
  let inventoryCreated = false;
  const inventoryId = `inventory-${firstId}`;

  t.after(async () => {
    try {
      if (initialized) {
        const cleanup = await mysql.createConnection(connectionString);
        try {
          if (seeded) {
            await cleanup.execute(
              `DELETE FROM repair_status_history WHERE repair_id IN (${ids.map(() => "?").join(", ")})`,
              ids,
            );
            await cleanup.execute(
              `DELETE FROM repairs WHERE id IN (${ids.map(() => "?").join(", ")})`,
              ids,
            );
          }
          if (warrantySaved) {
            await cleanup.execute("DELETE FROM customer_warranties WHERE customer_key = ?", [`email:${adminEmail}`]);
          }
          if (inventoryCreated) {
            await cleanup.execute("DELETE FROM inventory WHERE id = ?", [inventoryId]);
          }
          await cleanup.execute("DELETE FROM inventory_movements WHERE item_id = ? OR actor_email = ?", [inventoryId, adminEmail]);
          if (phoneAccountCreated) {
            await cleanup.execute("DELETE FROM phone_login_codes WHERE phone = ?", [phone]);
            await cleanup.execute(
              "DELETE FROM accounts WHERE email IN (?, ?) OR phone = ?",
              [adminEmail, phoneEmail, phone],
            );
          } else {
            await cleanup.execute("DELETE FROM accounts WHERE email = ?", [adminEmail]);
          }
        } finally {
          await cleanup.end();
        }
      }
    } finally {
      await database.close();
    }
  });

  await database.migrate();
  initialized = true;
  await database.initialize({
    adminEmail,
    adminPassword: "integration-password",
    hashPassword: async () => "integration-hash",
  });

  for (const id of ids) {
    assert.equal(await database.getRepairById(id), null, `el identificador ${id} ya existe en la base de pruebas`);
  }
  assert.equal(await database.getRepairSyncRevision(), "0");

  const seededRepairs = [
    { id: ids[0], customer: "Exact", phone, device: "Equipo", problem: "Falla", status: "Recibido", updated: "hoy" },
    { id: ids[1], customer: "Suffix", phone: `+1 ${phone.slice(3)}`, device: "Equipo", problem: "Falla", status: "Recibido", updated: "hoy" },
    { id: ids[2], customer: "Legacy", phone: phone.slice(3), device: "Equipo", problem: "Falla", status: "Recibido", updated: "hoy" },
    { id: ids[3], customer: "Email-owned", phone, device: "Equipo", problem: "Falla", status: "Recibido", updated: "hoy", ownerEmail: adminEmail },
    { id: ids[5], customer: "Stale-link", phone: `+1 ${phone.slice(3)}`, device: "Equipo", problem: "Falla", status: "Recibido", updated: "hoy", ownerPhone: phone },
  ];
  for (const repair of seededRepairs) {
    await database.createRepair({ email: adminEmail, role: "admin" }, repair);
  }
  seeded = true;
  assert.equal(await database.getRepairSyncRevision(), "5");
  const adminAccount = { email: adminEmail, role: "admin" };
  const exactRepair = (await database.listRepairs(adminAccount)).find(({ id }) => id === ids[0]);
  assert.equal(exactRepair.version, 1);
  const concurrentUpdates = await Promise.all([
    database.updateRepair(ids[0], exactRepair.version, {
      status: "En diagnóstico",
      updated: "integración",
    }, adminEmail),
    database.updateRepair(ids[0], exactRepair.version, {
      status: "Entregado",
      updated: "concurrente",
    }, adminEmail),
  ]);
  const revisedRepair = concurrentUpdates.find((repair) => !repair.conflict);
  assert.equal(concurrentUpdates.filter((repair) => repair.conflict).length, 1);
  assert.equal(revisedRepair.version, 2);
  assert.equal(await database.getRepairSyncRevision(), "6");
  const staleUpdate = await database.updateRepair(ids[0], exactRepair.version, {
    status: "Entregado",
    updated: "obsoleto",
  }, adminEmail);
  assert.deepEqual(staleUpdate, { conflict: true, version: 2 });
  assert.equal(await database.getRepairSyncRevision(), "6");
  const statusHistory = await database.listRepairStatusHistory(ids[0]);
  assert.equal(statusHistory.length, 1);
  assert.equal(statusHistory[0].previousStatus, "Recibido");
  assert.equal(statusHistory[0].newStatus, revisedRepair.status);
  assert.equal(statusHistory[0].actorEmail, adminEmail);

  await database.saveCustomerWarranty(`email:${adminEmail}`, "2027-02-28", adminEmail);
  warrantySaved = true;
  assert.equal((await database.listCustomerWarranties())[ `email:${adminEmail}` ], "2027-02-28");

  const inventoryItem = {
    id: inventoryId,
    item: "Integration item",
    sku: `SKU-${firstId}`,
    category: "Test",
    stock: 2,
    minimum: 1,
    cost: 100,
    supplier: "Test supplier",
  };
  await database.createInventoryItem(inventoryItem, adminEmail);
  inventoryCreated = true;
  const concurrentMovements = await Promise.all([
    database.adjustInventoryStock(inventoryId, -1, adminEmail),
    database.adjustInventoryStock(inventoryId, -1, adminEmail),
  ]);
  assert.deepEqual(concurrentMovements.map(({ stock }) => stock).sort(), [0, 1]);
  assert.deepEqual(await database.adjustInventoryStock(inventoryId, -1, adminEmail), { conflict: true, stock: 0 });
  const updatedInventory = await database.updateInventoryItem(
    inventoryId,
    { ...inventoryItem, minimum: 3 },
    0,
    adminEmail,
  );
  assert.equal(updatedInventory.stock, 0);
  assert.equal(updatedInventory.minimum, 3);
  assert.equal(await database.deleteInventoryItem(inventoryId, adminEmail), true);
  inventoryCreated = false;
  const inventoryHistory = await database.listInventoryMovements({ limit: 10 });
  assert.deepEqual(inventoryHistory.map(({ action }) => action), [
    "deleted",
    "updated",
    "stock_adjusted",
    "stock_adjusted",
    "created",
  ]);
  assert.deepEqual(inventoryHistory.map(({ actorEmail }) => actorEmail), Array(5).fill(adminEmail));
  assert.equal(inventoryHistory[0].quantityDelta, 0);
  assert.equal(inventoryHistory[0].stockAfter, null);
  assert.deepEqual(
    (await database.listInventoryMovements({ beforeId: inventoryHistory[0].id, limit: 10 }))
      .map(({ action }) => action),
    ["updated", "stock_adjusted", "stock_adjusted", "created"],
  );

  const account = await database.getOrCreatePhoneAccount(phone);
  phoneAccountCreated = true;
  assert.equal(account.phone, phone);
  assert.deepEqual(
    (await database.listRepairs(account)).map(({ id }) => id).sort(),
    [ids[0]],
  );
  assert.equal(await database.lookupRepair(ids[0], phone) !== null, true);
  assert.equal(await database.lookupRepair(ids[1], phone), null);
  assert.equal(await database.lookupRepair(ids[2], phone), null);

  await database.createRepair(account, {
    id: ids[4],
    customer: "Client-created",
    phone: account.phone,
    device: "Equipo",
    problem: "Falla",
    status: "Entregado",
    updated: "hoy",
  });
  const owned = await database.listRepairs(account);
  assert.equal(owned.find(({ id }) => id === ids[4])?.status, "Recibido");
  assert.equal(await database.getRepairSyncRevision(), "8");
  await database.deleteRepair(ids[4]);
  assert.equal(await database.getRepairById(ids[4]), null);
  assert.equal(await database.getRepairSyncRevision(), "9");
});
