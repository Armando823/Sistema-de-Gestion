const test = require("node:test");
const assert = require("node:assert/strict");
const { createNotifier, loadNotifyConfig, isAllowedUrl, pickPayload } = require("../notifier");

const payload = {
  email: "ana@correo.com",
  repair: {
    id: "REP-1001",
    customer: "Ana",
    phone: "3001234567",
    device: "HP",
    problem: "No enciende",
    status: "Recibido",
    authorizedBy: "Ana",
    updated: "hoy",
    signature: "data:image/png;base64,AAAA",
    photos: ["data:image/jpeg;base64,BBBB"],
    ownerEmail: "ana@correo.com",
  },
};

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

test("solo se permite https (o http en esta misma PC)", () => {
  assert.equal(isAllowedUrl("https://correo.taller.com"), true);
  assert.equal(isAllowedUrl("http://localhost:3001"), true);
  assert.equal(isAllowedUrl("http://127.0.0.1:3001"), true);
  assert.equal(isAllowedUrl("http://correo.taller.com"), false);
  assert.equal(isAllowedUrl("ftp://x.com"), false);
  assert.equal(isAllowedUrl("no es url"), false);
});

test("la configuración sale del entorno o de server-config.json", () => {
  const readFile = () => JSON.stringify({ notifyUrl: "https://a.com/", notifyApiKey: "k1" });
  assert.deepEqual(loadNotifyConfig({ env: {}, userDataDir: "/x", readFile }), { url: "https://a.com", apiKey: "k1" });
  assert.deepEqual(
    loadNotifyConfig({ env: { NOTIFY_URL: "https://b.com", NOTIFY_API_KEY: "k2" }, userDataDir: "/x", readFile }),
    { url: "https://b.com", apiKey: "k2" },
  );
  const missing = () => { throw new Error("ENOENT"); };
  assert.deepEqual(loadNotifyConfig({ env: {}, userDataDir: "/x", readFile: missing }), { url: "", apiKey: "" });
});

test("solo viajan los campos necesarios (sin fotos ni cuenta)", () => {
  const sent = pickPayload(payload);
  assert.equal(sent.repair.photos, undefined);
  assert.equal(sent.repair.ownerEmail, undefined);
  assert.equal(sent.repair.signature, "data:image/png;base64,AAAA");
  assert.equal(pickPayload(null), null);
  assert.equal(pickPayload({ email: 1, repair: {} }), null);
});

test("envía la petición con la clave y devuelve ok", async () => {
  let call;
  const notifier = createNotifier({
    getConfig: () => ({ url: "https://correo.taller.com", apiKey: "secreta" }),
    fetchImpl: async (url, options) => { call = { url, options }; return jsonResponse(200, { ok: true }); },
  });
  assert.deepEqual(await notifier.sendReceipt(payload), { ok: true });
  assert.equal(call.url, "https://correo.taller.com/api/notifications/receipt");
  assert.equal(call.options.headers["X-Api-Key"], "secreta");
  assert.ok(!call.options.body.includes("BBBB"), "las fotos no deben salir de la PC");
});

test("informa los distintos fallos sin lanzar excepciones", async () => {
  const make = (config, fetchImpl) => createNotifier({ getConfig: () => config, fetchImpl });
  const ok = { url: "https://x.com", apiKey: "" };

  assert.equal((await make({ url: "", apiKey: "" }, async () => {}).sendReceipt(payload)).code, "not_configured");
  assert.equal((await make({ url: "http://x.com", apiKey: "" }, async () => {}).sendReceipt(payload)).code, "bad_config");
  assert.equal((await make(ok, async () => { throw new Error("ECONNREFUSED"); }).sendReceipt(payload)).code, "network");
  assert.equal((await make(ok, async () => jsonResponse(429, { error: "Demasiadas" })).sendReceipt(payload)).code, "rate_limited");
  const failed = await make(ok, async () => jsonResponse(502, { error: "No se pudo enviar el correo." })).sendReceipt(payload);
  assert.deepEqual([failed.ok, failed.code, failed.message], [false, "server_error", "No se pudo enviar el correo."]);
  assert.equal((await make(ok, async () => {}).sendReceipt({ nada: true })).code, "invalid");
});
