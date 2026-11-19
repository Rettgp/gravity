import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, MapPin, Pencil } from 'lucide-react';
import type { TripMeta } from '@gravity/shared';
import { Sheet } from '../../components/Sheet';
import { useFetcher } from '../../lib/api';
import { say, tripsKey, useNotice, useTrip, type TripDoc } from './api';
import { Cost } from './Cost';
import { Day } from './Day';
import { Dining } from './Dining';
import { Grocery, Packing } from './Lists';
import { Logistics } from './Logistics';
import { rangeLabel, shortDate } from './logic';
import { Overview } from './Overview';

export default function TripLayout() {
  const { tripId = '' } = useParams();
  const trip = useTrip(tripId);
  const loc = useLocation();
  const [editing, setEditing] = useState(false);
  const nav = useRef<HTMLElement>(null);
  const notice = useNotice();
  useEffect(() => {
    const el = nav.current?.querySelector<HTMLElement>('[aria-current="page"]');
    if (el && nav.current) nav.current.scrollLeft = el.offsetLeft - (nav.current.clientWidth - el.offsetWidth) / 2;
  }, [loc.pathname, trip.data?.meta.id]);

  if (trip.isLoading) return <p className="muted" role="status">Loading trip...</p>;
  if (!trip.data) {
    return (
      <div className="page tr">
        <p className="jr-error" role="alert">We could not find that trip.</p>
        <Link className="btn btn-ghost" to="/app/trips">All trips</Link>
      </div>
    );
  }
  const { meta, sections } = trip.data;
  const base = '/app/trips/' + meta.id;
  const days = Object.keys(sections).filter((k) => k.startsWith('day-')).sort();
  const links = [
    { to: base, label: 'Overview', exact: true },
    ...days.map((k) => {
      const date = k.slice(4);
      return { to: `${base}/day/${date}`, label: `${(sections[k]!.data as { navLabel: string }).navLabel} ${shortDate(date)}`, exact: false };
    }),
    ...['dining', 'grocery', 'packing', 'logistics', 'cost'].map((p) => ({ to: `${base}/${p}`, label: p[0]!.toUpperCase() + p.slice(1), exact: false })),
  ];
  return (
    <div className="page tr">
      <Link to="/app/trips" className="tr-back"><ArrowLeft size={16} aria-hidden="true" /> All trips</Link>
      <header className="card tr-head">
        <div>
          {meta.eyebrow && <p className="muted tr-eyebrow">{meta.eyebrow}</p>}
          <h1>{meta.name}</h1>
          <p className="muted tr-sub">
            <span><MapPin size={14} aria-hidden="true" /> {meta.destination}</span> <span>{rangeLabel(meta)}</span>
          </p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}><Pencil size={14} aria-hidden="true" /> Edit trip</button>
      </header>
      <nav ref={nav} className="segmented tr-nav" aria-label="Trip sections">
        {links.map((l) => (
          <Link key={l.to} to={l.to} aria-current={(l.exact ? loc.pathname.replace(/\/$/, '') === l.to : loc.pathname === l.to) ? 'page' : undefined}>
            {l.label}
          </Link>
        ))}
      </nav>
      <Routes>
        <Route index element={<Overview meta={meta} />} />
        <Route path="day/:date" element={<Day meta={meta} />} />
        <Route path="dining" element={<Dining id={meta.id} />} />
        <Route path="grocery" element={<Grocery id={meta.id} />} />
        <Route path="packing" element={<Packing id={meta.id} />} />
        <Route path="logistics" element={<Logistics id={meta.id} />} />
        <Route path="cost" element={<Cost id={meta.id} />} />
        <Route path="*" element={<p className="muted">Nothing here.</p>} />
      </Routes>
      {notice && (
        <div className={'tr-toast' + (notice.kind === 'error' ? ' error' : '')} role={notice.kind === 'error' ? 'alert' : 'status'}>
          {notice.text}
        </div>
      )}
      {editing && <MetaSheet meta={meta} onClose={() => setEditing(false)} />}
    </div>
  );
}

function MetaSheet({ meta, onClose }: { meta: TripMeta; onClose: () => void }) {
  const f = useFetcher();
  const qc = useQueryClient();
  const [m, setM] = useState({ ...meta, checkIn: meta.checkIn ?? '', checkOut: meta.checkOut ?? '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (k: keyof typeof m) => (e: { target: { value: string } }) => setM({ ...m, [k]: e.target.value });
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      const { name, eyebrow, destination, startDate, endDate, checkIn, checkOut, tz } = m;
      const next = await f<TripMeta>(`/api/trips/${meta.id}/meta`, { method: 'PUT', body: { name, eyebrow, destination, startDate, endDate, tz, ...(checkIn ? { checkIn } : {}), ...(checkOut ? { checkOut } : {}) } });
      // New dates may have created day sections, so reload the whole trip rather than patch the meta.
      await qc.invalidateQueries({ queryKey: ['trip', meta.id] });
      qc.setQueryData<TripDoc>(['trip', meta.id], (d) => d && { ...d, meta: next });
      void qc.invalidateQueries({ queryKey: tripsKey });
      say('info', 'Trip updated');
      onClose();
    } catch (x) {
      setErr(x instanceof Error ? x.message : 'Could not save');
      setBusy(false);
    }
  };
  return (
    <Sheet title="Edit trip" onClose={onClose}>
      <form className="tr-form" onSubmit={(e) => void submit(e)}>
        <label className="field">Name<input className="input" required maxLength={120} value={m.name} onChange={set('name')} /></label>
        <label className="field">Eyebrow (small line above the name)<input className="input" maxLength={120} value={m.eyebrow} onChange={set('eyebrow')} /></label>
        <label className="field">Destination<input className="input" required maxLength={160} value={m.destination} onChange={set('destination')} /></label>
        <div className="tr-two">
          <label className="field">Start date<input className="input" type="date" required value={m.startDate} onChange={set('startDate')} /></label>
          <label className="field">End date<input className="input" type="date" required min={m.startDate} value={m.endDate} onChange={set('endDate')} /></label>
          <label className="field">Check-in<input className="input" type="datetime-local" value={m.checkIn} onChange={set('checkIn')} /></label>
          <label className="field">Check-out<input className="input" type="datetime-local" value={m.checkOut} onChange={set('checkOut')} /></label>
        </div>
        {err && <p className="jr-error" role="alert">{err}</p>}
        <button className="btn" type="submit" disabled={busy}>{busy ? 'Saving...' : 'Save'}</button>
      </form>
    </Sheet>
  );
}
