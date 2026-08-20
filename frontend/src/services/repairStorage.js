import { initialRepairs } from '../data/repairData';

const STORAGE_KEY = 'repairs';

export function loadRepairs() {
  try {
    const savedRepairs = localStorage.getItem(STORAGE_KEY);
    return savedRepairs ? JSON.parse(savedRepairs) : initialRepairs;
  } catch {
    return initialRepairs;
  }
}

export function saveRepairs(repairs) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(repairs));
}
