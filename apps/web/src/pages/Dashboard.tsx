import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueries, useQueryClient } from '@tanstack/react-query';
import { addDays } from '@gravity/shared';
import { Icon } from '../components/Icon';
import { useFetcher } from '../lib/api';
import { useAuth } from '../lib/auth';
import { localToday, monthOf } from '../lib/dates';
import { useMe } from '../lib/me';
import { MODULES } from '../modules/registry';
import { DashboardHeadsUp } from '../modules/health/HeadsUp';
import { StepsPodium } from '../modules/health/StepsPodium';
import { useHttpJournalApi } from '../modules/journal/api';

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
};

export function Dashboard() {
  const me = useMe();
  const { config } = useAuth();
  const api = useHttpJournalApi();
  const f = useFetcher();
  const qc = useQueryClient();
  const today = localToday();
  const pid = me.data?.defaultProfileId;
  const week = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(today, i - 6)), [today]);
  const months = [...new Set(week.map(monthOf))];
  const results = useQueries({
    queries: months.map((m) => ({ queryKey: ['journal', 'month', pid, m], queryFn: () => api.listMonth(pid!, m), enabled: !!pid })),
  });
  const byDate = new Map(results.flatMap((r) => r.data ?? []).map((s) => [s.date, s]));
  const seed = useMutation({
    mutationFn: () => f('/api/dev/seed', { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['journal'] }),
  });
  const name = me.data?.user.name?.split(' ')[0] ?? '';

  return (
    <div className="page">
      <header className="page-head">
        <p className="muted">{greeting()}</p>
        <h1>{name || 'Welcome'}</h1>
      </header>

      <DashboardHeadsUp pid={pid} />

      <StepsPodium />

      <section className="card dash-today" aria-label="Today">
        <div>
          <h2>Log today</h2>
          <p className="muted">What did you eat? How are you feeling?</p>
        </div>
        <Link className="btn" to={'/app/journal?date=' + today}>
          <Icon name="plus" size={18} /> Add entry
        </Link>
      </section>

      <section className="card" aria-label="This week">
        <h2>This week</h2>
        <ol className="week">
          {week.map((d) => {
            const s = byDate.get(d);
            const cls = s?.unwell ? 'unwell' : s ? 'logged' : '';
            return (
              <li key={d}>
                <Link to={'/app/journal?date=' + d} className={'week-day ' + cls} aria-label={d + (s?.unwell ? ', felt unwell' : s ? ', logged' : ', nothing logged')}>
                  <small>{new Date(d + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short' })}</small>
                  <b>{Number(d.slice(8))}</b>
                </Link>
              </li>
            );
          })}
        </ol>
      </section>

      <section aria-label="Services">
        <h2 className="section-title">Services</h2>
        <ul className="tiles">
          {MODULES.map((m) => (
            <li key={m.id}>
              {m.soon ? (
                <div className="tile soon" aria-disabled="true">
                  <Icon name={m.icon} size={24} />
                  <strong>{m.name}</strong>
                  <p>{m.blurb}</p>
                  <span className="chip">Coming soon</span>
                </div>
              ) : (
                <Link to={m.path} className="tile">
                  <Icon name={m.icon} size={24} />
                  <strong>{m.name}</strong>
                  <p>{m.blurb}</p>
                </Link>
              )}
            </li>
          ))}
        </ul>
      </section>

      {config?.mode === 'local' && (
        <p className="muted dev-note">
          Local mode.{' '}
          <button className="btn btn-ghost btn-sm" onClick={() => seed.mutate()} disabled={seed.isPending}>
            {seed.isSuccess ? 'Demo data loaded' : 'Load demo data'}
          </button>
        </p>
      )}
    </div>
  );
}
