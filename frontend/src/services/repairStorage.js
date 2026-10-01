import { initialRepairs } from "../data/repairData";
import { isValidRepair } from "../utils/repairValidation";
import { loadRepairs as readRepairs, saveRepairs as writeRepairs } from "./dbService";

export async function loadRepairs() {
  try {
    const savedRepairs = await readRepairs();
    const parsedRepairs = savedRepairs.length > 0 ? savedRepairs : initialRepairs;
    return Array.isArray(parsedRepairs)
      ? parsedRepairs.filter(isValidRepair)
      : initialRepairs;
  } catch {
    return initialRepairs;
  }
}

export async function saveRepairs(repairs) {
  try {
    // Si alguna orden no es válida no se guarda nada: antes se descartaba en
    // silencio (y el guardado borraba esas órdenes de la base de datos).
    if (!repairs.every(isValidRepair)) return false;
    return await writeRepairs(repairs);
  } catch {
    return false;
  }
}
