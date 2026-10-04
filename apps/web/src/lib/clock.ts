/** Typing a 12-hour clock time with just digits: "645" -> 6:45, "1030" -> 10:30, "06" -> 6. */
export interface ClockParts {
  /** Hour as typed (1-12), or '' while still ambiguous/empty. */
  hour: string;
  minute: string;
  /** The hour is settled, so the next digit goes to the minutes. */
  hourDone: boolean;
}

/** Split a digit string into hour and minute, or null if it cannot be a valid time. */
export function splitDigits(d: string): ClockParts | null {
  if (d.length > 4) return null;
  if (d === '') return { hour: '', minute: '', hourDone: false };
  let hLen: number;
  if (d[0] === '0') hLen = 2;
  else if (d[0] === '1' && d.length > 1 && d[1]! <= '2') hLen = 2;
  else hLen = 1;
  const hourText = d.slice(0, hLen);
  const minute = d.slice(hLen, hLen + 2);
  if (d.slice(hLen + 2)) return null;
  const hourDone = hourText.length === hLen && !(d === '1');
  if (hourDone) {
    const h = Number(hourText);
    if (h < 1 || h > 12) return null;
  } else if (hourText === '0') {
    // a lone leading zero is fine: it waits for the next digit
  }
  if (minute.length > 0 && minute[0]! > '5') return null;
  if (minute.length > 0 && !hourDone) return null;
  return { hour: hourDone ? String(Number(hourText)) : hourText, minute, hourDone };
}

/** Keep digits while they stay valid; a digit that cannot fit is dropped. */
export function acceptDigits(raw: string): string {
  let out = '';
  for (const c of raw.replace(/\D/g, '')) if (splitDigits(out + c)) out += c;
  return out;
}

export const displayDigits = (d: string): string => {
  const p = splitDigits(d);
  if (!p || d === '') return '';
  return p.hourDone ? p.hour + ':' + p.minute : p.hour;
};

/** A complete entry: an hour and two minute digits. Anything shorter is finished by `finishDigits`. */
export const isComplete = (d: string) => {
  const p = splitDigits(d);
  return !!p && p.hourDone && p.minute.length === 2;
};

/** Settle a partial entry on blur: "6" -> 6:00, "64" -> 6:04. Returns null for nothing usable. */
export function finishDigits(d: string): { hour: number; minute: number } | null {
  const p = splitDigits(d);
  if (!p) return null;
  if (!p.hourDone) {
    const h = Number(p.hour);
    return h >= 1 && h <= 12 && p.hour !== '0' && p.hour !== '' ? { hour: h, minute: 0 } : null;
  }
  return { hour: Number(p.hour), minute: Number(p.minute || '0') };
}

export const digitsFromClock = (hhmm: string): string => {
  const [h, m] = hhmm.split(':').map(Number) as [number, number];
  return String(h % 12 || 12) + String(m).padStart(2, '0');
};
export const isPm = (hhmm: string) => Number(hhmm.slice(0, 2)) >= 12;
export const to24 = (hour12: number, minute: number, pm: boolean) =>
  String((hour12 % 12) + (pm ? 12 : 0)).padStart(2, '0') + ':' + String(minute).padStart(2, '0');
