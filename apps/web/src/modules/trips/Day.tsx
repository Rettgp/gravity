import { useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { Anchor, Pencil, Plus } from 'lucide-react';
import type { DaySection, InfoCard, TripMeta } from '@gravity/shared';
import { Sheet } from '../../components/Sheet';
import { useDay } from './api';
import { longDate, newId } from './logic';
import { AddLine, EditToggle, IconBtn, MoveBtns, RemoveBtn, Rich, RichHint, RowsEditor, Section, Txt, swap } from './ui';

type Ev = DaySection['events'][number];
const COLORS = [['var(--green)', 'Green'], ['var(--coral)', 'Coral'], ['var(--amber)', 'Amber'], ['var(--violet)', 'Violet'], ['var(--cyan)', 'Cyan']] as const;

export function Day({ meta }: { meta: TripMeta }) {
  const { date = '' } = useParams();
  const day = useDay(meta.id, date);
  const [editing, setEditing] = useState(false);
  const [sheet, setSheet] = useState<{ index: number } | { after: number } | null>(null);
  const d = day.data;
  if (!d) return day.loading ? <p className="muted">Loading...</p> : <p className="muted">That day is not part of this trip.</p>;
  const { edit, commit } = day;
  return (
    <div className="stack tr-dayview" style={{ ['--day' as string]: d.color }}>
      <section className="card tr-card tr-dayhead" aria-label="Day">
        <div className="row tr-card-head">
          <div>
            <p className="muted">{longDate(date)}</p>
            {!editing && <h2>{d.title}</h2>}
          </div>
          <EditToggle editing={editing} set={setEditing} />
        </div>
        {editing ? (
          <div className="tr-form">
            <label className="field">Title<Txt label="Day title" value={d.title} onChange={(v) => edit((x) => void (x.title = v), 'text')} onBlur={commit} /></label>
            <div className="tr-two">
              <label className="field">Short name in the menu<Txt label="Menu name" maxLength={40} value={d.navLabel} onChange={(v) => edit((x) => void (x.navLabel = v), 'text')} onBlur={commit} /></label>
              <label className="field">
                Color
                <select className="input" value={d.color} onChange={(e) => edit((x) => void (x.color = e.target.value))}>
                  {COLORS.map(([v, n]) => <option key={v} value={v}>{n}</option>)}
                </select>
              </label>
            </div>
            <label className="field">Goal<Txt multiline label="Goal" value={d.goal ?? ''} onChange={(v) => edit((x) => void (x.goal = v || undefined), 'text')} onBlur={commit} /></label>
            <label className="field">Anchor (the one thing that must happen)<Txt multiline label="Anchor text" value={d.anchor ?? ''} onChange={(v) => edit((x) => void (x.anchor = v || undefined), 'text')} onBlur={commit} /></label>
          </div>
        ) : (
          <>
            {d.goal && <p><strong>Goal.</strong> <Rich text={d.goal} /></p>}
            {d.anchor && <p className="tr-anchor-note"><Anchor size={16} aria-hidden="true" /> <Rich text={d.anchor} /></p>}
          </>
        )}
      </section>

      <Section title="Timeline" aside={<button className="btn btn-sm" onClick={() => setSheet({ after: d.events.length - 1 })}><Plus size={16} aria-hidden="true" /> Add event</button>}>
        {d.events.length === 0 && <p className="muted">Nothing planned yet.</p>}
        <ol className="tr-timeline">
          {d.events.map((ev, i) => (
            <li key={ev.id} className={'glass-row tr-event' + (ev.anchor ? ' anchor is-current' : '')}>
              <div className="tr-event-top">
                <span className="chip tr-chip">{ev.time || 'Any time'}</span>
                {ev.anchor && <span className="chip tr-chip tr-badge"><Anchor size={14} aria-hidden="true" /> Anchor</span>}
              </div>
              <h3>{ev.title || 'Untitled'}</h3>
              {ev.body && <p><Rich text={ev.body} /></p>}
              {ev.meta.length > 0 && <p className="tr-meta">{ev.meta.map((m, j) => <span key={j} className="chip tr-chip"><Rich text={m} /></span>)}</p>}
              <Reminders ev={ev} i={i} edit={edit} />
              <div className="tr-actions">
                <button type="button" className="btn btn-ghost btn-sm" aria-pressed={ev.anchor} onClick={() => edit((x) => void (x.events[i]!.anchor = !ev.anchor))}>
                  <Anchor size={16} aria-hidden="true" /> Anchor
                </button>
                <IconBtn icon={Pencil} label={'Edit ' + ev.title} onClick={() => setSheet({ index: i })} />
                <MoveBtns i={i} n={d.events.length} move={(to) => edit((x) => swap(x.events, i, to))} />
                <RemoveBtn label={'Remove ' + ev.title} ask={`Remove "${ev.title || 'this event'}" from the day?`} onRemove={() => edit((x) => void x.events.splice(i, 1))} />
              </div>
            </li>
          ))}
        </ol>
      </Section>

      <Section title="Notes" aside={editing ? null : undefined}>
        {d.notes.length === 0 && !editing && <p className="muted">No notes.</p>}
        {d.notes.map((n, i) =>
          editing ? (
            <div key={i} className="tr-line">
              <Txt multiline label={'Note ' + (i + 1)} value={n} onChange={(v) => edit((x) => void (x.notes[i] = v), 'text')} onBlur={commit} />
              <RemoveBtn label="Remove note" onRemove={() => edit((x) => void x.notes.splice(i, 1))} />
            </div>
          ) : (
            <p key={i} className="glass-row"><Rich text={n} /></p>
          ),
        )}
        {editing ? <button className="btn btn-ghost btn-sm" onClick={() => edit((x) => void x.notes.push(''))}><Plus size={16} aria-hidden="true" /> Add note</button> : null}
      </Section>

      {(d.cards.length > 0 || editing) && (
        <>
          {d.cards.map((c, i) => (
            <InfoCardView key={i} card={c} editing={editing} edit={(fn, how) => edit((x) => fn(x.cards[i]!), how)} commit={commit} onRemove={() => edit((x) => void x.cards.splice(i, 1))} />
          ))}
          {editing && (
            <button className="btn btn-ghost" onClick={() => edit((x) => void x.cards.push({ title: 'New card', groups: [{ rows: [] }] }))}><Plus size={16} aria-hidden="true" /> Add info card</button>
          )}
        </>
      )}
      {sheet && <EventSheet d={d} target={sheet} onClose={() => setSheet(null)} onSave={(fn) => edit(fn)} />}
    </div>
  );
}

function Reminders({ ev, i, edit }: { ev: Ev; i: number; edit: (fn: (d: DaySection) => void, how?: 'now' | 'text') => void }) {
  return (
    <div className="tr-reminders">
      {ev.reminders.length > 0 && (
        <ul className="tr-list" aria-label={'Reminders for ' + ev.title}>
          {ev.reminders.map((r, j) => (
            <li key={j} className="tr-reminder">
              <span>{r}</span>
              <RemoveBtn label={'Remove reminder ' + r} onRemove={() => edit((x) => void x.events[i]!.reminders.splice(j, 1))} />
            </li>
          ))}
        </ul>
      )}
      <AddLine label={'Add reminder for ' + ev.title} placeholder="Add a reminder" onAdd={(t) => edit((x) => void x.events[i]!.reminders.push(t))} />
    </div>
  );
}

/** Info card: title, intro and groups of label/value rows. */
function InfoCardView({ card, editing, edit, commit, onRemove }: { card: InfoCard; editing: boolean; edit: (fn: (c: InfoCard) => void, how?: 'now' | 'text') => void; commit: () => void; onRemove: () => void }) {
  return (
    <Section title={card.title || 'Info'} aside={editing ? <RemoveBtn label={'Remove card ' + card.title} ask={`Remove the card "${card.title}"?`} onRemove={onRemove} /> : undefined}>
      {editing && <Txt label="Card title" value={card.title} onChange={(v) => edit((c) => void (c.title = v), 'text')} onBlur={commit} />}
      {editing ? <Txt multiline label="Card intro" placeholder="Intro" value={card.intro ?? ''} onChange={(v) => edit((c) => void (c.intro = v || undefined), 'text')} onBlur={commit} /> : card.intro && <p><Rich text={card.intro} /></p>}
      {card.groups.map((g, gi) => (
        <div key={gi} className="tr-subgroup">
          {editing ? (
            <div className="tr-line">
              <Txt label="Group label" placeholder="Group label (optional)" value={g.label ?? ''} onChange={(v) => edit((c) => void (c.groups[gi]!.label = v || undefined), 'text')} onBlur={commit} />
              <RemoveBtn label="Remove group" onRemove={() => edit((c) => void c.groups.splice(gi, 1))} />
            </div>
          ) : (
            g.label && <h3>{g.label}</h3>
          )}
          <RowsEditor rows={g.rows} editing={editing} edit={(fn, how) => edit((c) => fn(c.groups[gi]!.rows), how)} commit={commit} />
        </div>
      ))}
      {editing && <button className="btn btn-ghost btn-sm" onClick={() => edit((c) => void c.groups.push({ rows: [] }))}><Plus size={16} aria-hidden="true" /> Add group</button>}
    </Section>
  );
}

function EventSheet({ d, target, onClose, onSave }: { d: DaySection; target: { index: number } | { after: number }; onClose: () => void; onSave: (fn: (d: DaySection) => void) => void }) {
  const old = 'index' in target ? d.events[target.index] : undefined;
  const [f, setF] = useState({ time: old?.time ?? '', at: old?.at ?? '', until: old?.until ?? '', title: old?.title ?? '', body: old?.body ?? '', meta: (old?.meta ?? []).join('\n'), anchor: old?.anchor ?? false });
  const [after, setAfter] = useState('after' in target ? target.after : -1);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const ev: Ev = {
      id: old?.id ?? newId(), time: f.time, ...(f.at ? { at: f.at } : {}), ...(f.until ? { until: f.until } : {}), title: f.title, body: f.body,
      meta: f.meta.split('\n').map((s) => s.trim()).filter(Boolean), anchor: f.anchor, reminders: old?.reminders ?? [],
    };
    onSave((x) => {
      if (old && 'index' in target) x.events[target.index] = ev;
      else x.events.splice(after + 1, 0, ev);
    });
    onClose();
  };
  return (
    <Sheet title={old ? 'Edit event' : 'Add event'} onClose={onClose}>
      <form className="tr-form" onSubmit={submit}>
        <label className="field">Title<input className="input" required maxLength={200} value={f.title} onChange={set('title')} /></label>
        <label className="field">Time shown (free text, like 8:00 to 9:30 AM)<input className="input" maxLength={40} value={f.time} onChange={set('time')} /></label>
        <div className="tr-two">
          <label className="field">Starts at<input className="input" type="time" value={f.at} onChange={set('at')} /></label>
          <label className="field">Ends at<input className="input" type="time" value={f.until} onChange={set('until')} /></label>
        </div>
        <label className="field">Details<textarea className="input" maxLength={2000} value={f.body} onChange={set('body')} /></label>
        <label className="field">Chips (one per line)<textarea className="input" value={f.meta} onChange={set('meta')} /></label>
        <RichHint />
        {!old && (
          <label className="field">
            Insert
            <select className="input" value={after} onChange={(e) => setAfter(Number(e.target.value))}>
              <option value={-1}>At the start</option>
              {d.events.map((ev, i) => <option key={ev.id} value={i}>After {ev.title || 'event ' + (i + 1)}</option>)}
            </select>
          </label>
        )}
        <label className="tr-flag"><input type="checkbox" checked={f.anchor} onChange={(e) => setF({ ...f, anchor: e.target.checked })} /> Anchor event</label>
        <button className="btn" type="submit" disabled={!f.title.trim()}>{old ? 'Save event' : 'Add to day'}</button>
      </form>
    </Sheet>
  );
}
