import { repairStatuses } from "../data/repairData";

export const repairLimits = {
  customer: 80,
  phone: 30,
  device: 80,
  problem: 500,
  photos: 3,
  photoSize: 5 * 1024 * 1024,
  imageDataSize: 2_500_000,
  importFileSize: 12 * 1024 * 1024,
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

function isValidEmail(value) {
  return (
    typeof value === "string" &&
    value.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
  );
}

export function isValidImageData(value) {
  return (
    typeof value === "string" &&
    value.length <= repairLimits.imageDataSize &&
    /^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(value)
  );
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
    isText(repair.updated, 40) &&
    (repair.ownerEmail === undefined || isValidEmail(repair.ownerEmail)) &&
    (repair.authorizedBy === undefined ||
      isText(repair.authorizedBy, repairLimits.customer)) &&
    (repair.signature === undefined ||
      repair.signature === "" ||
      isValidImageData(repair.signature)) &&
    (repair.photos === undefined ||
      (Array.isArray(repair.photos) &&
        repair.photos.length <= repairLimits.photos &&
        repair.photos.every(isValidImageData))),
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
  if (!Array.isArray(form.photos))
    return "El campo de fotos debe ser una lista válida.";
  if (form.photos.length > repairLimits.photos)
    return `Puedes agregar máximo ${repairLimits.photos} fotos del equipo.`;
  if (!form.photos.every(isValidImageData))
    return "Las fotos seleccionadas no tienen un formato válido.";
  if (!isText(form.authorizedBy, repairLimits.customer))
    return "El nombre de quien entrega la laptop es obligatorio.";
  if (form.consent !== true)
    return "Debes confirmar la autorización del cliente.";
  return "";
}
