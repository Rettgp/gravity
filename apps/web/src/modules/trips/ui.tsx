import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, Check, Plus, Trash2, X, type LucideIcon } from 'lucide-react';
import type { Check as CheckItem, Row } from '@gravity/shared';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { newId, tokenizeRich } from './logic';

/** Renders **bold** and [label](url). Built from elements only; there is no HTML path. */
export function Rich({ text, className }: { text?: string; className?: string }) {
  if (!text) return null;
  return (
    <span className={className}>
      {tokenizeRich(text).map((t, i) =>
        t.t === 'bold' ? (
          <strong key={i}>{t.v}</strong>
        ) : t.t === 'link' ? (
          <a key={i} href={t.href} target="_blank" rel="noopener noreferrer">
            {t.label}
          </a>
        ) : (
          <span key={i}>{t.v}</span>
        ),
      )}
    </span>
  );
}

export const RICH_HINT = 'Use **bold** and [label](https://link) for formatting; links may be https:, tel: or mailto:.';
export const RichHint = () => <p className="muted tr-hint">{RICH_HINT}</p>;

/** Text input that keeps its own caret: edits go up on every keystroke, and the parent coalesces the save. */
export function Txt({ value, onChange, onBlur, label, multiline, placeholder, className = '', maxLength }: {
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  label: string;
  multiline?: boolean;
  placeholder?: string;
  className?: string;
  maxLength?: number;
}) {
  const [v, setV] = useState(value);
  const el = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  useEffect(() => {
    if (document.activeElement !== el.current) setV(value);
  }, [value]);
  const props = {
    ref: el, value: v, 'aria-label': label, placeholder, maxLength, className: 'input ' + className,
    onChange: (e: { target: { value: string } }) => (setV(e.target.value), onChange(e.target.value)),
    onBlur,
  };
  return multiline ? <textarea rows={2} {...props} /> : <input {...props} />;
}

/** Checkbox that flips at once. A box bound straight to the query cache would be put back by React for a tick, because the cache notifies asynchronously. */
export function Flag({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  const [v, setV] = useState(checked);
  useEffect(() => setV(checked), [checked]);
  return (
    <label className="tr-flag">
      <input type="checkbox" checked={v} onChange={(e) => (setV(e.target.checked), onChange(e.target.checked))} /> {children}
    </label>
  );
}

export function IconBtn({ icon: I, label, onClick, disabled, danger }: { icon: LucideIcon; label: string; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button type="button" className={'btn btn-ghost tr-icon' + (danger ? ' danger' : '')} aria-label={label} title={label} onClick={onClick} disabled={disabled}>
      <I size={18} aria-hidden="true" />
    </button>
  );
}

/** A trash button; with `ask` it first confirms in Gravity's dialog. */
export function RemoveBtn({ label, ask, onRemove }: { label: string; ask?: string; onRemove: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <IconBtn icon={Trash2} label={label} danger onClick={() => (ask ? setOpen(true) : onRemove())} />
      {open && <ConfirmDialog title={label} message={ask!} confirmLabel="Remove" danger onConfirm={() => (setOpen(false), onRemove())} onCancel={() => setOpen(false)} />}
    </>
  );
}

export function MoveBtns({ i, n, move }: { i: number; n: number; move: (to: number) => void }) {
  return (
    <>
      <IconBtn icon={ArrowUp} label="Move earlier" disabled={i === 0} onClick={() => move(i - 1)} />
      <IconBtn icon={ArrowDown} label="Move later" disabled={i === n - 1} onClick={() => move(i + 1)} />
    </>
  );
}

export function AddLine({ label, onAdd, placeholder }: { label: string; onAdd: (text: string) => void; placeholder?: string }) {
  const [v, setV] = useState('');
  return (
    <form
      className="tr-add"
      onSubmit={(e) => {
        e.preventDefault();
        if (!v.trim()) return;
        onAdd(v.trim());
        setV('');
      }}
    >
      <input className="input" value={v} onChange={(e) => setV(e.target.value)} aria-label={label} placeholder={placeholder ?? label} maxLength={200} />
      <button className="btn btn-sm" type="submit" disabled={!v.trim()}>
        <Plus size={16} aria-hidden="true" /> Add
      </button>
    </form>
  );
}

export const swap = <T,>(a: T[], i: number, to: number) => void a.splice(to, 0, a.splice(i, 1)[0]!);
export const count = (items: CheckItem[]) => ({ done: items.filter((i) => i.checked).length, total: items.length });

type Edit<T> = (fn: (draft: T) => void, how?: 'now' | 'text') => void;

/** One checklist: tick, rename in place, remove, add. Used for grocery, packing and to-dos. */
export function Checklist({ items, edit, commit, addLabel }: { items: CheckItem[]; edit: Edit<CheckItem[]>; commit: () => void; addLabel: string }) {
  return (
    <div className="tr-check">
      <ul className="tr-list">
        {items.map((it, i) => (
          <li key={i} className={'glass-row tr-item' + (it.checked ? ' done' : '')}>
            <button type="button" role="checkbox" aria-checked={it.checked} aria-label={'Done: ' + it.label} className="tr-box" onClick={() => edit((l) => void (l[i]!.checked = !l[i]!.checked))}>
              {it.checked && <Check size={16} aria-hidden="true" />}
            </button>
            <Txt className="tr-inline" label={'Item ' + (i + 1) + ': ' + it.label} value={it.label} onChange={(v) => edit((l) => void (l[i]!.label = v), 'text')} onBlur={commit} />
            <RemoveBtn label={'Remove ' + it.label} onRemove={() => edit((l) => void l.splice(i, 1))} />
          </li>
        ))}
      </ul>
      <AddLine label={addLabel} onAdd={(label) => edit((l) => void l.push({ label, checked: false }))} />
    </div>
  );
}

/** A titled group of checklist items with a renameable title and a remove button. */
export function CheckGroup({ group, edit, commit, onRemove }: {
  group: { id: string; title: string; items: CheckItem[] };
  edit: Edit<{ title: string; items: CheckItem[] }>;
  commit: () => void;
  onRemove: () => void;
}) {
  const c = count(group.items);
  return (
    <section className="tr-group" aria-label={group.title}>
      <div className="tr-group-head">
        <Txt className="tr-title" label={'Group name: ' + group.title} value={group.title} onChange={(v) => edit((g) => void (g.title = v), 'text')} onBlur={commit} />
        <span className="muted tr-count">{c.done}/{c.total}</span>
        <RemoveBtn label={'Remove group ' + group.title} ask={`Remove "${group.title}" and its ${c.total} items?`} onRemove={onRemove} />
      </div>
      <Checklist items={group.items} edit={(fn, how) => edit((g) => fn(g.items), how)} commit={commit} addLabel={'Add to ' + group.title} />
    </section>
  );
}

export const newGroup = (title: string) => ({ id: newId(), title, items: [] as CheckItem[] });

/** Label/value rows (logistics sections, info-card groups). Read view renders Rich; edit view has inputs. */
export function RowsEditor({ rows, editing, edit, commit }: { rows: Row[]; editing: boolean; edit: Edit<Row[]>; commit: () => void }) {
  if (!editing)
    return (
      <dl className="tr-kv">
        {rows.map((r, i) => (
          <div key={i} className={'tr-kv-row' + (r.tbd ? ' tbd' : '')}>
            <dt>{r.label}</dt>
            <dd>
              <Rich text={r.value} />
              {r.tbd && <span className="chip tr-chip">To confirm</span>}
            </dd>
          </div>
        ))}
      </dl>
    );
  return (
    <div className="tr-rows">
      {rows.map((r, i) => (
        <div key={i} className="glass-row tr-rowedit">
          <Txt label={'Row label ' + (i + 1)} value={r.label} placeholder="Label" onChange={(v) => edit((l) => void (l[i]!.label = v), 'text')} onBlur={commit} />
          <Txt multiline label={'Row value ' + (i + 1)} value={r.value} placeholder="Value" onChange={(v) => edit((l) => void (l[i]!.value = v), 'text')} onBlur={commit} />
          <div className="tr-actions">
            <Flag checked={!!r.tbd} onChange={(v) => edit((l) => void (l[i]!.tbd = v || undefined))}>To confirm</Flag>
            <RemoveBtn label={'Remove row ' + r.label} onRemove={() => edit((l) => void l.splice(i, 1))} />
          </div>
        </div>
      ))}
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => edit((l) => void l.push({ label: '', value: '' }))}>
        <Plus size={16} aria-hidden="true" /> Add row
      </button>
    </div>
  );
}

export function EditToggle({ editing, set, hint = true }: { editing: boolean; set: (v: boolean) => void; hint?: boolean }) {
  return (
    <div className="tr-edit-toggle">
      <button type="button" className={'btn btn-sm ' + (editing ? '' : 'btn-ghost')} aria-pressed={editing} onClick={() => set(!editing)}>
        {editing ? <><X size={16} aria-hidden="true" /> Done editing</> : 'Edit'}
      </button>
      {editing && hint && <RichHint />}
    </div>
  );
}

export const Section = ({ title, label, children, aside }: { title: string; label?: string; children: ReactNode; aside?: ReactNode }) => (
  <section className="card tr-card" aria-label={label ?? title}>
    <div className="row tr-card-head">
      {title && <h2>{title}</h2>}
      {aside}
    </div>
    {children}
  </section>
);
