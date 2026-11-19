import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { SLOT_LABEL, addDays } from '@gravity/shared';
import { Icon } from '../components/Icon';
import { useFetcher } from '../lib/api';
import { useAuth } from '../lib/auth';
import { nextBirthday } from '../lib/family';
import { localToday, monthOf } from '../lib/dates';
import { FAMILY } from '../lib/family';
import { useMe } from '../lib/me';
import { DashboardHeadsUp } from '../modules/health/HeadsUp';
import { ChallengePodium } from '../modules/health/ChallengePodium';
import { JournalApiContext, useHttpJournalApi } from '../modules/journal/api';
import { GlimmerFeed } from '../modules/journal/GlimmerFeed';
import { useMealsApi } from '../modules/meals/api';

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
};

interface TripMeta { id: string; name: string; startDate: string; endDate: string }
interface TripEvent { id: string; time: string; at?: string; until?: string; title: string }
interface PlannerYear { collections?: { gifts?: { purchased?: boolean }[]; todos?: { id: string; title: string; due?: string; done?: boolean }[] } }
interface UpItem { key: string; label: string; when: string; days: number; to: string }

const dayDiff = (a: string, b: string) => Math.round((Date.parse(b + 'T12:00:00') - Date.parse(a + 'T12:00:00')) / 86_400_000);
const plural = (n: number, w: string) => n + ' ' + w + (n === 1 ? '' : 's');
const short = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const iso = (d: Date) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

/** Read-only optional data: no retries, and every consumer renders nothing on error or empty. */
function useOptional<T>(key: unknown[], path: string, enabled = true) {
  const f = useFetcher();
  return useQuery({ queryKey: ['dash', ...key], queryFn: () => f<T>(path), retry: false, staleTime: 60_000, enabled });
}

function useTrip(today: string) {
  const list = useOptional<TripMeta[]>(['trips'], '/api/trips');
  const metas = Array.isArray(list.data) ? list.data : [];
  const current = metas.find((t) => t.startDate <= today && today <= t.endDate);
  const upcoming = metas.filter((t) => t.startDate > today).sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
  return { trip: current ?? upcoming, running: !!current };
}

function usePlannerYear(today: string) {
  const years = useOptional<{ years: { year: number | string }[] }>(['planner-years'], '/api/planner/years');
  const list = Array.isArray(years.data?.years) ? years.data.years.map((y) => Number(y.year)).filter(Boolean) : [];
  const cy = Number(today.slice(0, 4));
  const year = list.includes(cy) ? cy : list.length ? Math.max(...list) : undefined;
  const detail = useOptional<PlannerYear>(['planner-year', year], '/api/planner/years/' + year, year !== undefined);
  return { year, data: year !== undefined ? detail.data : undefined };
}

function TripStat({ today }: { today: string }) {
  const { trip, running } = useTrip(today);
  if (!trip) return null;
  const until = dayDiff(today, trip.startDate);
  const total = dayDiff(trip.startDate, trip.endDate) + 1;
  return (
    <Link to={'/app/trips/' + trip.id} className="card stat stat-link" aria-label={'Trip: ' + trip.name}>
      <span className="stat-label">{running ? 'Trip now' : 'Next trip'}</span>
      <span className="stat-value is-text">{trip.name}</span>
      <span className="stat-trend">{running ? `Day ${dayDiff(trip.startDate, today) + 1} of ${total}` : until === 0 ? 'Check-in today' : `${plural(until, 'day')} until check-in`}</span>
    </Link>
  );
}

function ChristmasStat({ today }: { today: string }) {
  const { year, data } = usePlannerYear(today);
  if (year === undefined || !data?.collections) return null;
  const days = dayDiff(today, year + '-12-25');
  if (days < 0) return null;
  const gifts = data.collections.gifts ?? [];
  const bought = gifts.filter((g) => g.purchased).length;
  return (
    <Link to="/app/planner" className="card stat stat-link" aria-label="Christmas">
      <span className="stat-label">Christmas</span>
      <span className="stat-value">{days === 0 ? 'Today' : days}</span>
      <span className="stat-trend">
        {days === 0 ? 'Merry Christmas' : days === 1 ? 'day to go' : 'days to go'}
        {gifts.length > 0 && ` · gifts bought ${bought} of ${gifts.length}`}
      </span>
    </Link>
  );
}

function ComingUp({ today }: { today: string }) {
  const { trip, running } = useTrip(today);
  const { data: year } = usePlannerYear(today);
  const detail = useOptional<{ sections?: Record<string, { data?: { events?: TripEvent[] } }> }>(['trip', trip?.id], '/api/trips/' + trip?.id, running);
  const now = new Date();
  const hhmm = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
  let items: UpItem[] = [];
  let title = 'Coming up';
  if (running && trip) {
    title = 'Next on the trip';
    const sections = detail.data?.sections ?? {};
    for (const k of Object.keys(sections).filter((k) => k.startsWith('day-') && k.slice(4) >= today).sort()) {
      const day = k.slice(4);
      for (const e of sections[k]?.data?.events ?? []) {
        const end = e.until ?? e.at;
        if (day === today && end && end < hhmm) continue;
        items.push({ key: k + e.id, label: e.title, when: (day === today ? '' : short(day) + ' · ') + e.time, days: 0, to: '/app/trips/' + trip.id + '/day/' + day });
      }
    }
    items = items.slice(0, 3);
  } else {
    for (const p of FAMILY) {
      const b = nextBirthday(p.born);
      if (b.days <= 60) items.push({ key: 'b' + p.name, label: `${p.name} turns ${b.age}`, when: b.days === 0 ? 'Today' : short(iso(b.date)), days: b.days, to: '/app/planner/birthday/gifts' });
    }
    for (const t of year?.collections?.todos ?? []) {
      if (t.done || !t.due) continue;
      const d = dayDiff(today, t.due);
      if (d <= 14) items.push({ key: 't' + t.id, label: t.title, when: d < 0 ? 'Overdue' : d === 0 ? 'Today' : short(t.due), days: d, to: '/app/planner/christmas/todos' });
    }
    items = items.sort((a, b) => a.days - b.days).slice(0, 6);
  }
  if (items.length === 0) return null;
  return (
    <section className="card" aria-label={title}>
      <div className="card-head">
        <h2 className="card-title">{title}</h2>
      </div>
      <ul className="up-list">
        {items.map((i) => (
          <li key={i.key}>
            <Link to={i.to} className="glass-row up-row">
              <span className="up-label">{i.label}</span>
              <span className="muted up-when">{i.when}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function TodayMeals({ today }: { today: string }) {
  const api = useMealsApi();
  const q = useQuery({ queryKey: ['meals', 'plan', today, today], queryFn: () => api.plan(today, today), retry: false });
  if (q.isError || !q.data) return null;
  return (
    <section className="card" aria-label="Today's meals">
      <div className="card-head">
        <h2 className="card-title">Today&apos;s meals</h2>
        <Link to="/app/meals" className="see-all">
          See all
        </Link>
      </div>
      {q.data.length === 0 ? (
        <p className="muted">Nothing planned yet.</p>
      ) : (
        <ul className="up-list">
          {q.data.map((e) => (
            <li key={e.id}>
              <Link to="/app/meals" className="glass-row up-row">
                <span className="up-label">{e.title}</span>
                <span className="muted up-when">{SLOT_LABEL[e.slot]}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

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
  const glimmerResults = useQueries({
    queries: months.map((m) => ({ queryKey: ['journal', 'glimmers', pid, m], queryFn: () => api.listGlimmers(pid!, m), enabled: !!pid })),
  });
  const glimmerDays = new Set(glimmerResults.flatMap((r) => r.data ?? []).map((g) => g.date));
  const byDate = new Map(results.flatMap((r) => r.data ?? []).map((s) => [s.date, s]));
  const seed = useMutation({
    mutationFn: () => f('/api/dev/seed', { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries(),
  });
  const name = me.data?.user.name?.split(' ')[0] ?? '';

  return (
    <div className="page">
      <h1 className="sr-only">Home</h1>
      <div className="stat-row">
        <section className="card stat" aria-label="Greeting">
          <span className="stat-label">{greeting()}</span>
          <span className="stat-value is-text">{name || 'Welcome'}</span>
          <span className="stat-trend">{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</span>
        </section>
        <TripStat today={today} />
        <ChristmasStat today={today} />
        <DashboardHeadsUp pid={pid} />
      </div>

      <div className="with-rail">
        <div className="stack dash-main">
          {me.data && (
            <JournalApiContext.Provider value={api}>
              <GlimmerFeed family={me.data.family} />
            </JournalApiContext.Provider>
          )}

          <section className="card" aria-label="This week">
            <div className="card-head">
              <h2 className="card-title">This week</h2>
              <Link to="/app/journal" className="see-all">
                See all
              </Link>
            </div>
            <ol className="week">
              {week.map((d) => {
                const s = byDate.get(d);
                const cls = s?.unwell ? 'unwell' : s ? 'logged' : '';
                return (
                  <li key={d}>
                    <Link to={'/app/journal?date=' + d} className={'week-day ' + cls + (glimmerDays.has(d) ? ' has-glimmer' : '')} aria-label={d + (s?.unwell ? ', felt unwell' : s ? ', logged' : ', nothing logged') + (glimmerDays.has(d) ? ', has a glimmer' : '')}>
                      <small>{new Date(d + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short' })}</small>
                      <b>{Number(d.slice(8))}</b>
                    </Link>
                  </li>
                );
              })}
            </ol>
          </section>

          <ChallengePodium />

          <section className="card dash-today" aria-label="Today">
            <div>
              <h2>Log today</h2>
              <p className="muted">What did you eat? How are you feeling?</p>
            </div>
            <Link className="btn" to={'/app/journal?date=' + today}>
              <Icon name="plus" size={18} /> Add entry
            </Link>
          </section>
        </div>

        <aside className="rail" aria-label="Coming up and meals">
          <ComingUp today={today} />
          <TodayMeals today={today} />
        </aside>
      </div>

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
