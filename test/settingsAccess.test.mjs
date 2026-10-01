import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const appSource = await readFile(new URL("../frontend/src/App.jsx", import.meta.url), "utf8");

test("Ajustes se guardan y se vuelven a leer a través de la API de Electron", async () => {
  const stored = new Map();
  globalThis.window = {
    electronAPI: {
      settings: {
        get: async (key) => stored.get(key) ?? null,
        set: async (key, value) => {
          stored.set(key, value);
          return true;
        },
      },
    },
  };
  const { readSetting, saveSetting } = await import("../frontend/src/services/dbService.js?settings-test");
  const key = "workshop-settings";
  const value = { businessName: "Taller de prueba", darkMode: true };

  assert.equal(await saveSetting(key, value), true);
  assert.deepEqual(await readSetting(key, {}), value);
});

test("el estado de carga de ajustes se pasa al panel y habilita su guardado", () => {
  assert.match(appSource, /<AdminView[\s\S]*?settingsReady=\{settingsReady\}/);
  assert.match(appSource, /function AdminView\([\s\S]*?settingsReady,[\s\S]*?\) \{/);
  assert.match(appSource, /if \(!settingsReady\) return;/);
});
