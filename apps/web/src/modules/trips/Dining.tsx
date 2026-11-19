import { useState } from 'react';
import { Plus } from 'lucide-react';
import type { DiningSection } from '@gravity/shared';
import { useSection } from './api';
import { EditToggle, RemoveBtn, Rich, Section, Txt } from './ui';

const lines = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean);

export function Dining({ id }: { id: string }) {
  const { data, edit, commit, loading } = useSection<DiningSection>(id, 'dining');
  const [editing, setEditing] = useState(false);
  if (!data) return <p className="muted">{loading ? 'Loading...' : 'No dining plan.'}</p>;
  return (
    <div className="stack">
      <div className="row"><h2>Dining</h2><EditToggle editing={editing} set={setEditing} /></div>
      {editing ? (
        <Txt multiline label="Dining note" placeholder="A note about eating out" value={data.note ?? ''} onChange={(v) => edit((d) => void (d.note = v || undefined), 'text')} onBlur={commit} />
      ) : (
        data.note && <p className="card tr-card"><Rich text={data.note} /></p>
      )}
      {data.meals.map((m, mi) => (
        <Section key={mi} title={editing ? '' : m.title} label={m.title} aside={editing ? <RemoveBtn label={'Remove ' + m.title} ask={`Remove "${m.title}" and everything in it?`} onRemove={() => edit((d) => void d.meals.splice(mi, 1))} /> : undefined}>
          {editing && <Txt label="Meal name" value={m.title} onChange={(v) => edit((d) => void (d.meals[mi]!.title = v), 'text')} onBlur={commit} />}
          {editing ? <Txt multiline label="Meal intro" placeholder="A note about this meal" value={m.intro ?? ''} onChange={(v) => edit((d) => void (d.meals[mi]!.intro = v || undefined), 'text')} onBlur={commit} /> : m.intro && <p className="muted" style={{ whiteSpace: 'pre-line' }}><Rich text={m.intro} /></p>}
          {m.groups.length === 0 && !editing && <p className="muted">Nothing planned.</p>}
          {m.groups.map((g, gi) => (
            <div key={gi} className="tr-subgroup">
              {editing ? (
                <div className="tr-line">
                  <Txt label="Group label" value={g.label} placeholder="Group (like Near the hotel)" onChange={(v) => edit((d) => void (d.meals[mi]!.groups[gi]!.label = v), 'text')} onBlur={commit} />
                  <RemoveBtn label={'Remove group ' + g.label} ask={`Remove "${g.label}" and its places?`} onRemove={() => edit((d) => void d.meals[mi]!.groups.splice(gi, 1))} />
                </div>
              ) : (
                <h3>{g.label}</h3>
              )}
              {editing ? <Txt multiline label="Group intro" placeholder="A note about this group" value={g.intro ?? ''} onChange={(v) => edit((d) => void (d.meals[mi]!.groups[gi]!.intro = v || undefined), 'text')} onBlur={commit} /> : g.intro && <p className="muted" style={{ whiteSpace: 'pre-line' }}><Rich text={g.intro} /></p>}
              {g.items.map((it, ii) =>
                editing ? (
                  <div key={ii} className="glass-row tr-rowedit">
                    <Txt label="Name" placeholder="Name" value={it.name} onChange={(v) => edit((d) => void (d.meals[mi]!.groups[gi]!.items[ii]!.name = v), 'text')} onBlur={commit} />
                    <Txt label="Tag" placeholder="Tag (like Cheap eats)" maxLength={60} value={it.tag ?? ''} onChange={(v) => edit((d) => void (d.meals[mi]!.groups[gi]!.items[ii]!.tag = v || undefined), 'text')} onBlur={commit} />
                    <Txt multiline label="Details" placeholder="Details" value={it.body} onChange={(v) => edit((d) => void (d.meals[mi]!.groups[gi]!.items[ii]!.body = v), 'text')} onBlur={commit} />
                    <Txt multiline label="Info lines (one per line)" placeholder="Info lines, one per line" value={it.meta.join('\n')} onChange={(v) => edit((d) => void (d.meals[mi]!.groups[gi]!.items[ii]!.meta = lines(v)), 'text')} onBlur={commit} />
                    <div className="tr-actions"><RemoveBtn label={'Remove ' + it.name} onRemove={() => edit((d) => void d.meals[mi]!.groups[gi]!.items.splice(ii, 1))} /></div>
                  </div>
                ) : (
                  <div key={ii} className="glass-row tr-dish">
                    <div className="row"><strong>{it.name}</strong>{it.tag && <span className="chip tr-chip">{it.tag}</span>}</div>
                    {it.body && <p><Rich text={it.body} /></p>}
                    {it.meta.length > 0 && <p className="tr-meta">{it.meta.map((x, k) => <span key={k} className="chip tr-chip"><Rich text={x} /></span>)}</p>}
                  </div>
                ),
              )}
              {editing && <button className="btn btn-ghost btn-sm" onClick={() => edit((d) => void d.meals[mi]!.groups[gi]!.items.push({ name: '', body: '', meta: [] }))}><Plus size={16} aria-hidden="true" /> Add place</button>}
            </div>
          ))}
          {editing && <button className="btn btn-ghost btn-sm" onClick={() => edit((d) => void d.meals[mi]!.groups.push({ label: 'New group', items: [] }))}><Plus size={16} aria-hidden="true" /> Add group</button>}
        </Section>
      ))}
      {editing && <button className="btn btn-ghost" onClick={() => edit((d) => void d.meals.push({ title: 'New meal', groups: [] }))}><Plus size={16} aria-hidden="true" /> Add meal</button>}
    </div>
  );
}
