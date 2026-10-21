import test from "node:test";
import assert from "node:assert/strict";
import { createDatabase } from "../src/database.js";

const connectionString = process.env.TEST_DATABASE_URL;

test("PostgreSQL asocia y consulta teléfonos solo con coincidencia E.164 exacta", {
  skip: !connectionString,
}, async (t) => {
  const database = createDatabase(connectionString);
  const ids = ["REP-9011", "REP-9012", "REP-9013", "REP-9014", "REP-9015"];
  const adminEmail = "integration-admin@example.invalid";

  t.after(async () => {
    for (const id of ids) await database.deleteRepair(id);
    await database.close();
  });

  await database.initialize({
    adminEmail,
    adminPassword: "integration-password",
    hashPassword: async () => "integration-hash",
  });

  await database.saveRepairs({ email: adminEmail, role: "admin" }, [
    { id: ids[0], customer: "Exact", phone: "+57 300 123 4567", device: "Equipo", problem: "Falla", status: "Recibido", updated: "hoy" },
    { id: ids[1], customer: "Suffix", phone: "+1 300 123 4567", device: "Equipo", problem: "Falla", status: "Recibido", updated: "hoy" },
    { id: ids[2], customer: "Legacy", phone: "300 123 4567", device: "Equipo", problem: "Falla", status: "Recibido", updated: "hoy" },
    { id: ids[3], customer: "Email-owned", phone: "+57 300 123 4567", device: "Equipo", problem: "Falla", status: "Recibido", updated: "hoy", ownerEmail: adminEmail },
  ]);

  const account = await database.getOrCreatePhoneAccount("+573001234567");
  assert.equal(account.phone, "+573001234567");
  assert.deepEqual(
    (await database.listRepairs(account)).map(({ id }) => id).sort(),
    [ids[0]],
  );
  assert.equal(await database.lookupRepair(ids[0], "+57 300 123 4567") !== null, true);
  assert.equal(await database.lookupRepair(ids[1], "+573001234567"), null);
  assert.equal(await database.lookupRepair(ids[2], "+573001234567"), null);

  await database.saveRepairs(account, [
    { id: ids[4], customer: "Client-created", phone: account.phone, device: "Equipo", problem: "Falla", status: "Entregado", updated: "hoy" },
  ]);
  const owned = await database.listRepairs(account);
  assert.equal(owned.find(({ id }) => id === ids[4])?.status, "Recibido");
});
