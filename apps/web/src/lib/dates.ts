export { addDays, daysInMonth } from '@gravity/shared';

const pad = (n: number) => String(n).padStart(2, '0');

/** Today in the viewer's local timezone (YYYY-MM-DD). The server treats dates as opaque day keys. */
export const localToday = () => {
  const d = new Date();
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
};
export const monthOf = (date: string) => date.slice(0, 7);
export const shiftMonth = (month: string, delta: number) => {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1);
};
export const monthLabel = (month: string) =>
  new Date(month + '-01T12:00:00').toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
export const dayLabel = (date: string) =>
  new Date(date + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
/** Weekday index (0=Sun) of the 1st of the month. */
export const firstWeekday = (month: string) => new Date(month + '-01T12:00:00').getDay();
/** '09:03' -> '9:03am' */
export const formatClock = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number) as [number, number];
  return (h % 12 || 12) + ':' + pad(m) + (h < 12 ? 'am' : 'pm');
};
/** Current local time as HH:MM. */
export const localClock = () => {
  const d = new Date();
  return pad(d.getHours()) + ':' + pad(d.getMinutes());
};
