import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { MED_DOSE_MAX, MED_DOSE_STEP, type TakenMed } from '@gravity/shared';
import { Icon } from '../../components/Icon';
import { acceptDigits, digitsFromClock, displayDigits, finishDigits, isComplete, isPm, to24 } from '../../lib/clock';
import { formatClock, localClock } from '../../lib/dates';

interface Props {
  med: TakenMed;
  onDose: (dose: number) => void;
  onTime: (time: string) => void;
  onRemove: () => void;
  onClose: () => void;
}

/** Bottom sheet to fix the dose or the time of a medicine that was already marked as taken. */
/** Type the time with the digit keyboard (645 -> 6:45) and flip AM/PM with a toggle. */
function TimeField({ time, onTime }: { time: string; onTime: (t: string) => void }) {
  const [typing, setTyping] = useState(false);
  const [digits, setDigits] = useState('');
  const pm = isPm(time);
  const text = typing ? displayDigits(digits) : displayDigits(digitsFromClock(time));
  /** What the field currently means, including a half-typed entry like "6" or "64". */
  const parts = () => (typing ? finishDigits(digits) : null) ?? finishDigits(digitsFromClock(time))!;
  const setPm = (next: boolean) => {
    const p = parts();
    onTime(to24(p.hour, p.minute, next));
    setTyping(false);
  };
  return (
    <div className="md-timerow">
      <input
        className="input md-time"
        aria-label="Time taken"
        inputMode="numeric"
        enterKeyHint="done"
        autoComplete="off"
        placeholder="h:mm"
        value={text}
        onFocus={(e) => {
          const el = e.currentTarget;
          setDigits(digitsFromClock(time));
          setTyping(true);
          requestAnimationFrame(() => el.select());
        }}
        onChange={(e) => {
          const d = acceptDigits(e.target.value);
          setDigits(d);
          const f = finishDigits(d);
          if (isComplete(d) && f) onTime(to24(f.hour, f.minute, pm));
        }}
        onBlur={() => {
          const f = finishDigits(digits);
          if (f) onTime(to24(f.hour, f.minute, pm));
          setTyping(false);
        }}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      />
      <div className="md-ampm" role="radiogroup" aria-label="AM or PM">
        {(['AM', 'PM'] as const).map((l) => (
          <button key={l} role="radio" aria-checked={pm === (l === 'PM')} className={pm === (l === 'PM') ? 'on' : ''} onClick={() => setPm(l === 'PM')}>
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}

export function MedEdit({ med, onDose, onTime, onRemove, onClose }: Props) {
  const doneRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    doneRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      e.preventDefault();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return createPortal(
    <div className="md-root">
      <motion.div className="md-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={onClose} />
      <motion.div
        className="md-modal md-edit-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={'Edit ' + med.name}
        initial={{ opacity: 0, y: 32 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      >
        <span className="md-grab" aria-hidden="true" />
        <header className="md-edit-head">
          <Icon name="pill" size={22} />
          <h2>{med.name}</h2>
        </header>

        <section className="md-field" aria-label="Dose">
          <span className="md-label">Dose</span>
          <div className="md-bigstep">
            <button aria-label={'Decrease dose of ' + med.name} disabled={med.dose <= MED_DOSE_STEP} onClick={() => onDose(med.dose - MED_DOSE_STEP)}>
              &minus;
            </button>
            <span className="md-amount" aria-live="polite">
              {med.dose} <Icon name="bottle" size={22} />
            </span>
            <button aria-label={'Increase dose of ' + med.name} disabled={med.dose >= MED_DOSE_MAX} onClick={() => onDose(med.dose + MED_DOSE_STEP)}>
              +
            </button>
          </div>
        </section>

        <section className="md-field" aria-label="Time">
          <span className="md-label">Time taken</span>
          <TimeField time={med.time} onTime={onTime} />
          <button className="btn btn-ghost md-now" onClick={() => onTime(localClock())}>
            Set to now
          </button>
          <p className="muted md-hint">Shown as {formatClock(med.time)}</p>
        </section>

        <div className="md-actions">
          <button className="btn btn-ghost md-remove" onClick={onRemove}>
            <Icon name="trash" size={18} /> Remove
          </button>
          <button ref={doneRef} className="btn md-done" onClick={onClose}>
            Done
          </button>
        </div>
      </motion.div>
    </div>,
    document.body,
  );
}
