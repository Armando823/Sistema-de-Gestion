import { initialRepairs } from "../data/repairData";
import { isValidRepair } from "../utils/repairValidation";
import { loadRepairs as readRepairs, saveRepairs as writeRepairs } from "./dbService";

export async function loadRepairs() {
  try {
    const savedRepairs = await readRepairs();
    const parsedRepairs = savedRepairs.length > 0 ? savedRepairs : initialRepairs;
    return Array.isArray(parsedRepairs)
      ? parsedRepairs.filter(isValidRepair).slice(0, 500)
      : initialRepairs;
  } catch {
    return initialRepairs;
  }
}

export async function saveRepairs(repairs) {
  try {
    return await writeRepairs(repairs.filter(isValidRepair).slice(0, 500));
  } catch {
    return false;
  }
}
