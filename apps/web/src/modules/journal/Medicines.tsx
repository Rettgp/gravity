import type { TakenMed } from '@gravity/shared';
import { Icon } from '../../components/Icon';
import { formatClock } from '../../lib/dates';
import { SectionHead } from './SectionHead';
import { useLongPress } from './useLongPress';

interface Props {
  meds: TakenMed[];
  readOnly?: boolean;
  onOpen: () => void;
  /** Press and hold a taken medicine to change its dose or time. */
  onEdit: (id: string) => void;
}

function TakenPill({ med, onOpen, onEdit }: { med: TakenMed; onOpen: () => void; onEdit: () => void }) {
  const lp = useLongPress(onEdit);
  const { guard, ...handlers } = lp;
  return (
    <button
      className="md-taken-pill"
      {...handlers}
      onClick={guard(onOpen)}
      aria-label={med.name + ', dose ' + med.dose + ', at ' + formatClock(med.time) + '. Tap to open the medicine cabinet, press and hold to edit'}
    >
      <PillBody med={med} />
    </button>
  );
}

function PillBody({ med: m }: { med: TakenMed }) {
  return (
    <>
      <span className="md-taken-name">
        <Icon name="pill" size={20} />
        <span className="md-taken-text">{m.name}</span>
      </span>
      <span className="md-taken-meta">
        <span className="md-taken-dose" aria-label={'Dose ' + m.dose}>
          {m.dose} <Icon name="bottle" size={14} />
        </span>
        <span>{formatClock(m.time)}</span>
      </span>
    </>
  );
}

/** What was taken today, always visible in the day sheet: dose and the time it was ticked off. */
export function Medicines({ meds, readOnly, onOpen, onEdit }: Props) {
  const sorted = [...meds].sort((a, b) => a.time.localeCompare(b.time));
  return (
    <section className="jr-block" aria-label="Medicine">
      <SectionHead icon="pill">Medicine</SectionHead>
      {sorted.length > 0 && (
        <ul className="md-taken">
          {sorted.map((m) => (
            <li key={m.id}>
              {readOnly ? (
                <div className="md-taken-pill">
                  <PillBody med={m} />
                </div>
              ) : (
                <TakenPill med={m} onOpen={onOpen} onEdit={() => onEdit(m.id)} />
              )}
            </li>
          ))}
        </ul>
      )}
      {!readOnly && sorted.length > 0 && <p className="muted md-hint">Press and hold a medicine to change its dose or time.</p>}
      {!readOnly && (
        <button className="btn btn-ghost md-open" onClick={onOpen}>
          <Icon name="pill" size={18} /> Open medicine cabinet
        </button>
      )}
    </section>
  );
}
