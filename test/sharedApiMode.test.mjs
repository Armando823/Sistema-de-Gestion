import test from "node:test";
import assert from "node:assert/strict";
import { shouldUseSharedApi } from "../frontend/src/services/dbService.js";

test("Electron no cambia a la API aunque haya una URL configurada", () => {
  assert.equal(
    shouldUseSharedApi({ isDesktop: true, hasApiUrl: true, isProduction: true }),
    false,
  );
});

test("Electron conserva SQLite local aunque sea una compilación de producción", () => {
  assert.equal(
    shouldUseSharedApi({ isDesktop: true, hasApiUrl: false, isProduction: true }),
    false,
  );
});

test("la web de producción exige la API compartida", () => {
  assert.equal(
    shouldUseSharedApi({ isDesktop: false, hasApiUrl: false, isProduction: true }),
    true,
  );
});

test("el desarrollo sin URL compartida conserva el almacenamiento local", () => {
  assert.equal(
    shouldUseSharedApi({ isDesktop: false, hasApiUrl: false, isProduction: false }),
    false,
  );
});

test("la web usa la API compartida cuando se configura su URL", () => {
  assert.equal(
    shouldUseSharedApi({ isDesktop: false, hasApiUrl: true, isProduction: false }),
    true,
  );
});
