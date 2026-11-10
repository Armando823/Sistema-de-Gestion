import { isValidEmail, isValidRepair } from "./repairValidation";

export const backupFormat = "sistema-de-gestion.repair-backup";

const backupRepairFields = new Set([
  "id",
  "customer",
  "phone",
  "device",
  "problem",
  "status",
  "updated",
  "createdAt",
  "ownerEmail",
  "ownerPhone",
  "authorizedBy",
  "signature",
  "photos",
  "contactEmail",
  "whatsappOptIn",
  "version",
]);

export function isValidBackupRepair(repair) {
  return Boolean(
    repair &&
    typeof repair === "object" &&
    !Array.isArray(repair) &&
    Object.keys(repair).every((key) => backupRepairFields.has(key)) &&
    isValidRepair(repair) &&
    (repair.version === undefined ||
      (Number.isSafeInteger(repair.version) && repair.version >= 1)) &&
    (repair.createdAt === undefined || repair.createdAt === null ||
      (typeof repair.createdAt === "string" && repair.createdAt.length <= 40)) &&
    (repair.ownerEmail === undefined || isValidEmail(repair.ownerEmail)) &&
    (repair.ownerPhone === undefined ||
      (typeof repair.ownerPhone === "string" && /^\+[1-9]\d{7,14}$/.test(repair.ownerPhone)))
  );
}

export function getBackupRepairs(data) {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== "object" || Array.isArray(data) ||
      !Array.isArray(data.repairs)) return null;
  if (data.format === backupFormat && data.version === 1 &&
      Object.keys(data).every((key) =>
        ["format", "version", "exportedAt", "repairs"].includes(key),
      ) &&
      typeof data.exportedAt === "string" &&
      Number.isFinite(Date.parse(data.exportedAt))) {
    return data.repairs;
  }
  if (data.format === undefined && data.version === undefined &&
      Object.keys(data).every((key) => key === "repairs")) {
    return data.repairs;
  }
  return null;
}

export function createRepairBackup(repairs, exportedAt = new Date()) {
  return {
    format: backupFormat,
    version: 1,
    exportedAt: exportedAt.toISOString(),
    repairs,
  };
}
