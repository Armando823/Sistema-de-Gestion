import { isValidRepair } from "../utils/repairValidation";
import { loadRepairs as readRepairs, saveRepairs as writeRepairs } from "./dbService";

export async function loadRepairs() {
  const savedRepairs = await readRepairs();
  if (!Array.isArray(savedRepairs)) throw new Error("La lista de órdenes no es válida.");
  if (!savedRepairs.every(isValidRepair)) {
    throw new Error("Hay órdenes dañadas o incompatibles. Se detuvo el guardado para proteger los datos.");
  }
  return savedRepairs;
}

export async function saveRepairs(repairs) {
  if (!Array.isArray(repairs) || !repairs.every(isValidRepair)) return false;
  return writeRepairs(repairs);
}
