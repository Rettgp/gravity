import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Day, DayInput } from '@gravity/shared';
import { monthOf } from '../../lib/dates';
import { useJournalApi } from './api';

export type Draft = Omit<DayInput, 'expectedUpdatedAt'>;
const toDraft = (d: Day): Draft => ({ meals: d.meals, unwell: d.unwell, symptoms: d.symptoms, notes: d.notes, shared: d.shared });

/** Loads a day, holds an editable draft, and autosaves (debounced) once the user changes something. */
export function useDayDraft(pid: string, date: string, readOnly?: boolean) {
  const api = useJournalApi();
  const qc = useQueryClient();
  const day = useQuery({ queryKey: ['journal', 'day', pid, date], queryFn: () => api.getDay(pid, date) });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState('');
  const version = useRef<string | undefined>(undefined);
  const dirty = useRef(false);
  const pending = useRef(false);
  const latest = useRef<Draft | null>(null);

  useEffect(() => {
    if (day.data) {
      setDraft(toDraft(day.data));
      version.current = day.data.updatedAt;
    }
  }, [day.data]);

  const save = useMutation({
    mutationFn: (d: Draft) => api.saveDay(pid, date, { ...d, expectedUpdatedAt: version.current }),
    onSuccess: (saved) => {
      version.current = saved.updatedAt;
      pending.current = false;
      setStatus('saved');
      void qc.invalidateQueries({ queryKey: ['journal', 'month', pid, monthOf(date)] });
      void qc.invalidateQueries({ queryKey: ['journal', 'insights', pid] });
      void qc.invalidateQueries({ queryKey: ['journal', 'foods', pid] });
    },
    onError: (e: Error) => {
      setStatus('error');
      setError(e.message);
    },
  });

  useEffect(() => {
    if (!draft || !dirty.current || readOnly) return;
    setStatus('saving');
    const t = setTimeout(() => save.mutate(draft), 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  useEffect(() => {
    latest.current = draft;
  }, [draft]);

  // Closing the sheet inside the debounce window must not lose the last edit: flush on unmount.
  useEffect(
    () => () => {
      if (!pending.current || !latest.current || readOnly) return;
      void api
        .saveDay(pid, date, { ...latest.current, expectedUpdatedAt: version.current })
        .then(() => qc.invalidateQueries({ queryKey: ['journal'] }))
        .catch(() => undefined);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const change = (fn: (d: Draft) => Draft) => {
    dirty.current = true;
    pending.current = true;
    setError('');
    setDraft((d) => (d ? fn(d) : d));
  };
  return { draft, change, status, error };
}
