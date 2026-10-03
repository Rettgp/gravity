import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MAX_GLIMMERS_PER_DAY, type Glimmer } from '@gravity/shared';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Icon } from '../../components/Icon';
import { compressGlimmer } from '../../lib/image';
import type { GlimmerInput } from '@gravity/shared';
import { monthOf } from '../../lib/dates';
import { useJournalApi } from './api';
import { GlimmerLightbox } from './GlimmerLightbox';
import { GlimmerPicture } from './GlimmerThumb';

interface Props {
  pid: string;
  date: string;
  /** Viewing someone else's day: glimmers are shown but cannot be added or removed. */
  readOnly?: boolean;
  ownerName?: string;
  /** Scroll to and focus the composer on open (the dashboard's "Add a glimmer" link). */
  autoFocus?: boolean;
}

/** "Glimmers": small moments that brightened the day. Saved immediately, always visible to the family. */
export function Glimmers({ pid, date, readOnly, ownerName, autoFocus }: Props) {
  const api = useJournalApi();
  const qc = useQueryClient();
  const month = monthOf(date);
  const all = useQuery({ queryKey: ['journal', 'glimmers', pid, month], queryFn: () => api.listGlimmers(pid, month) });
  const mine = (all.data ?? []).filter((g) => g.date === date);
  const [caption, setCaption] = useState('');
  // The photo is shrunk the moment it is picked, and the preview shows exactly what will be posted.
  const [photo, setPhoto] = useState<NonNullable<GlimmerInput['image']> | null>(null);
  const [processing, setProcessing] = useState(false);
  const [pickKey, setPickKey] = useState(0);
  const pickToken = useRef(0);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<Glimmer | null>(null);
  const [removing, setRemoving] = useState<Glimmer | null>(null);
  const captionRef = useRef<HTMLTextAreaElement>(null);
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!autoFocus || readOnly) return;
    sectionRef.current?.scrollIntoView({ block: 'center' });
    captionRef.current?.focus({ preventScroll: true });
  }, [autoFocus, readOnly]);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    const token = ++pickToken.current;
    setError('');
    setProcessing(true);
    try {
      const out = await compressGlimmer(file);
      if (token === pickToken.current) setPhoto(out);
    } catch (e) {
      if (token === pickToken.current) setError(e instanceof Error ? e.message : 'Could not use that photo.');
    } finally {
      if (token === pickToken.current) setProcessing(false);
    }
  };
  const clearPhoto = () => {
    pickToken.current++;
    setPhoto(null);
    setProcessing(false);
    setPickKey((k) => k + 1);
  };

  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ['journal', 'glimmers', pid] }), qc.invalidateQueries({ queryKey: ['glimmers', 'feed'] })]);
  const add = useMutation({
    mutationFn: async () => api.addGlimmer(pid, { date, caption: caption.trim() || undefined, image: photo ?? undefined }),
    onSuccess: async () => {
      setCaption('');
      clearPhoto();
      setError('');
      await refresh();
    },
    onError: (e: Error) => setError(e.message),
  });
  const remove = async (g: Glimmer) => {
    await api.deleteGlimmer(pid, g.date, g.id);
    await refresh();
    setRemoving(null);
  };

  if (readOnly && mine.length === 0) return null;
  const canAdd = !readOnly && mine.length < MAX_GLIMMERS_PER_DAY;

  return (
    <section ref={sectionRef} className="jr-block gl-sheet" aria-label="Glimmers">
      <h3 className="gl-title">
        <Icon name="spark" size={18} /> Glimmers
      </h3>
      {mine.length === 0 && !readOnly && <p className="muted gl-lede">Something small that brightened your day. The family will see it on the dashboard.</p>}
      {mine.length > 0 && (
        <ul className="gl-list">
          {mine.map((g) => (
            <li key={g.id} className="gl-item">
              <button className="gl-open" onClick={() => setOpen(g)} aria-label={'Open glimmer' + (g.caption ? ': ' + g.caption : '')}>
                <GlimmerPicture glimmer={g} />
                <span className="gl-cap">{g.caption ?? (g.hasImage ? 'A glimmer' : '')}</span>
              </button>
              {!readOnly && (
                <button className="btn btn-ghost btn-sm jr-icon-btn" onClick={() => setRemoving(g)} aria-label="Remove glimmer">
                  <Icon name="trash" size={16} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canAdd && (
        <form
          className="gl-compose"
          onSubmit={(e) => {
            e.preventDefault();
            if (!add.isPending && !processing && (photo || caption.trim())) add.mutate();
          }}
        >
          {processing && <p className="muted gl-wait" role="status">Preparing photo...</p>}
          {photo && !processing && (
            <figure className="gl-preview">
              <img src={photo.thumb} alt="" />
            </figure>
          )}
          <div className="gl-row">
            {photo || processing ? (
              <>
                <label className="btn btn-ghost gl-icon gl-photo" title="Change photo" aria-label="Change photo">
                  <Icon name="image" size={22} />
                  <input key={pickKey} type="file" accept="image/*" className="sr-only" aria-label="Glimmer photo" onChange={(e) => void pick(e.target.files?.[0])} />
                </label>
                <button type="button" className="btn btn-ghost gl-icon gl-remove" title="Remove photo" aria-label="Remove photo" onClick={clearPhoto}>
                  <Icon name="trash" size={22} />
                </button>
              </>
            ) : (
              <label className="btn btn-ghost gl-photo">
                <Icon name="image" size={20} /> Add photo
                <input key={pickKey} type="file" accept="image/*" className="sr-only" aria-label="Glimmer photo" onChange={(e) => void pick(e.target.files?.[0])} />
              </label>
            )}
          </div>
          <textarea ref={captionRef} className="input" rows={2} maxLength={280} value={caption} placeholder="What made you smile?" aria-label="Glimmer caption" onChange={(e) => setCaption(e.target.value)} />
          {error && (
            <p role="alert" className="jr-error">
              {error}
            </p>
          )}
          <button className="btn gl-add" type="submit" disabled={add.isPending || processing || (!photo && !caption.trim())}>
            {add.isPending ? 'Saving...' : 'Add glimmer'}
          </button>
        </form>
      )}
      {!readOnly && !canAdd && <p className="muted gl-lede">That is {MAX_GLIMMERS_PER_DAY} glimmers for the day. Remove one to add another.</p>}
      {open && <GlimmerLightbox glimmer={open} who={ownerName} onClose={() => setOpen(null)} />}
      {removing && (
        <ConfirmDialog danger title="Remove this glimmer?" message="It disappears from the dashboard and the calendar for everyone." confirmLabel="Remove" onConfirm={() => remove(removing)} onCancel={() => setRemoving(null)} />
      )}
    </section>
  );
}
