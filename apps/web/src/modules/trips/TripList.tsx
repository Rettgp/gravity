import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Check, ChevronRight, MapPin, Plus } from 'lucide-react';
import type { TripMeta } from '@gravity/shared';
import { Sheet } from '../../components/Sheet';
import { useFetcher } from '../../lib/api';
import { localToday, addDays } from '../../lib/dates';
import { useMe } from '../../lib/me';
import { tripsKey, useTrips } from './api';
import { daysBetween, groupTrips, rangeLabel, tripWhen } from './logic';

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
  const [tried, setTried] = useState(false);

  const toggle = (n: string) => setPicked((on.has(n) ? new Set([...on].filter((x) => x !== n)) : new Set([...on, n])));
  const addExtra = () => {
    const n = extra.trim();
    if (!n) return;
    setPeople([...(people ?? []), n]);
    setPicked(new Set([...on, n]));
    setExtra('');
  };
  const nights = daysBetween(startDate, endDate);
  // Checked on submit and shown inline: a greyed-out button never says what is missing.
  const problems = {
    name: !name.trim() ? 'Give the trip a name' : '',
    destination: !destination.trim() ? 'Where are you going?' : '',
    endDate: startDate && endDate && nights < 0 ? 'Ends before it starts' : '',
  };
  type Key = keyof typeof problems;
  const show = (k: Key) => (tried ? problems[k] : '');
  const aria = (k: Key) => ({ id: 'nt-' + k, 'aria-invalid': show(k) ? true : undefined, 'aria-describedby': show(k) ? 'nt-' + k + '-err' : undefined });
  const field = (id: string, label: string, input: ReactNode, req = false) => {
    const msg = id in problems ? show(id as Key) : '';
    return (
      <label className="field" htmlFor={'nt-' + id}>
        <span>
          {label}
          {req && <span className="tr-req" aria-hidden="true"> *</span>}
        </span>
        {input}
        {msg && <span className="tr-field-err" id={'nt-' + id + '-err'}>{msg}</span>}
      </label>
    );
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTried(true);
    const bad = (Object.keys(problems) as Key[]).find((k) => problems[k]);
    if (bad) return document.getElementById('nt-' + bad)?.focus();
    setBusy(true);
    setErr('');
    try {
      const t = await f<TripMeta>('/api/trips', {
        method: 'POST',
        body: {
          name: name.trim(), destination: destination.trim(), startDate, endDate,
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
    <Sheet
      title="New trip"
      subtitle="Days, packing, groceries and costs, all in one place."
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <span className="spacer" />
          <button className="btn" type="submit" form="new-trip" disabled={busy}>{busy ? 'Creating…' : 'Create trip'}</button>
        </>
      }
    >
      <form id="new-trip" className="tr-form tr-new" noValidate onSubmit={(e) => void submit(e)}>
        <section className="tr-new-sec" aria-labelledby="nt-where">
          <h3 id="nt-where">Where</h3>
          {field('name', 'Name', <input className="input" {...aria('name')} aria-required="true" maxLength={120} placeholder="e.g. Lake weekend" autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} />, true)}
          {field('destination', 'Destination', <input className="input" {...aria('destination')} aria-required="true" maxLength={160} placeholder="e.g. Branson, MO" autoComplete="off" value={destination} onChange={(e) => setDestination(e.target.value)} />, true)}
        </section>

        <section className="tr-new-sec" aria-labelledby="nt-when">
          <div className="tr-new-head">
            <h3 id="nt-when">When</h3>
            {nights >= 0 && <span className="chip tr-chip">{nights === 0 ? 'Day trip' : nights + (nights === 1 ? ' night' : ' nights')}</span>}
          </div>
          <div className="tr-two">
            {field('startDate', 'Start date', <input className="input" id="nt-startDate" type="date" value={startDate} onChange={(e) => setStart(e.target.value)} />)}
            {field('endDate', 'End date', <input className="input" {...aria('endDate')} type="date" min={startDate} value={endDate} onChange={(e) => setEnd(e.target.value)} />)}
            {field('in', 'Check-in time', <input className="input" id="nt-in" type="time" value={inTime} onChange={(e) => setIn(e.target.value)} />)}
            {field('out', 'Check-out time', <input className="input" id="nt-out" type="time" value={outTime} onChange={(e) => setOut(e.target.value)} />)}
          </div>
        </section>

        <section className="tr-new-sec" aria-labelledby="nt-who">
          <h3 id="nt-who">Who is going</h3>
          <div className="jr-chips" role="group" aria-labelledby="nt-who">
            {names.map((n) => (
              <button key={n} type="button" className="chip tr-pick" aria-pressed={on.has(n)} onClick={() => toggle(n)}>
                {on.has(n) && <Check size={15} aria-hidden="true" />}
                {n}
              </button>
            ))}
          </div>
          <div className="tr-add">
            <input className="input" aria-label="Add another person" placeholder="Add a friend or relative" value={extra} maxLength={60} onChange={(e) => setExtra(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addExtra())} />
            <button type="button" className="icon-btn tr-add-btn" aria-label="Add person" disabled={!extra.trim()} onClick={addExtra}>
              <Plus size={20} aria-hidden="true" />
            </button>
          </div>
        </section>

        {trips.length > 0 && (
          <section className="tr-new-sec" aria-labelledby="nt-lists">
            <h3 id="nt-lists">Lists</h3>
            {field('copy', 'Copy packing and grocery lists from', (
              <select className="input" id="nt-copy" value={copy} onChange={(e) => setCopy(e.target.value)}>
                <option value="">Start with fresh lists</option>
                {trips.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            ))}
          </section>
        )}
        {err && <p className="jr-error" role="alert">{err}</p>}
      </form>
    </Sheet>
  );
}
