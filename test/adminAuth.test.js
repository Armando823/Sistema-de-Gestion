const test = require("node:test");
const assert = require("node:assert/strict");
const { createAdminAuth, CREDENTIAL_KEY } = require("../adminAuth");

function memoryStore() {
  const data = new Map();
  return { get: (key) => data.get(key) ?? null, set: (key, value) => data.set(key, value), data };
}

test("no está configurado al inicio y no permite entrar", () => {
  const auth = createAdminAuth(memoryStore());
  assert.equal(auth.isConfigured(), false);
  assert.ok(auth.login("admin", "cualquiera123").error);
});

test("rechaza contraseñas cortas o que no son texto", () => {
  const auth = createAdminAuth(memoryStore());
  assert.ok(auth.setup("corta").error);
  assert.ok(auth.setup(12345678).error);
  assert.equal(auth.isConfigured(), false);
});

test("guarda un hash con sal, nunca la contraseña en claro", () => {
  const store = memoryStore();
  const auth = createAdminAuth(store);
  assert.deepEqual(auth.setup("MiClaveSegura1"), { ok: true });
  const saved = JSON.stringify(store.data.get(CREDENTIAL_KEY));
  assert.ok(!saved.includes("MiClaveSegura1"));
  assert.ok(store.data.get(CREDENTIAL_KEY).salt);
});

test("no permite redefinir la contraseña una vez creada", () => {
  const auth = createAdminAuth(memoryStore());
  auth.setup("MiClaveSegura1");
  assert.ok(auth.setup("OtraClaveNueva2").error);
  assert.deepEqual(auth.login("admin", "MiClaveSegura1"), { ok: true });
});

test("login correcto e incorrecto", () => {
  const auth = createAdminAuth(memoryStore());
  auth.setup("MiClaveSegura1");
  assert.deepEqual(auth.login(" Admin ", "MiClaveSegura1"), { ok: true });
  assert.ok(auth.login("admin", "incorrecta123").error);
  assert.ok(auth.login("otro", "MiClaveSegura1").error);
});

test("bloquea 30 s tras 5 intentos fallidos y luego permite de nuevo", () => {
  let time = 1_000_000;
  const auth = createAdminAuth(memoryStore(), () => time);
  auth.setup("MiClaveSegura1");
  for (let i = 0; i < 5; i += 1) auth.login("admin", "mala-clave-1");
  assert.match(auth.login("admin", "MiClaveSegura1").error, /Demasiados intentos/);
  time += 31_000;
  assert.deepEqual(auth.login("admin", "MiClaveSegura1"), { ok: true });
});
