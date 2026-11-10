import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";

const source = await readFile(new URL("../frontend/public/sw.js", import.meta.url), "utf8");

function getFetchHandler() {
  let fetchHandler;
  runInNewContext(source, {
    URL,
    self: {
      location: { origin: "https://taller.example" },
      addEventListener(type, handler) {
        if (type === "fetch") fetchHandler = handler;
      },
      skipWaiting() {},
      clients: { claim() {} },
    },
    caches: {
      open: async () => ({ put: async () => {} }),
      keys: async () => [],
      match: async () => null,
      delete: async () => true,
    },
    fetch: async () => ({ clone: () => ({}) }),
  });
  return fetchHandler;
}

test("el service worker no intercepta ni almacena respuestas privadas de la API", () => {
  for (const path of ["/api", "/api/auth/me"]) {
    let intercepted = false;
    getFetchHandler()({
      request: { method: "GET", url: `https://taller.example${path}` },
      respondWith() { intercepted = true; },
    });
    assert.equal(intercepted, false, `${path} debe pasar directamente a la red`);
  }
});

test("el service worker conserva el comportamiento de caché para archivos estáticos", () => {
  let intercepted = false;
  getFetchHandler()({
    request: { method: "GET", url: "https://taller.example/assets/app.js" },
    respondWith() { intercepted = true; },
  });
  assert.equal(intercepted, true);
});
