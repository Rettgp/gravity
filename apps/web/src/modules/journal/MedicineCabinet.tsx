import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { MED_DOSE_MAX, MED_DOSE_STEP, type Medication, type TakenMed } from '@gravity/shared';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Icon } from '../../components/Icon';
import { useJournalApi } from './api';
import { AddInput } from './AddInput';

interface Props {
  taken: TakenMed[];
  onToggle: (med: Medication) => void;
  onDose: (id: string, dose: number) => void;
  onClose: () => void;
}

/** The family medicine cabinet: tap a medicine to mark it taken, step its dose by 0.5, tap again to undo. */
export function MedicineCabinet({ taken, onToggle, onDose, onClose }: Props) {
  const api = useJournalApi();
  const qc = useQueryClient();
  const cabinet = useQuery({ queryKey: ['journal', 'cabinet'], queryFn: () => api.cabinet() });
  const closeRef = useRef<HTMLButtonElement>(null);
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState<Medication | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Esc closes only the cabinet, not the day sheet behind it. A confirm dialog on top handles its own Esc.
      if (document.querySelector('.cd-root')) return;
      e.stopImmediatePropagation();
      e.preventDefault();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const add = useMutation({
    mutationFn: (name: string) => api.addMed(name),
    onSuccess: () => {
      setError('');
      return qc.invalidateQueries({ queryKey: ['journal', 'cabinet'] });
    },
    onError: (e: Error) => setError(e.message),
  });
  const remove = async (m: Medication) => {
    await api.deleteMed(m.id);
    await qc.invalidateQueries({ queryKey: ['journal', 'cabinet'] });
    setRemoving(null);
  };

  const meds = cabinet.data ?? [];
  const takenOf = (id: string) => taken.find((t) => t.id === id);

  return createPortal(
    <div className="md-root">
      <motion.div className="md-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={onClose} />
      <motion.div
        className="md-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Medicine cabinet"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      >
        <header className="jr-sheet-head">
          <div>
            <h2>Medicine cabinet</h2>
            <p className="jr-status muted">Tap what you took. Tap again to undo.</p>
          </div>
          <button ref={closeRef} className="btn btn-ghost btn-sm jr-icon-btn" onClick={onClose} aria-label="Close medicine cabinet">
            <Icon name="x" />
          </button>
        </header>
        {cabinet.isLoading && <p className="muted">Loading...</p>}
        {cabinet.isError && <p className="jr-error">Could not load the cabinet.</p>}
        {cabinet.data && meds.length === 0 && <p className="jr-empty">The cabinet is empty. Add a medicine below.</p>}
        <ul className="md-list">
          {meds.map((m) => {
            const t = takenOf(m.id);
            return (
              <li key={m.id} className={'md-pill' + (t ? ' on' : '')}>
                <div className="md-row">
                  <button className="md-head" aria-pressed={!!t} onClick={() => onToggle(m)}>
                    <Icon name="pill" size={22} />
                    <span className="md-name">{m.name}</span>
                  </button>
                  {editing && (
                    <button className="jr-x" aria-label={'Remove ' + m.name + ' from the cabinet'} onClick={() => setRemoving(m)}>
                      <Icon name="trash" size={18} />
                    </button>
                  )}
                </div>
                {t && (
                  <div className="md-dose" role="group" aria-label={'Dose of ' + m.name}>
                    <button className="md-step" aria-label={'Decrease dose of ' + m.name} disabled={t.dose <= MED_DOSE_STEP} onClick={() => onDose(m.id, t.dose - MED_DOSE_STEP)}>
                      &minus;
                    </button>
                    <span className="md-amount" aria-live="polite">
                      {t.dose} <Icon name="bottle" size={18} />
                    </span>
                    <button className="md-step" aria-label={'Increase dose of ' + m.name} disabled={t.dose >= MED_DOSE_MAX} onClick={() => onDose(m.id, t.dose + MED_DOSE_STEP)}>
                      +
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        <div className="md-foot">
          <AddInput placeholder="Add a medicine to the cabinet" label="Add medication" onAdd={(n) => add.mutate(n.trim())} />
          {error && <p role="alert" className="jr-error">{error}</p>}
          {meds.length > 0 && (
            <button className="btn btn-ghost btn-sm md-edit" aria-pressed={editing} onClick={() => setEditing((v) => !v)}>
              {editing ? 'Done' : 'Edit cabinet'}
            </button>
          )}
        </div>
      </motion.div>
      {removing && (
        <ConfirmDialog
          danger
          title={'Remove "' + removing.name + '"?'}
          message="It leaves the cabinet for everyone. Days where it was already taken keep their record."
          confirmLabel="Remove"
          onConfirm={() => remove(removing)}
          onCancel={() => setRemoving(null)}
        />
      )}
    </div>,
    document.body,
  );
}
