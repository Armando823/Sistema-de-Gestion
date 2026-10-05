// Envía la constancia de una orden al correo del cliente.
//  - En la app de escritorio la petición la hace el proceso principal de
//    Electron (preload -> notify.receipt), que conoce la URL y la clave del
//    servidor de notificaciones (ver server/README.md).
//  - En desarrollo web (npm run dev) usa VITE_NOTIFY_URL si está definida.
import { sendSharedNotification, usesSharedApi } from "./dbService";

const electronAPI = typeof window !== "undefined" ? window.electronAPI : null;
const NOT_CONFIGURED = {
  ok: false,
  code: "not_configured",
  message: "El envío de correos no está configurado.",
};

export function buildReceiptPayload(repair, email) {
  return {
    email: String(email || "").trim(),
    repair: {
      id: repair.id,
      customer: repair.customer,
      phone: repair.phone,
      device: repair.device,
      problem: repair.problem,
      status: repair.status,
      authorizedBy: repair.authorizedBy || "",
      updated: repair.updated || "",
      signature: repair.signature || "",
    },
  };
}

export async function sendReceiptEmail(repair, email) {
  const payload = buildReceiptPayload(repair, email);
  try {
    if (electronAPI?.notify) return await electronAPI.notify.receipt(payload);
    if (usesSharedApi()) {
      const result = await sendSharedNotification(payload);
      return result.ok ? { ok: true } : NOT_CONFIGURED;
    }

    const baseUrl = String(import.meta.env?.VITE_NOTIFY_URL || "").replace(/\/+$/, "");
    if (!baseUrl) return NOT_CONFIGURED;
    const apiKey = import.meta.env?.VITE_NOTIFY_API_KEY; // solo para desarrollo
    const response = await fetch(`${baseUrl}/api/notifications/receipt`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(apiKey ? { "X-Api-Key": apiKey } : {}) },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20_000),
    });
    const data = await response.json().catch(() => ({}));
    if (response.ok && data.ok) return { ok: true };
    return { ok: false, code: "server_error", message: data.error || `Error ${response.status} del servidor de correo.` };
  } catch {
    return { ok: false, code: "network", message: "No se pudo conectar con el servidor de correo." };
  }
}
