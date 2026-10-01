import test from "node:test";
import assert from "node:assert/strict";
import { createHash, webcrypto } from "node:crypto";
import { hashPassword, verifyPassword } from "../frontend/src/utils/password.js";

globalThis.crypto ??= webcrypto;

test("las contraseñas nuevas usan PBKDF2 con sal aleatoria", async () => {
  const first = await hashPassword("ContraseñaSegura123");
  const second = await hashPassword("ContraseñaSegura123");
  assert.match(first, /^pbkdf2\$310000\$/);
  assert.notEqual(first, second);
  assert.deepEqual(await verifyPassword("ContraseñaSegura123", first), {
    valid: true,
    needsRehash: false,
  });
  assert.equal((await verifyPassword("otra contraseña", first)).valid, false);
});

test("las contraseñas guardadas con SHA-256 siguen funcionando y se pueden migrar", async () => {
  const legacyHash = createHash("sha256").update("ContraseñaAnterior123").digest("hex");
  assert.deepEqual(await verifyPassword("ContraseñaAnterior123", legacyHash), {
    valid: true,
    needsRehash: true,
  });
  assert.equal((await verifyPassword("incorrecta", legacyHash)).valid, false);
});
