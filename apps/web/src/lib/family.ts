// shortcut: family is hard-coded, move into Settings if it needs editing in the app.
// The one family list: the dashboard and the planner both read it.
export const FAMILY = [
  { name: 'Garrett', born: '1991-09-24' },
  { name: 'Lauren', born: '1991-09-16' },
  { name: 'Marshall', born: '2018-04-15' },
  { name: 'Wyatt', born: '2020-02-19' },
  { name: 'Rhys', born: '2022-11-18' },
  { name: 'Liam', born: '2026-08-04' },
];

/** The next birthday on or after `today`, and the age turned on it. */
export function nextBirthday(born: string, today = new Date()) {
  const [y, m, d] = born.split('-').map(Number) as [number, number, number];
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let date = new Date(t.getFullYear(), m - 1, d);
  if (date < t) date = new Date(t.getFullYear() + 1, m - 1, d);
  return { date, age: date.getFullYear() - y, days: Math.round((date.getTime() - t.getTime()) / 86_400_000) };
}
