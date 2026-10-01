// Envío de la constancia por correo desde el proceso principal de Electron.
// La app NO manda correos por sí misma (no lleva credenciales SMTP): le pide
// al servicio de notificaciones de la carpeta /server que lo haga.
const fs = require("node:fs");
const path = require("node:path");

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

// Solo https en servidores reales; http únicamente para pruebas en esta PC.
function isAllowedUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol === "https:") return true;
    return url.protocol === "http:" && LOCAL_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

// Orden de prioridad: variables de entorno -> server-config.json en la
// carpeta de datos de la app ({"notifyUrl": "...", "notifyApiKey": "..."}).
function loadNotifyConfig({ env = process.env, userDataDir, readFile = fs.readFileSync } = {}) {
  let file = {};
  if (userDataDir) {
    try {
      file = JSON.parse(readFile(path.join(userDataDir, "server-config.json"), "utf8"));
    } catch {
      file = {};
    }
  }
  const url = String(env.NOTIFY_URL || file.notifyUrl || "").trim().replace(/\/+$/, "");
  const apiKey = String(env.NOTIFY_API_KEY || file.notifyApiKey || "").trim();
  return { url, apiKey };
}

const REPAIR_FIELDS = ["id", "customer", "phone", "device", "problem", "status", "authorizedBy", "updated", "signature"];

// Solo viaja lo necesario (sin fotos del equipo ni datos de la cuenta).
function pickPayload(payload) {
  if (!payload || typeof payload.email !== "string" || !payload.repair || typeof payload.repair !== "object") return null;
  const repair = {};
  for (const field of REPAIR_FIELDS) {
    if (typeof payload.repair[field] === "string") repair[field] = payload.repair[field];
  }
  return { email: payload.email, repair };
}

function createNotifier({ getConfig, fetchImpl = globalThis.fetch, timeoutMs = 20_000 }) {
  return {
    async sendReceipt(payload) {
      const body = pickPayload(payload);
      if (!body) return { ok: false, code: "invalid", message: "Datos de la orden inválidos." };

      const { url, apiKey } = getConfig();
      if (!url) {
        return {
          ok: false,
          code: "not_configured",
          message: "El envío de correos no está configurado en este equipo.",
        };
      }
      if (!isAllowedUrl(url)) {
        return { ok: false, code: "bad_config", message: "La dirección del servidor de correo debe empezar con https://." };
      }

      try {
        const response = await fetchImpl(`${url}/api/notifications/receipt`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(apiKey ? { "X-Api-Key": apiKey } : {}) },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(timeoutMs),
        });
        let data = {};
        try {
          data = await response.json();
        } catch {
          data = {};
        }
        if (response.ok && data.ok) return { ok: true };
        return {
          ok: false,
          code: response.status === 429 ? "rate_limited" : "server_error",
          message: data.error || `El servidor de correo respondió con el error ${response.status}.`,
        };
      } catch {
        return { ok: false, code: "network", message: "No se pudo conectar con el servidor de correo." };
      }
    },
  };
}

module.exports = { createNotifier, loadNotifyConfig, isAllowedUrl, pickPayload };
