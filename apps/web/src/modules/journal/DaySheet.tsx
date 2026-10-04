import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { MED_DOSE_MAX, MED_DOSE_STEP, type MealKey, type Medication } from '@gravity/shared';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Icon } from '../../components/Icon';
import { dayLabel, localClock } from '../../lib/dates';
import { useJournalApi } from './api';
import { BodyStrip } from './BodyStrip';
import { Glimmers } from './Glimmers';
import { Meals } from './Meals';
import { MedicineCabinet } from './MedicineCabinet';
import { Medicines } from './Medicines';
import { Symptoms } from './Symptoms';
import { useDayDraft } from './useDayDraft';

interface Props {
  pid: string;
  date: string;
  readOnly?: boolean;
  ownerName?: string;
  /** Open with the glimmer composer focused. */
  focusGlimmer?: boolean;
  /** Open with the medicine cabinet open. */
  focusCabinet?: boolean;
  onClose: () => void;
}

export function DaySheet({ pid, date, readOnly, ownerName, focusGlimmer, focusCabinet, onClose }: Props) {
  const api = useJournalApi();
  const { draft, change, status, error, loadError } = useDayDraft(pid, date, readOnly);
  const foods = useQuery({ queryKey: ['journal', 'foods', pid], queryFn: () => api.foods(pid), enabled: !readOnly });
  const closeRef = useRef<HTMLButtonElement>(null);
  const qc = useQueryClient();
  const [forgetting, setForgetting] = useState<string | null>(null);
  const [cabinetOpen, setCabinetOpen] = useState(!!focusCabinet && !readOnly);

  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const suggestions = useMemo(() => foods.data?.map((f) => f.food) ?? [], [foods.data]);
  const addFood = (k: MealKey, text: string) => {
    const t = text.trim();
    if (t) change((d) => ({ ...d, meals: { ...d.meals, [k]: [...d.meals[k], { text: t }] } }));
  };
  const removeFood = (k: MealKey, i: number) => change((d) => ({ ...d, meals: { ...d.meals, [k]: d.meals[k].filter((_, j) => j !== i) } }));
  const editFood = (k: MealKey, i: number, text: string) =>
    change((d) => ({ ...d, meals: { ...d.meals, [k]: text ? d.meals[k].map((f, j) => (j === i ? { ...f, text } : f)) : d.meals[k].filter((_, j) => j !== i) } }));
  const forgetFood = async (food: string) => {
    await api.removeFood(pid, food);
    await qc.invalidateQueries({ queryKey: ['journal'] });
    setForgetting(null);
  };
  const toggleSymptom = (n: string) =>
    change((d) => {
      const has = d.symptoms.some((s) => s.name.toLowerCase() === n.toLowerCase());
      const symptoms = has ? d.symptoms.filter((s) => s.name.toLowerCase() !== n.toLowerCase()) : [...d.symptoms, { name: n, severity: 2 }];
      return { ...d, symptoms };
    });
  const setSeverity = (n: string, severity: number) => change((d) => ({ ...d, symptoms: d.symptoms.map((s) => (s.name === n ? { ...s, severity } : s)) }));

  const toggleMed = (m: Medication) =>
    change((d) => ({
      ...d,
      meds: d.meds.some((t) => t.id === m.id) ? d.meds.filter((t) => t.id !== m.id) : [...d.meds, { id: m.id, name: m.name, dose: 1, time: localClock() }],
    }));
  const setDose = (id: string, dose: number) =>
    change((d) => ({ ...d, meds: d.meds.map((t) => (t.id === id ? { ...t, dose: Math.min(MED_DOSE_MAX, Math.max(MED_DOSE_STEP, dose)) } : t)) }));

  const statusText = readOnly
    ? 'Shared by ' + (ownerName ?? 'family') + ' - view only'
    : status === 'saving' ? 'Saving...' : status === 'saved' ? 'Saved' : 'Changes save automatically';

  return (
    <>
      <motion.div className="jr-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
      <motion.aside
        className="jr-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={'Journal for ' + dayLabel(date)}
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 40 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      >
        <header className="jr-sheet-head">
          <div>
            <h2>{dayLabel(date)}</h2>
            <p className="jr-status muted" role="status">
              {error ? <span className="jr-error">{error}</span> : statusText}
            </p>
          </div>
          <button ref={closeRef} className="btn btn-ghost btn-sm jr-icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="x" />
          </button>
        </header>
        {!draft && readOnly && loadError ? (
          <div className="jr-sheet-body">
            <Glimmers pid={pid} date={date} readOnly ownerName={ownerName} />
            <p className="muted">{(ownerName ?? 'They') + ' kept the rest of this day private.'}</p>
          </div>
        ) : !draft ? (
          <p className="muted">Loading...</p>
        ) : (
          <div className="jr-sheet-body">
            {!readOnly && <BodyStrip pid={pid} date={date} />}
            <Glimmers pid={pid} date={date} readOnly={readOnly} ownerName={ownerName} autoFocus={focusGlimmer} />
            <div className={'jr-unwell' + (draft.unwell ? ' on' : '')}>
              <div>
                <strong id="unwell-label">Felt unwell today</strong>
                <p className="muted">Turn on to log symptoms.</p>
              </div>
              <button className="switch" role="switch" aria-checked={draft.unwell} aria-labelledby="unwell-label" disabled={readOnly} onClick={() => change((d) => ({ ...d, unwell: !d.unwell }))} />
            </div>
            {draft.unwell && <Symptoms symptoms={draft.symptoms} readOnly={readOnly} onToggle={toggleSymptom} onSeverity={setSeverity} />}
            {(!readOnly || draft.meds.length > 0) && <Medicines meds={draft.meds} readOnly={readOnly} onOpen={() => setCabinetOpen(true)} />}
            {!readOnly && <Meals meals={draft.meals} suggestions={suggestions} readOnly={readOnly} onAdd={addFood} onRemove={removeFood} onEdit={editFood} onForget={setForgetting} />}
            {!readOnly && (
              <section className="jr-block">
                <label className="field">
                  Notes
                  <textarea className="input" value={draft.notes ?? ''} maxLength={2000} placeholder="Sleep, stress, activity, anything else..." onChange={(e) => change((d) => ({ ...d, notes: e.target.value }))} />
                </label>
              </section>
            )}
            {!readOnly && (
              <div className="jr-share">
                <Icon name="lock" />
                <div>
                  <strong id="share-label">{draft.shared ? 'Visible to family' : 'Private to you'}</strong>
                  <p className="muted">Family can see that a day was unwell, symptoms and medicines, never your notes or meals.</p>
                </div>
                <button className="switch neutral" role="switch" aria-checked={draft.shared} aria-labelledby="share-label" onClick={() => change((d) => ({ ...d, shared: !d.shared }))} />
              </div>
            )}
          </div>
        )}
      </motion.aside>
      {cabinetOpen && !readOnly && draft && <MedicineCabinet taken={draft.meds} onToggle={toggleMed} onDose={setDose} onClose={() => setCabinetOpen(false)} />}
      {forgetting && (
        <ConfirmDialog
          danger
          title={'Remove “' + forgetting + '” everywhere?'}
          message="This removes it from every day you have logged and from your suggestions. It cannot be undone."
          confirmLabel="Remove everywhere"
          onConfirm={() => forgetFood(forgetting)}
          onCancel={() => setForgetting(null)}
        />
      )}
    </>
  );
}
