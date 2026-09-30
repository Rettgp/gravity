import { useSyncExternalStore } from 'react';

export type TempUnit = 'F' | 'C';

const KEY = 'gravity.tempUnit';
const listeners = new Set<() => void>();

const read = (): TempUnit => {
  try {
    return localStorage.getItem(KEY) === 'C' ? 'C' : 'F';
  } catch {
    return 'F'; // private mode or blocked storage: still works, just not remembered
  }
};
let current: TempUnit = read();

export function setTempUnit(u: TempUnit) {
  current = u;
  try {
    localStorage.setItem(KEY, u);
  } catch {
    /* not remembered */
  }
  listeners.forEach((l) => l());
}

/** The preferred temperature unit (Fahrenheit by default), shared by every screen and remembered on this device. */
export function useTempUnit(): [TempUnit, (u: TempUnit) => void] {
  const unit = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
    () => 'F' as TempUnit,
  );
  return [unit, setTempUnit];
}

/** Celsius -> the chosen unit. `delta` is for differences (no +32 offset). */
export const tempValue = (c: number, unit: TempUnit, delta = false) => (unit === 'F' ? (delta ? (c * 9) / 5 : (c * 9) / 5 + 32) : c);
export const tempLabel = (unit: TempUnit) => (unit === 'F' ? '°F' : '°C');
