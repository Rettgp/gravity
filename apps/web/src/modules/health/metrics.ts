import { addDays, type HealthDay, type HealthMetricKey } from '@gravity/shared';
import { tempLabel, tempValue, type TempUnit } from '../../lib/units';

export const fmtDuration = (min: number) => `${Math.floor(min / 60)}h ${String(Math.round(min % 60)).padStart(2, '0')}m`;
/** Short form for differences: 25m, 1h 05m. */
export const fmtShort = (min: number) => (min < 60 ? `${Math.round(min)}m` : fmtDuration(min));

export interface MetricDef {
  key: HealthMetricKey;
  label: string;
  unit?: string;
  digits?: number;
  format?: (v: number) => string;
  /** How a difference is written (defaults to `format`). */
  formatDiff?: (v: number) => string;
  /** Extra line under the value, from the same day. */
  detail?: (d: HealthDay) => string | undefined;
  /** Magnitudes read best as bars; measurements as a line. */
  chart: 'line' | 'bars';
  about: { what: string; moves: string };
}

const BASE_METRICS: MetricDef[] = [
  {
    key: 'restingHr',
    label: 'Resting heart rate',
    unit: 'bpm',
    chart: 'line',
    about: {
      what: 'How fast your heart beats when you are at rest, taken from the quietest stretches of the day. It is one of the steadiest numbers a watch measures.',
      moves: 'It tends to creep up with illness, poor sleep, alcohol, heat, dehydration and stress, and drift down with regular exercise. A few beats either way day to day is normal; compare with your own usual, not with other people.',
    },
  },
  {
    key: 'hrv',
    label: 'Heart rate variability',
    unit: 'ms',
    digits: 0,
    chart: 'line',
    about: {
      what: 'The small variation in time between heartbeats (RMSSD), measured during deep sleep. Higher generally means your body is well recovered.',
      moves: 'It is very personal, so only compare with your own usual. It often drops with illness, alcohol, poor sleep and stress. It only exists for nights the watch was worn to bed.',
    },
  },
  {
    key: 'sleepMinutes',
    label: 'Sleep',
    format: fmtDuration,
    formatDiff: fmtShort,
    chart: 'bars',
    detail: (d) =>
      d.sleepDeepMin !== undefined && d.sleepRemMin !== undefined
        ? `Deep ${fmtDuration(d.sleepDeepMin)} · REM ${fmtDuration(d.sleepRemMin)}`
        : d.bedtime && d.wakeTime
          ? `${d.bedtime} to ${d.wakeTime}`
          : undefined,
    about: {
      what: 'Time actually asleep for the night that ended on this day (time awake in bed is not counted, and short naps are left out).',
      moves: 'Late nights, alcohol, illness and screens before bed cut it short. Most adults do best with 7 to 9 hours, but what matters for these insights is how a night compares with your own usual.',
    },
  },
  {
    key: 'steps',
    label: 'Steps',
    format: (v) => Math.round(v).toLocaleString(),
    chart: 'bars',
    about: {
      what: 'Steps counted per day, combining your watch and phone without counting the same walk twice.',
      moves: 'Sick days, travel and weather change it a lot. Today is a running total until midnight.',
    },
  },
  {
    key: 'spo2',
    label: 'Blood oxygen',
    unit: '%',
    digits: 1,
    chart: 'line',
    about: {
      what: 'The average oxygen saturation of your blood overnight, estimated with light sensors on the watch.',
      moves: 'Healthy readings are usually 95 to 100%. Wrist sensors are noisy, so a single dip means little; if readings stay low, especially below 90%, mention it to a doctor.',
    },
  },
  {
    key: 'skinTempC',
    label: 'Skin temperature',
    unit: '°C',
    digits: 1,
    chart: 'line',
    about: {
      what: 'Your wrist skin temperature during sleep. It is lower than core body temperature and depends on the room, so the absolute number matters less than how it changes.',
      moves: 'A rise of a few tenths of a degree Celsius (about half a degree Fahrenheit) above your usual can show up before or during illness. The watch needs about three nights to learn your baseline.',
    },
  },
  {
    key: 'breathing',
    label: 'Breathing rate',
    unit: '/min',
    digits: 1,
    chart: 'line',
    about: {
      what: 'Breaths per minute while you sleep. It is normally steady for a given person, usually somewhere between 12 and 20.',
      moves: 'It rises with fever, congestion and respiratory illness, often before you feel unwell.',
    },
  },
];

/** The metric list with temperature in the chosen unit. Pair it with toDisplayDays so numbers and labels agree. */
export const metricsFor = (unit: TempUnit): MetricDef[] => BASE_METRICS.map((m) => (m.key === 'skinTempC' ? { ...m, unit: tempLabel(unit) } : m));

/** The API stores temperature in Celsius; convert the temperature fields for display. Everything else is untouched. */
export function toDisplayDays(days: HealthDay[], unit: TempUnit): HealthDay[] {
  if (unit === 'C') return days;
  return days.map((d) => {
    if (d.skinTempC === undefined && d.skinTempDelta === undefined) return d;
    const out = { ...d };
    if (d.skinTempC !== undefined) out.skinTempC = tempValue(d.skinTempC, unit);
    if (d.skinTempDelta !== undefined) out.skinTempDelta = tempValue(d.skinTempDelta, unit, true);
    return out;
  });
}

export const show = (m: MetricDef, v: number) => (m.format ? m.format(v) : v.toFixed(m.digits ?? 0));
export const withUnit = (m: MetricDef, v: number) => show(m, v) + (m.unit ? ' ' + m.unit : '');
export const showDiff = (m: MetricDef, v: number) => (m.formatDiff ? m.formatDiff(Math.abs(v)) : show(m, Math.abs(v))) + (m.unit ? ' ' + m.unit : '');

export const dayName = (date: string, today: string) =>
  date === today
    ? 'Today'
    : date === addDays(today, -1)
      ? 'Yesterday'
      : new Date(date + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

export const fullDate = (date: string) => new Date(date + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
export const shortDate = (date: string) => new Date(date + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
