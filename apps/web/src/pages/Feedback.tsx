import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bug, Lightbulb, MessageSquarePlus, Plus, Trash2 } from 'lucide-react';
import { FEEDBACK_MAX_DESCRIPTION, FEEDBACK_TYPES, type FeedbackItem } from '@gravity/shared';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Sheet } from '../components/Sheet';
import { feedbackAreas } from '../components/shell/nav';
import { useFetcher } from '../lib/api';

type Status = 'all' | 'open' | 'done';
type Draft = Pick<FeedbackItem, 'type' | 'area' | 'description'>;
const KEY = ['feedback'];
const when = (ms: number) => new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

/** App-wide bugs and feature requests. Areas come from the nav, so a new module is pickable as soon as it exists. */
export function Feedback() {
  const f = useFetcher();
  const qc = useQueryClient();
  const areas = useMemo(feedbackAreas, []);
  const [status, setStatus] = useState<Status>('all');
  const [type, setType] = useState('');
  const [area, setArea] = useState('');
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<FeedbackItem | null>(null);

  const list = useQuery({ queryKey: KEY, queryFn: () => f<{ items: FeedbackItem[] }>('/api/core/feedback').then((r) => r.items) });
  const refresh = () => qc.invalidateQueries({ queryKey: KEY });
  const save = useMutation({
    mutationFn: (i: Draft & { id: string; done: boolean }) => f('/api/core/feedback/' + encodeURIComponent(i.id), { method: 'PUT', body: i }),
    onSuccess: refresh,
  });
  const del = useMutation({ mutationFn: (id: string) => f('/api/core/feedback/' + encodeURIComponent(id), { method: 'DELETE' }), onSuccess: refresh });

  const all = list.data ?? [];
  const shown = all.filter((i) => (!type || i.type === type) && (!area || i.area === area));
  // Areas that were filed but are no longer in the nav (a removed module, or a migrated item) still get a filter chip.
  const chips = [...areas, ...new Set(all.map((i) => i.area).filter((a) => !areas.includes(a)))];

  const group = (label: string, items: FeedbackItem[]) =>
    items.length > 0 && (
      <section className="fb-group" aria-label={label}>
        <h2>
          {label} <span className="muted">{items.length}</span>
        </h2>
        <ul className="fb-list">
          {items.map((i) => (
            <li key={i.id} className={'card fb-item' + (i.done ? ' is-done' : '')}>
              <input
                type="checkbox"
                className="fb-check"
                checked={i.done}
                aria-label={'Done: ' + i.description.slice(0, 60)}
                onChange={(e) => save.mutate({ id: i.id, type: i.type, area: i.area, description: i.description, done: e.target.checked })}
              />
              <div className="fb-body">
                <div className="fb-tags">
                  <span className="chip">
                    {i.type === 'Bug' ? <Bug size={14} aria-hidden="true" /> : <Lightbulb size={14} aria-hidden="true" />} {i.type}
                  </span>
                  <span className="chip">{i.area}</span>
                  {i.originalArea && (
                    <span className="chip fb-orig" title="Where this was filed originally">
                      {i.originalArea}
                    </span>
                  )}
                </div>
                <p className="fb-text">{i.description}</p>
                <p className="muted fb-meta">
                  {i.createdBy.split(' ')[0]} · {when(i.createdAt)}
                  {i.done && i.doneAt ? ' · done ' + when(i.doneAt) : ''}
                </p>
              </div>
              <button className="icon-btn danger" aria-label={'Delete: ' + i.description.slice(0, 60)} onClick={() => setDeleting(i)}>
                <Trash2 size={18} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      </section>
    );

  return (
    <div className="page">
      <header className="page-head row">
        <div>
          <p className="muted">Ideas and bugs for any part of Gravity</p>
          <h1>Feedback</h1>
        </div>
        <button className="btn" onClick={() => setAdding(true)}>
          <Plus size={18} aria-hidden="true" /> New
        </button>
      </header>

      <section className="card stack" aria-label="Filters">
        <div className="segmented" role="radiogroup" aria-label="Status">
          {(['all', 'open', 'done'] as Status[]).map((s) => (
            <button key={s} role="radio" aria-checked={status === s} onClick={() => setStatus(s)}>
              {s[0]!.toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
        <div className="segmented" role="radiogroup" aria-label="Type filter">
          {['', ...FEEDBACK_TYPES].map((t) => (
            <button key={t} role="radio" aria-checked={type === t} onClick={() => setType(t)}>
              {t || 'Any type'}
            </button>
          ))}
        </div>
        <div className="fb-areas" data-carousel role="group" aria-label="Area filter">
          {['', ...chips].map((a) => (
            <button key={a} className="chip" aria-pressed={area === a} onClick={() => setArea(a)}>
              {a || 'All areas'}
            </button>
          ))}
        </div>
      </section>

      {list.isError && (
        <p role="alert" className="jr-error">
          {(list.error as Error).message}
        </p>
      )}
      {list.isLoading && <p className="muted">Loading...</p>}
      {list.data && all.length === 0 && (
        <div className="card fb-empty">
          <MessageSquarePlus size={28} aria-hidden="true" />
          <p>No feedback yet. Spot a bug or have an idea? File it here.</p>
        </div>
      )}
      {list.data && all.length > 0 && shown.length === 0 && <p className="muted">Nothing matches those filters.</p>}
      {status !== 'done' && group('Open', shown.filter((i) => !i.done))}
      {status !== 'open' && group('Done', shown.filter((i) => i.done))}

      {adding && <NewFeedback areas={areas} onClose={() => setAdding(false)} onSave={(d) => save.mutateAsync({ ...d, id: crypto.randomUUID(), done: false })} />}
      {deleting && (
        <ConfirmDialog
          danger
          title="Delete this feedback?"
          message="It is removed for everyone. This cannot be undone."
          confirmLabel="Delete"
          onConfirm={async () => {
            await del.mutateAsync(deleting.id);
            setDeleting(null);
          }}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  );
}

function NewFeedback({ areas, onClose, onSave }: { areas: string[]; onClose: () => void; onSave: (d: Draft) => Promise<unknown> }) {
  const [type, setType] = useState<FeedbackItem['type']>('Bug');
  const [area, setArea] = useState('Other');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      await onSave({ type, area, description });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
      setBusy(false);
    }
  };
  return (
    <Sheet title="New feedback" onClose={onClose}>
      <div className="jr-sheet-body">
        <div className="segmented" role="radiogroup" aria-label="Type">
          {FEEDBACK_TYPES.map((t) => (
            <button key={t} role="radio" aria-checked={type === t} onClick={() => setType(t)}>
              {t === 'Bug' ? <Bug size={16} aria-hidden="true" /> : <Lightbulb size={16} aria-hidden="true" />} {t}
            </button>
          ))}
        </div>
        <label className="field">
          Area
          <select className="input" value={area} onChange={(e) => setArea(e.target.value)}>
            {areas.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
        </label>
        <label className="field">
          Description
          <textarea
            className="input"
            rows={6}
            maxLength={FEEDBACK_MAX_DESCRIPTION}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What should change, or what went wrong? For bugs, say what you did."
          />
          <span className="fb-count">
            {description.length} / {FEEDBACK_MAX_DESCRIPTION}
          </span>
        </label>
        {error && (
          <p role="alert" className="jr-error">
            {error}
          </p>
        )}
        <button className="btn" disabled={busy || !description.trim()} onClick={() => void submit()}>
          {busy ? 'Saving...' : 'Add feedback'}
        </button>
      </div>
    </Sheet>
  );
}
