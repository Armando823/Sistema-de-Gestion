// Validación de la petición y construcción del correo de constancia.

const LIMITS = { customer: 80, phone: 30, device: 80, problem: 500, status: 40, updated: 40, signature: 2_500_000 };

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// Una sola línea: evita saltos de línea dentro del asunto o de los nombres.
function oneLine(value) {
  return String(value).replace(/\s+/g, " ").trim();
}

export function isValidEmail(value) {
  return typeof value === "string" && value.length <= 254 && /^[^\s@,;<>()]+@[^\s@,;<>()]+\.[^\s@,;<>()]+$/.test(value);
}

function text(value, max, { required = true, multiline = false } = {}) {
  if (value === undefined || value === null || value === "") return required ? null : "";
  if (typeof value !== "string") return null;
  const clean = multiline ? value.replace(/\r\n?/g, "\n").trim() : oneLine(value);
  if (required && clean.length === 0) return null;
  return clean.length <= max ? clean : null;
}

function decodeSignature(dataUrl) {
  if (typeof dataUrl !== "string" || dataUrl.length > LIMITS.signature) return null;
  const match = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) return null;
  const buffer = Buffer.from(match[2], "base64");
  const isPng = buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8;
  if ((match[1] === "png" && !isPng) || (match[1] === "jpeg" && !isJpeg)) return null;
  return { buffer, contentType: `image/${match[1]}`, extension: match[1] === "png" ? "png" : "jpg" };
}

export function parseReceiptRequest(body) {
  const fail = (error) => ({ ok: false, error });
  if (!body || typeof body !== "object" || Array.isArray(body)) return fail("Petición inválida.");
  const { email, repair } = body;

  if (!isValidEmail(email)) return fail("El correo no es válido.");
  if (!repair || typeof repair !== "object") return fail("Falta la información de la orden.");
  if (typeof repair.id !== "string" || !/^REP-\d{4,8}$/.test(repair.id)) return fail("El código de la orden no es válido.");

  const customer = text(repair.customer, LIMITS.customer);
  const phone = text(repair.phone, LIMITS.phone);
  const device = text(repair.device, LIMITS.device);
  const problem = text(repair.problem, LIMITS.problem, { multiline: true });
  const status = text(repair.status, LIMITS.status);
  const authorizedBy = text(repair.authorizedBy, LIMITS.customer, { required: false });
  const updated = text(repair.updated, LIMITS.updated, { required: false });
  if ([customer, phone, device, problem, status, authorizedBy, updated].includes(null)) {
    return fail("Algún dato de la orden falta o es demasiado largo.");
  }

  let signature = null;
  if (repair.signature) {
    signature = decodeSignature(repair.signature);
    if (!signature) return fail("La firma no tiene un formato válido.");
  }

  return {
    ok: true,
    value: {
      email: email.trim(),
      repair: { id: repair.id, customer, phone, device, problem, status, authorizedBy, updated, signature },
    },
  };
}

const AUTHORIZATION_TEXT =
  "El cliente autoriza la revisión del equipo y recibe esta constancia del estado reportado.";

function businessLines(business) {
  return [
    business.phone && ["Teléfono", business.phone],
    business.email && ["Correo", business.email],
    business.address && ["Dirección", business.address],
    business.hours && ["Horario", business.hours],
  ].filter(Boolean);
}

function detailRows(repair) {
  return [
    ["Código de la orden", repair.id],
    ["Cliente", repair.customer],
    ["Teléfono registrado", repair.phone],
    ["Equipo", repair.device],
    ["Falla reportada", repair.problem],
    ["Estado actual", repair.status],
    repair.authorizedBy && ["Entregado por", repair.authorizedBy],
    repair.updated && ["Fecha de registro", repair.updated],
  ].filter(Boolean);
}

function constanciaHtml(repair, business) {
  const rows = detailRows(repair)
    .map(([label, value]) => `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`)
    .join("");
  const signature = repair.signature
    ? `<img class="signature" alt="Firma del cliente" src="data:${repair.signature.contentType};base64,${repair.signature.buffer.toString("base64")}">`
    : "";
  return `<!doctype html><html lang="es"><head><meta charset="UTF-8"><title>${escapeHtml(repair.id)}</title><style>body{font-family:Arial,sans-serif;max-width:700px;margin:40px auto;color:#172a3a}h1{color:#173f3a}dt{font-weight:bold;margin-top:16px}dd{margin:4px 0 0;white-space:pre-wrap}p{line-height:1.5}.signature{max-width:280px}</style></head><body><p>${escapeHtml(business.name.toUpperCase())}</p><h1>Constancia de reparación ${escapeHtml(repair.id)}</h1><dl>${rows}</dl><p>${AUTHORIZATION_TEXT}</p>${signature}</body></html>`;
}

export function buildReceiptEmail({ email, repair }, business) {
  const name = oneLine(business.name);
  const subject = `Constancia de tu orden ${repair.id} - ${name}`;

  const nextSteps = [
    `Guarda este código: ${repair.id}. Para consultar el estado de tu equipo, entra al portal de clientes con la cuenta desde la que hiciste la solicitud y escribe el código.`,
    `Si el taller registró tu orden en el mostrador, consúltala con el código y el teléfono registrado (${repair.phone}).`,
    "Revisaremos tu equipo y te contactaremos si necesitamos tu autorización para algún trabajo adicional.",
    business.responseTime && `Tiempo de respuesta estimado: ${business.responseTime}.`,
    "Conserva este correo: es tu constancia de la orden.",
  ].filter(Boolean);
  const contacts = businessLines(business);

  const textBody = [
    `Hola ${repair.customer},`,
    "",
    `Registramos tu orden en ${name}. Estos son los datos:`,
    "",
    ...detailRows(repair).map(([label, value]) => `${label}: ${value}`),
    "",
    AUTHORIZATION_TEXT,
    "",
    "Qué sigue:",
    ...nextSteps.map((step) => `- ${step}`),
    ...(contacts.length ? ["", "Contacto:", ...contacts.map(([label, value]) => `${label}: ${value}`)] : []),
    "",
    "Si no solicitaste este servicio, avísanos respondiendo a este correo.",
  ].join("\n");

  const brand = "#173f3a";
  const rowsHtml = detailRows(repair)
    .map(
      ([label, value]) =>
        `<tr><td style="padding:8px 12px;color:#5b6b78;width:38%;vertical-align:top">${escapeHtml(label)}</td><td style="padding:8px 12px;font-weight:bold;white-space:pre-wrap">${escapeHtml(value)}</td></tr>`,
    )
    .join("");
  const stepsHtml = nextSteps.map((step) => `<li style="margin:6px 0">${escapeHtml(step)}</li>`).join("");
  const contactHtml = contacts.length
    ? `<h3 style="color:${brand};margin:24px 0 8px">Contacto</h3><p style="margin:0;line-height:1.6">${contacts
        .map(([label, value]) => `${escapeHtml(label)}: <strong>${escapeHtml(value)}</strong>`)
        .join("<br>")}</p>`
    : "";
  const signatureHtml = repair.signature
    ? `<h3 style="color:${brand};margin:24px 0 8px">Firma registrada</h3><img src="cid:firma-cliente" alt="Firma del cliente" style="max-width:280px;border:1px solid #d8dee3;border-radius:6px;padding:6px;background:#fff">`
    : "";

  const html = `<!doctype html><html lang="es"><body style="margin:0;background:#f3f5f6;font-family:Arial,sans-serif;color:#172a3a"><div style="max-width:620px;margin:0 auto;padding:24px"><div style="background:${brand};color:#fff;padding:20px 24px;border-radius:10px 10px 0 0"><div style="font-size:13px;letter-spacing:1px">${escapeHtml(name.toUpperCase())}</div><div style="font-size:22px;font-weight:bold;margin-top:4px">Constancia de tu orden ${escapeHtml(repair.id)}</div></div><div style="background:#fff;padding:24px;border-radius:0 0 10px 10px"><p style="margin-top:0;line-height:1.5">Hola <strong>${escapeHtml(repair.customer)}</strong>, registramos tu orden. Estos son los datos:</p><table role="presentation" style="width:100%;border-collapse:collapse;background:#f8fafb;border:1px solid #e3e8eb;border-radius:8px">${rowsHtml}</table><p style="line-height:1.5;color:#5b6b78;font-size:14px">${AUTHORIZATION_TEXT}</p><h3 style="color:${brand};margin:24px 0 8px">Qué sigue</h3><ul style="padding-left:20px;line-height:1.5;margin:0">${stepsHtml}</ul>${contactHtml}${signatureHtml}<p style="margin-top:28px;font-size:12px;color:#7a8791">Si no solicitaste este servicio, avísanos respondiendo a este correo.</p></div></div></body></html>`;

  const attachments = [
    {
      filename: `constancia-${repair.id}.html`,
      content: constanciaHtml(repair, { ...business, name }),
      contentType: "text/html; charset=utf-8",
    },
  ];
  if (repair.signature) {
    attachments.push({
      filename: `firma-${repair.id}.${repair.signature.extension}`,
      content: repair.signature.buffer,
      contentType: repair.signature.contentType,
      cid: "firma-cliente",
      contentDisposition: "inline",
    });
  }

  const message = { to: email, subject, text: textBody, html, attachments };
  if (business.email && isValidEmail(business.email)) message.replyTo = business.email;
  return message;
}
