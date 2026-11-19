import { useState } from 'react';
import { Plus } from 'lucide-react';
import type { LogisticsSection } from '@gravity/shared';
import { useSection } from './api';
import { newId } from './logic';
import { AddLine, EditToggle, Flag, RemoveBtn, Rich, RowsEditor, Section, Txt } from './ui';

const URGENCY = ['urgent', 'moderate', 'flexible'] as const;

export function Logistics({ id }: { id: string }) {
  const { data, edit, commit, loading } = useSection<LogisticsSection>(id, 'logistics');
  const [editing, setEditing] = useState(false);
  if (!data) return <p className="muted">{loading ? 'Loading...' : 'Nothing here.'}</p>;
  return (
    <div className="stack">
      <div className="row"><h2>Logistics</h2><EditToggle editing={editing} set={setEditing} /></div>
      {data.sections.map((s, si) => (
        <Section key={si} title={editing ? '' : s.title} label={s.title} aside={editing ? <RemoveBtn label={'Remove section ' + s.title} ask={`Remove "${s.title}" and its rows?`} onRemove={() => edit((d) => void d.sections.splice(si, 1))} /> : undefined}>
          {editing && <Txt label="Section title" value={s.title} onChange={(v) => edit((d) => void (d.sections[si]!.title = v), 'text')} onBlur={commit} />}
          {s.rows.length === 0 && !editing && <p className="muted">Nothing here yet.</p>}
          <RowsEditor rows={s.rows} editing={editing} edit={(fn, how) => edit((d) => fn(d.sections[si]!.rows), how)} commit={commit} />
        </Section>
      ))}
      {editing && <section className="card tr-card"><AddLine label="New section" placeholder="Add a section" onAdd={(title) => edit((d) => void d.sections.push({ title, rows: [] }))} /></section>}

      <Section title="Tickets & bookings">
        {data.tickets.length === 0 && <p className="muted">No tickets yet.</p>}
        <ul className="tr-list">
          {data.tickets.map((t, i) => (
            <li key={t.id} className={'glass-row tr-ticket' + (t.booked ? ' booked' : '')}>
              {editing ? (
                <div className="tr-rowedit">
                  <Txt label="Ticket name" value={t.name} onChange={(v) => edit((d) => void (d.tickets[i]!.name = v), 'text')} onBlur={commit} />
                  <select className="input" aria-label="Urgency" value={t.urgency} onChange={(e) => edit((d) => void (d.tickets[i]!.urgency = e.target.value as (typeof URGENCY)[number]))}>
                    {URGENCY.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                  <Txt multiline label="Ticket details" value={t.body} onChange={(v) => edit((d) => void (d.tickets[i]!.body = v), 'text')} onBlur={commit} />
                  <div className="tr-two">
                    <Txt label="Link label" placeholder="Link label" value={t.link?.label ?? ''} onChange={(v) => edit((d) => void (d.tickets[i]!.link = { label: v, href: d.tickets[i]!.link?.href ?? '' }), 'text')} onBlur={commit} />
                    <Txt label="Link address" placeholder="https://..." value={t.link?.href ?? ''} onChange={(v) => edit((d) => void (d.tickets[i]!.link = v ? { label: d.tickets[i]!.link?.label || 'Link', href: v } : undefined), 'text')} onBlur={commit} />
                  </div>
                  <div className="tr-actions"><RemoveBtn label={'Remove ticket ' + t.name} ask={`Remove "${t.name}"?`} onRemove={() => edit((d) => void d.tickets.splice(i, 1))} /></div>
                </div>
              ) : (
                <>
                  <div className="row">
                    <strong className="tr-ticket-name">{t.name}</strong>
                    <span className={'chip tr-chip tr-urgency ' + t.urgency}>{t.urgency}</span>
                  </div>
                  {t.body && <p><Rich text={t.body} /></p>}
                  {t.link && /^https:\/\//.test(t.link.href) && <a href={t.link.href} target="_blank" rel="noopener noreferrer">{t.link.label}</a>}
                </>
              )}
              <Flag checked={t.booked} onChange={(v) => edit((d) => void (d.tickets[i]!.booked = v))}>
                Booked<span className="sr-only"> {t.name}</span>
              </Flag>
            </li>
          ))}
        </ul>
        {editing && (
          <button className="btn btn-ghost btn-sm" onClick={() => edit((d) => void d.tickets.push({ id: newId(), name: 'New ticket', urgency: 'moderate', body: '', booked: false }))}>
            <Plus size={16} aria-hidden="true" /> Add ticket
          </button>
        )}
      </Section>
    </div>
  );
}
