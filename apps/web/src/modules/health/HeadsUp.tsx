import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { METRIC_INFO, addDays, computeHeadsUp, type HealthDay } from '@gravity/shared';
import { Icon } from '../../components/Icon';
import { localToday } from '../../lib/dates';
import { useHealthApi } from './api';

const fmt = (key: keyof typeof METRIC_INFO, v: number) => {
  const i = METRIC_INFO[key]!;
  return v.toFixed(i.digits) + (i.unit ? ' ' + i.unit : '');
};

/** Gentle nudge when two or more early-warning numbers are outside a person's own normal. Renders nothing otherwise. */
export function HeadsUp({ days }: { days: HealthDay[] }) {
  const today = localToday();
  const signals = useMemo(() => computeHeadsUp(days, today), [days, today]);
  if (signals.length === 0) return null;
  return (
    <section className="card hl-headsup" role="status" aria-label="Early heads-up">
      <Icon name="thermo" size={22} />
      <div>
        <h2>Your body is off its usual pattern</h2>
        <ul>
          {signals.map((s) => (
            <li key={s.key}>
              {METRIC_INFO[s.key]!.label} {fmt(s.key, Math.abs(s.diff))} {s.diff > 0 ? 'above' : 'below'} your usual ({fmt(s.key, s.value)} vs {fmt(s.key, s.usual)})
            </li>
          ))}
        </ul>
        <p className="muted hl-fine">This often shows up a day or two before people feel unwell, but it is only a hint, not medical advice.</p>
        <Link className="btn btn-sm" to={'/app/journal?date=' + today}>
          Log how you feel
        </Link>
      </div>
    </section>
  );
}

/** Dashboard version: fetches the recent numbers itself, so it costs nothing to leave on the page when there is no health data. */
export function DashboardHeadsUp({ pid }: { pid: string | undefined }) {
  const api = useHealthApi();
  const today = localToday();
  const q = useQuery({ queryKey: ['health', 'days', pid, 'recent'], queryFn: () => api.days(pid!, addDays(today, -40), today), enabled: !!pid, staleTime: 5 * 60_000 });
  return <HeadsUp days={q.data ?? []} />;
}
