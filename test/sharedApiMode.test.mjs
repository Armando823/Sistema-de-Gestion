import test from "node:test";
import assert from "node:assert/strict";
import { shouldUseSharedApi } from "../frontend/src/services/dbService.js";

test("Electron usa la API compartida cuando tiene URL configurada", () => {
  assert.equal(
    shouldUseSharedApi({ hasApiUrl: true, isProduction: true }),
    true,
  );
});

test("una compilación de producción falla sin API en vez de guardar datos localmente", () => {
  assert.equal(
    shouldUseSharedApi({ hasApiUrl: false, isProduction: true }),
    true,
  );
});

test("la web de producción exige la API compartida", () => {
  assert.equal(
    shouldUseSharedApi({ hasApiUrl: false, isProduction: true }),
    true,
  );
});

test("el desarrollo sin URL compartida conserva el almacenamiento local", () => {
  assert.equal(
    shouldUseSharedApi({ hasApiUrl: false, isProduction: false }),
    false,
  );
});
