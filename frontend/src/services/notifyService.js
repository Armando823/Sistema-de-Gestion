import { sendSharedNotification } from "./dbService";

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
  try {
    const result = await sendSharedNotification(buildReceiptPayload(repair, email));
    return result.ok
      ? { ok: true }
      : { ok: false, code: "server_error", message: result.error || "No se pudo enviar la constancia." };
  } catch (error) {
    return { ok: false, code: "network", message: error.message || "No se pudo conectar con el servidor." };
  }
}
