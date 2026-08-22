import { initialRepairs } from "../data/repairData";
import { isValidRepair } from "../utils/repairValidation";

const STORAGE_KEY = "repairs";

export function loadRepairs() {
  try {
    const savedRepairs = localStorage.getItem(STORAGE_KEY);
    const parsedRepairs = savedRepairs
      ? JSON.parse(savedRepairs)
      : initialRepairs;
    return Array.isArray(parsedRepairs)
      ? parsedRepairs.filter(isValidRepair).slice(0, 500)
      : initialRepairs;
  } catch {
    return initialRepairs;
  }
}

export function saveRepairs(repairs) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(repairs.filter(isValidRepair).slice(0, 500)),
    );
    return true;
  } catch {
    // El almacenamiento local puede estar bloqueado o lleno; la app sigue funcionando en memoria.
    return false;
  }
}
