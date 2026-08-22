import { repairStatuses } from "../data/repairData";

export const repairLimits = {
  customer: 80,
  phone: 30,
  device: 80,
  problem: 500,
  photos: 3,
  photoSize: 5 * 1024 * 1024,
};

function isText(value, maxLength) {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= maxLength
  );
}

function isValidPhone(value) {
  return /^[+\d][\d\s().-]{6,29}$/.test(value.trim());
}

export function isValidRepair(repair) {
  return Boolean(
    repair &&
    /^REP-\d{4,8}$/.test(repair.id) &&
    isText(repair.customer, repairLimits.customer) &&
    isText(repair.phone, repairLimits.phone) &&
    isText(repair.device, repairLimits.device) &&
    isText(repair.problem, repairLimits.problem) &&
    repairStatuses.includes(repair.status) &&
    isText(repair.updated, 40),
  );
}

export function validateRepairForm(form) {
  if (!isText(form.customer, repairLimits.customer))
    return "El nombre del cliente es obligatorio y debe tener hasta 80 caracteres.";
  if (!isText(form.phone, repairLimits.phone) || !isValidPhone(form.phone))
    return "Escribe un teléfono válido, con entre 7 y 30 caracteres.";
  if (!isText(form.device, repairLimits.device))
    return "El equipo es obligatorio y debe tener hasta 80 caracteres.";
  if (!isText(form.problem, repairLimits.problem))
    return "La falla es obligatoria y debe tener hasta 500 caracteres.";
  if (!Array.isArray(form.photos) || form.photos.length === 0)
    return "Agrega al menos una foto del equipo como evidencia de recepción.";
  if (form.photos.length > repairLimits.photos)
    return `Puedes agregar máximo ${repairLimits.photos} fotos del equipo.`;
  if (typeof form.signature !== "string" || !form.signature)
    return "La firma del cliente es obligatoria.";
  if (form.consent !== true)
    return "Debes confirmar la autorización del cliente.";
  return "";
}
