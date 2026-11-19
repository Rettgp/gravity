import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronRight, MapPin, Plus } from 'lucide-react';
import type { TripMeta } from '@gravity/shared';
import { Sheet } from '../../components/Sheet';
import { useFetcher } from '../../lib/api';
import { localToday, addDays } from '../../lib/dates';
import { useMe } from '../../lib/me';
import { tripsKey, useTrips } from './api';
import { groupTrips, rangeLabel, tripWhen } from './logic';

function TripCard({ t, today }: { t: TripMeta; today: string }) {
  return (
    <Link to={'/app/trips/' + t.id} className={'glass-row tr-trip' + (t.startDate <= today && today <= t.endDate ? ' is-current' : '')}>
      <span className="tr-trip-main">
        <strong>{t.name}</strong>
        <span className="muted">
          <MapPin size={14} aria-hidden="true" /> {t.destination}
        </span>
        <span className="muted">{rangeLabel(t)}</span>
      </span>
      <span className="chip tr-chip">{tripWhen(t, today)}</span>
      <ChevronRight size={18} className="muted" aria-hidden="true" />
    </Link>
  );
}

export default function TripList() {
  const trips = useTrips();
  const [adding, setAdding] = useState(false);
  const today = localToday();
  const g = groupTrips(trips.data ?? [], today);
  const groups: [string, TripMeta[]][] = [['Happening now', g.now], ['Upcoming', g.upcoming], ['Past trips', g.past]];
  return (
    <div className="page tr">
      <header className="page-head row">
        <h1>Trips</h1>
        <button className="btn" onClick={() => setAdding(true)}>
          <Plus size={18} aria-hidden="true" /> New trip
        </button>
      </header>
      {trips.isError && <p className="jr-error" role="alert">Could not load trips.</p>}
      {trips.data?.length === 0 && (
        <section className="card tr-card tr-empty">
          <h2>No trips yet</h2>
          <p className="muted">Plan the next one: days, packing, groceries, tickets and costs, all in one place.</p>
          <button className="btn" onClick={() => setAdding(true)}>Plan a trip</button>
        </section>
      )}
      {groups.map(([title, list]) =>
        list.length === 0 ? null : (
          <section key={title} className="card tr-card" aria-label={title}>
            <h2>{title}</h2>
            <div className="tr-list">{list.map((t) => <TripCard key={t.id} t={t} today={today} />)}</div>
          </section>
        ),
      )}
      {adding && <NewTripSheet trips={trips.data ?? []} onClose={() => setAdding(false)} />}
    </div>
  );
}

function NewTripSheet({ trips, onClose }: { trips: TripMeta[]; onClose: () => void }) {
  const f = useFetcher();
  const qc = useQueryClient();
  const nav = useNavigate();
  const me = useMe().data;
  const [name, setName] = useState('');
  const [destination, setDestination] = useState('');
  const [startDate, setStart] = useState(addDays(localToday(), 14));
  const [endDate, setEnd] = useState(addDays(localToday(), 17));
  const [inTime, setIn] = useState('16:00');
  const [outTime, setOut] = useState('10:00');
  const [people, setPeople] = useState<string[] | null>(null);
  const names = [...new Set([...(me?.family.map((p) => p.name) ?? []), ...(people ?? [])])];
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const on = picked ?? new Set(me?.family.map((p) => p.name) ?? []);
  const [extra, setExtra] = useState('');
  const [copy, setCopy] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const toggle = (n: string) => setPicked((on.has(n) ? new Set([...on].filter((x) => x !== n)) : new Set([...on, n])));
  const addExtra = () => {
    const n = extra.trim();
    if (!n) return;
    setPeople([...(people ?? []), n]);
    setPicked(new Set([...on, n]));
    setExtra('');
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      const t = await f<TripMeta>('/api/trips', {
        method: 'POST',
        body: {
          name, destination, startDate, endDate,
          ...(inTime ? { checkIn: startDate + 'T' + inTime } : {}),
          ...(outTime ? { checkOut: endDate + 'T' + outTime } : {}),
          tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
          family: names.filter((n) => on.has(n)),
          ...(copy ? { copyListsFrom: copy } : {}),
        },
      });
      await qc.invalidateQueries({ queryKey: tripsKey });
      onClose();
      nav('/app/trips/' + t.id);
    } catch (x) {
      setErr(x instanceof Error ? x.message : 'Could not create the trip');
      setBusy(false);
    }
  };
  return (
    <Sheet title="New trip" onClose={onClose}>
      <form className="tr-form" onSubmit={(e) => void submit(e)}>
        <label className="field">Name<input className="input" required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="field">Destination<input className="input" required maxLength={160} value={destination} onChange={(e) => setDestination(e.target.value)} /></label>
        <div className="tr-two">
          <label className="field">Start date<input className="input" type="date" required value={startDate} onChange={(e) => setStart(e.target.value)} /></label>
          <label className="field">End date<input className="input" type="date" required min={startDate} value={endDate} onChange={(e) => setEnd(e.target.value)} /></label>
          <label className="field">Check-in time<input className="input" type="time" value={inTime} onChange={(e) => setIn(e.target.value)} /></label>
          <label className="field">Check-out time<input className="input" type="time" value={outTime} onChange={(e) => setOut(e.target.value)} /></label>
        </div>
        <fieldset className="tr-fieldset">
          <legend>Who is going</legend>
          <div className="tr-chips">
            {names.map((n) => (
              <label key={n} className={'chip tr-pick' + (on.has(n) ? ' on is-selected' : '')}>
                <input type="checkbox" checked={on.has(n)} onChange={() => toggle(n)} /> {n}
              </label>
            ))}
          </div>
          <div className="tr-add">
            <input className="input" aria-label="Add another person" placeholder="Add another person" value={extra} maxLength={60} onChange={(e) => setExtra(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addExtra())} />
            <button type="button" className="btn btn-ghost btn-sm" onClick={addExtra}>Add</button>
          </div>
        </fieldset>
        {trips.length > 0 && (
          <label className="field">
            Copy packing and grocery lists from
            <select className="input" value={copy} onChange={(e) => setCopy(e.target.value)}>
              <option value="">Start with fresh lists</option>
              {trips.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
        )}
        {err && <p className="jr-error" role="alert">{err}</p>}
        <button className="btn" type="submit" disabled={busy || !name.trim() || !destination.trim()}>{busy ? 'Creating...' : 'Create trip'}</button>
      </form>
    </Sheet>
  );
}
