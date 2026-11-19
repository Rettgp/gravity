import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import type { DaySection, LogisticsSection, OverviewSection, TripMeta } from '@gravity/shared';
import { useSection, useTrip } from './api';
import { daysBetween, longDate, shortDate, tripLength, whatsNext } from './logic';
import { EditToggle, RemoveBtn, Rich, RichHint, Section, Txt } from './ui';

const useNow = () => {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  return now;
};
const localDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function Overview({ meta }: { meta: TripMeta }) {
  const trip = useTrip(meta.id);
  const ov = useSection<OverviewSection>(meta.id, 'overview');
  const [editing, setEditing] = useState(false);
  const now = useNow();
  const sections = trip.data?.sections ?? {};
  const dayKeys = Object.keys(sections).filter((k) => k.startsWith('day-')).sort();
  const days = Object.fromEntries(dayKeys.map((k) => [k.slice(4), sections[k]!.data as DaySection]));
  const tbd = ((sections.logistics?.data as LogisticsSection | undefined)?.sections ?? []).flatMap((s) => s.rows.filter((r) => r.tbd));
  const next = whatsNext(meta, days, tbd, now);
  const today = localDay(now);
  const stat =
    next.kind === 'before' ? { v: next.days === 0 ? 'Today' : String(next.days), l: next.days === 1 ? 'day to go' : next.days === 0 ? 'check-in' : 'days to go' }
    : next.kind === 'after' ? { v: 'Done', l: 'Completed' }
    : { v: `Day ${Math.min(tripLength(meta), Math.max(1, daysBetween(meta.startDate, today) + 1))}`, l: `of ${tripLength(meta)}` };
  const o = ov.data;
  return (
    <div className="stack">
      <div className="tr-top">
        <div className="card stat tr-stat">
          <span className="stat-label">{next.kind === 'before' ? 'Countdown' : 'Trip'}</span>
          <span className="stat-value">{stat.v}</span>
          <span className="stat-trend">{stat.l}</span>
        </div>
        <section className="card tr-card tr-next" aria-label="What's next">
          <h2>What's next</h2>
          {next.kind === 'before' && (
            <>
              <p className="tr-lead">
                {next.days === 0 ? <><strong>Check-in is today</strong>.</> : next.days === 1 ? <><strong>Tomorrow</strong>: check-in.</> : <><strong>{next.days} days</strong> until check-in.</>}{' '}
                <span className="muted">{meta.checkIn ? new Date(meta.checkIn).toLocaleString(undefined, { weekday: 'long', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : longDate(meta.startDate)}</span>
              </p>
              {next.todo.length > 0 && (
                <div className="tr-todo">
                  <h3>Before you go</h3>
                  <ul>
                    {next.todo.map((r, i) => (
                      <li key={i}><strong>{r.label}:</strong> <Rich text={r.value} /></li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
          {next.kind === 'during' && (
            <>
              {next.current || next.next ? (
                <>
                  <p className="muted">{next.current ? 'Happening now' : 'Next up'} · {longDate(next.date)}</p>
                  <p className="tr-lead"><strong>{(next.current ?? next.next)!.title}</strong>{(next.current ?? next.next)!.time && <> · {(next.current ?? next.next)!.time}</>}</p>
                </>
              ) : (
                <p className="tr-lead">That's everything on the plan for now.</p>
              )}
              {days[next.date] && <Link className="btn btn-ghost btn-sm" to={`/app/trips/${meta.id}/day/${next.date}`}>Go to {days[next.date]!.navLabel} →</Link>}
            </>
          )}
          {next.kind === 'after' && <p className="tr-lead">Trip complete. Everything is kept here to look back on.</p>}
        </section>
      </div>

      <section aria-label="Days" className="tr-glance">
        {dayKeys.map((k) => {
          const d = days[k.slice(4)]!;
          return (
            <Link key={k} to={`/app/trips/${meta.id}/day/${k.slice(4)}`} className={'glass-row tr-day' + (k.slice(4) === today ? ' is-current' : '')} style={{ ['--day' as string]: d.color }}>
              <span className="muted">{d.navLabel} · {shortDate(k.slice(4))}</span>
              <strong>{d.title}</strong>
              {d.goal && <Rich className="muted tr-clamp" text={d.goal} />}
              <span className="muted">{d.events.length} {d.events.length === 1 ? 'event' : 'events'}</span>
            </Link>
          );
        })}
      </section>

      {o && (
        <Section title="Plan" aside={<EditToggle editing={editing} set={setEditing} hint={false} />}>
          {editing && <RichHint />}
          {o.planParagraphs.length === 0 && !editing && <p className="muted">No plan notes yet. Tap Edit to add some.</p>}
          {o.planParagraphs.map((p, i) =>
            editing ? (
              <div key={i} className="tr-line">
                <Txt multiline label={'Plan paragraph ' + (i + 1)} value={p} onChange={(v) => ov.edit((d) => void (d.planParagraphs[i] = v), 'text')} onBlur={ov.commit} />
                <RemoveBtn label="Remove paragraph" onRemove={() => ov.edit((d) => void d.planParagraphs.splice(i, 1))} />
              </div>
            ) : (
              <p key={i}><Rich text={p} /></p>
            ),
          )}
          {editing && (
            <button className="btn btn-ghost btn-sm" onClick={() => ov.edit((d) => void d.planParagraphs.push(''))}><Plus size={16} aria-hidden="true" /> Add paragraph</button>
          )}
          <div className="tr-two tr-party">
            {(['party', 'stay'] as const).map((k) => (
              <div key={k} className="glass-row">
                <h3>{k === 'party' ? 'Party' : 'Stay'}</h3>
                {editing ? <Txt multiline label={k === 'party' ? 'Party' : 'Stay'} value={o[k]} onChange={(v) => ov.edit((d) => void (d[k] = v), 'text')} onBlur={ov.commit} /> : o[k] ? <p><Rich text={o[k]} /></p> : <p className="muted">Nothing yet.</p>}
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}
