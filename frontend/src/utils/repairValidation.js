import { repairStatuses } from '../data/repairData';

export const repairLimits = {
  customer: 80,
  phone: 30,
  device: 80,
  problem: 500,
};

function isText(value, maxLength) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength;
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
  if (!isText(form.customer, repairLimits.customer)) return 'El nombre del cliente es obligatorio y debe tener hasta 80 caracteres.';
  if (!isText(form.phone, repairLimits.phone)) return 'El teléfono es obligatorio y debe tener hasta 30 caracteres.';
  if (!isText(form.device, repairLimits.device)) return 'El equipo es obligatorio y debe tener hasta 80 caracteres.';
  if (!isText(form.problem, repairLimits.problem)) return 'La falla es obligatoria y debe tener hasta 500 caracteres.';
  return '';
}