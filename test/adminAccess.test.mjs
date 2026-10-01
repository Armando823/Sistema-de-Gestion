import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";

const appSource = await readFile(new URL("../frontend/src/App.jsx", import.meta.url), "utf8");
const mainSource = await readFile(new URL("../main.js", import.meta.url), "utf8");
const preloadSource = await readFile(new URL("../preload.js", import.meta.url), "utf8");

test("el modo admin entra directamente al panel sin sesión de cliente", () => {
  assert.match(appSource, /ADMIN_ENABLED\s*&&\s*!CLIENT_ENABLED\s*\?\s*"admin"/);
});

test("no hay autenticación administrativa registrada ni expuesta por IPC", () => {
  assert.doesNotMatch(mainSource, /admin:(?:status|setup|login)|createAdminAuth/);
  assert.doesNotMatch(preloadSource, /\badmin:\s*\{/);
});

test("el acceso de clientes conserva registro e inicio de sesión", () => {
  assert.match(appSource, /onClientLogin/);
  assert.match(appSource, /onClientRegister/);
  assert.match(appSource, /type="password"/);
});
