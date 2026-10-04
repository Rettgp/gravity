import type { TakenMed } from '@gravity/shared';
import { Icon } from '../../components/Icon';
import { formatClock } from '../../lib/dates';

interface Props {
  meds: TakenMed[];
  readOnly?: boolean;
  onOpen: () => void;
}

/** What was taken today, always visible in the day sheet: dose and the time it was ticked off. */
export function Medicines({ meds, readOnly, onOpen }: Props) {
  const sorted = [...meds].sort((a, b) => a.time.localeCompare(b.time));
  return (
    <section className="jr-block" aria-label="Medicine">
      <h3>Medicine</h3>
      {sorted.length > 0 && (
        <ul className="md-taken">
          {sorted.map((m) => {
            const body = (
              <>
                <span className="md-taken-name">
                  <Icon name="pill" size={20} /> {m.name}
                </span>
                <span className="md-taken-meta">
                  <span className="md-taken-dose" aria-label={'Dose ' + m.dose}>
                    {m.dose} <Icon name="bottle" size={14} />
                  </span>
                  <span>{formatClock(m.time)}</span>
                </span>
              </>
            );
            return (
              <li key={m.id}>
                {readOnly ? (
                  <div className="md-taken-pill">{body}</div>
                ) : (
                  <button className="md-taken-pill" onClick={onOpen} aria-label={m.name + ', dose ' + m.dose + ', at ' + formatClock(m.time) + '. Open medicine cabinet'}>
                    {body}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {!readOnly && (
        <button className="btn btn-ghost md-open" onClick={onOpen}>
          <Icon name="pill" size={18} /> Open medicine cabinet
        </button>
      )}
    </section>
  );
}
