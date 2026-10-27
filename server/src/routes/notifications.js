import { timingSafeEqual } from "node:crypto";
import { normalizeEmail } from "../auth.js";
import { sendWithRetry } from "../mailer.js";
import { normalizePhone } from "../phone.js";
import { buildReceiptEmail, parseReceiptRequest } from "../receiptEmail.js";

function sameSecret(received, expected) {
  const receivedBytes = Buffer.from(String(received ?? ""));
  const expectedBytes = Buffer.from(String(expected));
  return (
    receivedBytes.length === expectedBytes.length &&
    timingSafeEqual(receivedBytes, expectedBytes)
  );
}

function maskEmail(email) {
  const [user = "", domain = ""] = String(email).split("@");
  return `${user.slice(0, 1)}***@${domain}`;
}

export function createNotificationHandlers({
  config,
  database,
  mailer,
  whatsapp,
  log,
  sleep,
  clientIp,
  ipLimiter,
  emailLimiter,
  orderCodeLimiter,
  requireDatabase,
  requireSession,
  getSession,
  readBody,
  parseJson,
  send,
  HttpError,
}) {
  async function handleWhatsAppRepairCode(req, res, cors) {
    requireDatabase();
    const session = await requireSession(req);
    if (req.method !== "POST") {
      throw new HttpError(405, "Método no permitido.", { Allow: "POST, OPTIONS" });
    }
    const rate = orderCodeLimiter.take(session.phone || session.email);
    if (!rate.allowed) {
      throw new HttpError(429, "No se pudo enviar el mensaje. Inténtalo más tarde.", {
        "Retry-After": String(rate.retryAfterSec),
      });
    }
    const body = parseJson(await readBody(req, 4_096));
    const id = typeof body?.repairId === "string" ? body.repairId.trim().toUpperCase() : "";
    if (!/^REP-\d{4,8}$/.test(id)) {
      throw new HttpError(422, "El código de reparación no es válido.");
    }
    const repair = await database.getRepairById(id);
    if (!repair) throw new HttpError(404, "No se encontró la reparación.");
    let destination;
    if (session.role === "admin") {
      destination = normalizePhone(repair.phone);
    } else if (session.phone &&
      (repair.owner_email === session.email ||
        (!repair.owner_email && repair.owner_phone === session.phone &&
          normalizePhone(repair.phone) === session.phone))) {
      destination = session.phone;
    } else {
      throw new HttpError(403, "No tienes permisos para enviar este código.");
    }
    if (repair.whatsapp_opt_in !== true) {
      throw new HttpError(403, "No se registró autorización para recibir mensajes por WhatsApp.");
    }
    if (!destination) {
      throw new HttpError(422, "El celular debe incluir el código de país para WhatsApp.");
    }
    try {
      await whatsapp.sendRepairCode(destination, id);
    } catch (error) {
      log.error(`No se pudo enviar el código de ${id} por WhatsApp: ${error?.message || error}`);
      throw new HttpError(502, "No se pudo enviar el código por WhatsApp. Inténtalo de nuevo más tarde.");
    }
    send(res, 200, { ok: true }, cors);
  }

  async function handleReceipt(req, res, cors) {
    const ip = clientIp(req);
    const ipCheck = ipLimiter.take(ip);
    if (!ipCheck.allowed) {
      throw new HttpError(429, "Demasiadas solicitudes. Intenta más tarde.", {
        "Retry-After": String(ipCheck.retryAfterSec),
      });
    }

    const session = await getSession(req);
    const authorizedWithApiKey = config.apiKey && sameSecret(req.headers["x-api-key"], config.apiKey);
    if (!authorizedWithApiKey && !session) {
      throw new HttpError(401, "No autorizado.");
    }
    if (!String(req.headers["content-type"] || "").toLowerCase().startsWith("application/json")) {
      throw new HttpError(415, "Se esperaba application/json.");
    }

    const body = parseJson(await readBody(req, config.limits.bodyBytes));
    const parsed = parseReceiptRequest(body);
    if (!parsed.ok) throw new HttpError(422, parsed.error);

    let receipt = parsed.value;
    if (session) {
      requireDatabase();
      const stored = await database.getRepairById(parsed.value.repair.id);
      const isOwner = stored && (
        session.role === "admin" ||
        stored.owner_email === session.email ||
        (!stored.owner_email && session.phone && stored.owner_phone === session.phone)
      );
      if (!isOwner) {
        throw new HttpError(403, "No tienes permisos para enviar esta constancia.");
      }
      const savedEmail = typeof stored.contact_email === "string" ? stored.contact_email.trim() : "";
      if (!savedEmail || normalizeEmail(parsed.value.email) !== normalizeEmail(savedEmail)) {
        throw new HttpError(403, "El correo no coincide con el registrado en la orden.");
      }
      const savedReceipt = parseReceiptRequest({
        email: savedEmail,
        repair: {
          id: stored.id,
          customer: stored.customer,
          phone: stored.phone,
          device: stored.device,
          problem: stored.problem,
          status: stored.status,
          authorizedBy: stored.authorized_by || "",
          updated: stored.updated || "",
          signature: stored.signature || "",
        },
      });
      if (!savedReceipt.ok) throw new HttpError(422, savedReceipt.error);
      receipt = savedReceipt.value;
    }

    const emailCheck = emailLimiter.take(receipt.email.toLowerCase());
    if (!emailCheck.allowed) {
      throw new HttpError(429, "Ya se enviaron varios correos a esta dirección. Intenta más tarde.", {
        "Retry-After": String(emailCheck.retryAfterSec),
      });
    }

    const message = buildReceiptEmail(receipt, config.business);
    try {
      await sendWithRetry(mailer, message, { log, sleep });
    } catch (error) {
      log.error(`No se pudo enviar ${receipt.repair.id} a ${maskEmail(receipt.email)}: ${error?.message || error}`);
      throw new HttpError(502, "No se pudo enviar el correo. Intenta de nuevo en unos minutos.");
    }
    log.info(`Constancia ${receipt.repair.id} enviada a ${maskEmail(receipt.email)}`);
    send(res, 200, { ok: true }, cors);
  }

  return { handleReceipt, handleWhatsAppRepairCode };
}
