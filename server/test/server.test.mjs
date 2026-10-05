import test from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "../src/config.js";
import { createApp } from "../src/app.js";
import { sendWithRetry } from "../src/mailer.js";
import { parseReceiptRequest, buildReceiptEmail } from "../src/receiptEmail.js";
import { createRateLimiter } from "../src/rateLimiter.js";
import { createSessionToken, hashPassword } from "../src/auth.js";

// PNG mínimo válido de 1x1.
const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

const repair = {
  id: "REP-1001",
  customer: "Ana <b>Pérez</b>",
  phone: "300 123 4567",
  device: "HP Pavilion 15",
  problem: "No enciende\nSe oye un pitido",
  status: "Recibido",
  authorizedBy: "Ana Pérez",
  updated: "1/10/26, 7:30 p. m.",
  signature: PNG,
};
const goodBody = { email: "ana@correo.com", repair };
const silent = { info() {}, warn() {}, error() {} };

function makeConfig(extra = {}) {
  return {
    ...loadConfig({ MAIL_DRY_RUN: "true", NOTIFY_API_KEY: "clave-de-prueba-123456" }),
    sessionSecret: "session-secret-for-tests-at-least-32-bytes",
    business: { name: "Taller Digital", phone: "+57 300 000 0000", email: "soporte@taller.com", address: "Calle 1", hours: "L-S 8-6", responseTime: "24 horas" },
    ...extra,
  };
}

async function start({ config = makeConfig(), mailer, database } = {}) {
  const sent = [];
  const fake = mailer || { async send(message) { sent.push(message); return {}; } };
  const server = createApp({ config, mailer: fake, database, log: silent, sleep: async () => {} });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  return { url, sent, close: () => new Promise((resolve) => server.close(resolve)) };
}

function post(url, body, headers = {}) {
  return fetch(`${url}/api/notifications/receipt`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Api-Key": "clave-de-prueba-123456", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

test("config: en producción exige API key y SMTP", () => {
  assert.throws(() => loadConfig({ NODE_ENV: "production", MAIL_DRY_RUN: "true" }), /NOTIFY_API_KEY/);
  assert.throws(() => loadConfig({ NOTIFY_API_KEY: "x" }), /MAIL_FROM/);
  assert.doesNotThrow(() => loadConfig({ MAIL_FROM: "a@b.co", SMTP_HOST: "smtp.b.co" }));
});

test("config: usa el puerto del entorno y valida su rango", () => {
  assert.equal(loadConfig({ PORT: "10000", MAIL_DRY_RUN: "true" }).port, 10000);
  assert.equal(loadConfig({ MAIL_DRY_RUN: "true" }).port, 3001);
  assert.throws(() => loadConfig({ PORT: "10000abc", MAIL_DRY_RUN: "true" }), /PORT debe ser/);
  assert.throws(() => loadConfig({ PORT: "65536", MAIL_DRY_RUN: "true" }), /PORT debe ser/);
});

test("API web: registro público crea clientes, el login emite sesión y protege recursos", async () => {
  const accounts = new Map();
  let nextRepairNumber = 1000;
  accounts.set("admin@taller.com", {
    email: "admin@taller.com",
    passwordHash: await hashPassword("ContraseñaAdmin123"),
    role: "admin",
  });
  const database = {
    async createAccount(email, passwordHash) {
      if (accounts.has(email)) throw Object.assign(new Error("duplicate"), { code: "23505" });
      accounts.set(email, { email, passwordHash, role: "client" });
    },
    async getAccount(email) { return accounts.get(email) || null; },
    async listRepairs() { return []; },
    async nextRepairId() {
      nextRepairNumber += 1;
      return `REP-${String(nextRepairNumber).padStart(4, "0")}`;
    },
    async getSetting() { return { businessName: "Taller" }; },
  };
  const app = await start({ database });
  try {
    const register = await fetch(`${app.url}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "cliente@correo.com", password: "Contraseña123" }),
    });
    assert.equal(register.status, 201);
    assert.deepEqual(await register.json(), {
      account: { email: "cliente@correo.com", role: "client" },
    });
    assert.match(accounts.get("cliente@correo.com").passwordHash, /^scrypt\$/);

    const login = await fetch(`${app.url}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "CLIENTE@correo.com", password: "Contraseña123" }),
    });
    assert.equal(login.status, 200);
    const { token, account } = await login.json();
    assert.equal(account.role, "client");
    assert.equal((await fetch(`${app.url}/api/repairs`)).status, 401);
    const repairs = await fetch(`${app.url}/api/repairs`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(repairs.status, 200);
    assert.equal((await fetch(`${app.url}/api/repairs/next-id`, { method: "POST" })).status, 401);
    const reservedIds = await Promise.all([1, 2].map(async () => {
      const response = await fetch(`${app.url}/api/repairs/next-id`, {
        method: "POST",
        headers: { Authorization: ["Bearer", token].join(" ") },
      });
      assert.equal(response.status, 200);
      return (await response.json()).id;
    }));
    assert.deepEqual(reservedIds, ["REP-1001", "REP-1002"]);

    const adminToken = createSessionToken(
      { email: "admin@taller.com", role: "admin" },
      makeConfig().sessionSecret,
    );
    const adminSetting = await fetch(`${app.url}/api/settings/workshop-settings`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(adminSetting.status, 200);
    const forbidden = await fetch(`${app.url}/api/settings/workshop-logo`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(forbidden.status, 403);
  } finally {
    await app.close();
  }
});

test("el límite de acceso se mantiene sin mostrar el número de intentos", async () => {
  const app = await start({
    database: { async getAccount() { return null; } },
  });
  try {
    let response;
    for (let attempt = 0; attempt < 11; attempt += 1) {
      response = await fetch(`${app.url}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "admin@taller.com", password: "WrongPassword123" }),
      });
    }
    assert.equal(response.status, 429);
    assert.ok(response.headers.get("retry-after"));
    const payload = await response.json();
    assert.equal(payload.error, "No se pudo completar el acceso. Inténtalo de nuevo más tarde.");
    assert.doesNotMatch(payload.error, /intento[s]?/i);
  } finally {
    await app.close();
  }
});

test("la validación acepta una orden correcta y rechaza datos malos", () => {
  assert.equal(parseReceiptRequest(goodBody).ok, true);
  assert.equal(parseReceiptRequest({ ...goodBody, email: "no-es-correo" }).ok, false);
  assert.equal(parseReceiptRequest({ ...goodBody, email: "a@b.co,otro@b.co" }).ok, false);
  assert.equal(parseReceiptRequest({ ...goodBody, repair: { ...repair, id: "X-1" } }).ok, false);
  assert.equal(parseReceiptRequest({ ...goodBody, repair: { ...repair, customer: "" } }).ok, false);
  assert.equal(parseReceiptRequest({ ...goodBody, repair: { ...repair, signature: "data:image/png;base64,AAAA" } }).ok, false);
  assert.equal(parseReceiptRequest({ ...goodBody, repair: { ...repair, signature: "data:text/html;base64,AAAA" } }).ok, false);
  assert.equal(parseReceiptRequest({ ...goodBody, repair: { ...repair, signature: undefined } }).ok, true);
});

test("el correo escapa HTML, lleva firma inline y los datos de contacto", () => {
  const { value } = parseReceiptRequest(goodBody);
  const message = buildReceiptEmail(value, makeConfig().business);
  assert.equal(message.to, "ana@correo.com");
  assert.match(message.subject, /REP-1001/);
  assert.ok(!message.html.includes("<b>Pérez"), "el HTML del cliente debe ir escapado");
  assert.match(message.html, /&lt;b&gt;Pérez/);
  assert.match(message.html, /cid:firma-cliente/);
  assert.match(message.text, /REP-1001/);
  assert.match(message.text, /\+57 300 000 0000/);
  assert.match(message.text, /24 horas/);
  assert.equal(message.replyTo, "soporte@taller.com");
  assert.ok(message.attachments.some((a) => a.cid === "firma-cliente"));
  assert.ok(message.attachments.some((a) => a.filename === "constancia-REP-1001.html"));
});

test("sin firma no se adjunta imagen", () => {
  const { value } = parseReceiptRequest({ ...goodBody, repair: { ...repair, signature: "" } });
  const message = buildReceiptEmail(value, makeConfig().business);
  assert.ok(!message.html.includes("cid:firma-cliente"));
  assert.equal(message.attachments.length, 1);
});

test("POST válido envía el correo y responde ok", async () => {
  const app = await start();
  try {
    const response = await post(app.url, goodBody);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
    assert.equal(app.sent.length, 1);
    assert.equal(app.sent[0].to, "ana@correo.com");
  } finally {
    await app.close();
  }
});

test("rechaza API key incorrecta, JSON roto, content-type y rutas/métodos erróneos", async () => {
  const app = await start();
  try {
    assert.equal((await post(app.url, goodBody, { "X-Api-Key": "mala" })).status, 401);
    assert.equal((await post(app.url, "{no json")).status, 400);
    assert.equal((await post(app.url, goodBody, { "Content-Type": "text/plain" })).status, 415);
    assert.equal((await post(app.url, { email: "x", repair })).status, 422);
    assert.equal((await fetch(`${app.url}/api/notifications/receipt`)).status, 405);
    assert.equal((await fetch(`${app.url}/nada`)).status, 404);
    assert.equal((await fetch(`${app.url}/health`)).status, 200);
    assert.equal(app.sent.length, 0);
  } finally {
    await app.close();
  }
});

test("rechaza cuerpos demasiado grandes", async () => {
  const app = await start({ config: makeConfig({ limits: { perIpPerHour: 50, perEmailPerHour: 5, bodyBytes: 100 } }) });
  try {
    assert.equal((await post(app.url, goodBody)).status, 413);
  } finally {
    await app.close();
  }
});

test("limita los correos por destinatario", async () => {
  const app = await start({ config: makeConfig({ limits: { perIpPerHour: 50, perEmailPerHour: 2, bodyBytes: 3_500_000 } }) });
  try {
    assert.equal((await post(app.url, goodBody)).status, 200);
    assert.equal((await post(app.url, goodBody)).status, 200);
    const third = await post(app.url, goodBody);
    assert.equal(third.status, 429);
    assert.ok(third.headers.get("retry-after"));
    assert.equal(app.sent.length, 2);
  } finally {
    await app.close();
  }
});

test("limita las peticiones por IP", async () => {
  const app = await start({ config: makeConfig({ limits: { perIpPerHour: 2, perEmailPerHour: 50, bodyBytes: 3_500_000 } }) });
  try {
    await post(app.url, goodBody);
    await post(app.url, goodBody);
    assert.equal((await post(app.url, goodBody)).status, 429);
  } finally {
    await app.close();
  }
});

test("si el SMTP falla responde 502 sin filtrar el detalle", async () => {
  let calls = 0;
  const app = await start({
    mailer: { async send() { calls += 1; throw new Error("ECONNREFUSED secreto-interno"); } },
  });
  try {
    const response = await post(app.url, goodBody);
    assert.equal(response.status, 502);
    const payload = await response.json();
    assert.ok(!JSON.stringify(payload).includes("secreto-interno"));
    assert.equal(calls, 3, "reintenta 3 veces los fallos temporales");
  } finally {
    await app.close();
  }
});

test("un rechazo permanente (5xx) no se reintenta", async () => {
  let calls = 0;
  const mailer = { async send() { calls += 1; throw Object.assign(new Error("550 no existe"), { responseCode: 550 }); } };
  await assert.rejects(sendWithRetry(mailer, {}, { sleep: async () => {}, log: silent }));
  assert.equal(calls, 1);
});

test("un fallo temporal se recupera en el reintento", async () => {
  let calls = 0;
  const mailer = { async send() { calls += 1; if (calls < 2) throw new Error("timeout"); return { ok: true }; } };
  assert.deepEqual(await sendWithRetry(mailer, {}, { sleep: async () => {}, log: silent }), { ok: true });
  assert.equal(calls, 2);
});

test("CORS solo para orígenes permitidos (preflight y respuesta real)", async () => {
  const app = await start({ config: makeConfig({ allowedOrigins: ["https://taller.example"] }) });
  const route = `${app.url}/api/notifications/receipt`;
  try {
    const preflight = await fetch(route, { method: "OPTIONS", headers: { Origin: "https://taller.example" } });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get("access-control-allow-origin"), "https://taller.example");
    const real = await post(app.url, goodBody, { Origin: "https://taller.example" });
    assert.equal(real.headers.get("access-control-allow-origin"), "https://taller.example");
    const denied = await fetch(route, { method: "OPTIONS", headers: { Origin: "https://malo.example" } });
    assert.equal(denied.headers.get("access-control-allow-origin"), null);
  } finally {
    await app.close();
  }
});

test("el limitador libera la ventana con el tiempo", () => {
  let clock = 0;
  const limiter = createRateLimiter({ limit: 1, windowMs: 1000, now: () => clock });
  assert.equal(limiter.take("a").allowed, true);
  assert.equal(limiter.take("a").allowed, false);
  clock = 1500;
  assert.equal(limiter.take("a").allowed, true);
  limiter.stop();
});
