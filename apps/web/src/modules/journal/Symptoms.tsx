import type { Symptom } from '@gravity/shared';
import { AddInput } from './AddInput';

const COMMON = ['Nausea', 'Stomach ache', 'Headache', 'Bloating', 'Diarrhea', 'Fatigue', 'Fever', 'Rash', 'Cough'];

interface Props {
  symptoms: Symptom[];
  readOnly?: boolean;
  onToggle: (name: string) => void;
  onSeverity: (name: string, severity: number) => void;
}

export function Symptoms({ symptoms, readOnly, onToggle, onSeverity }: Props) {
  const has = (n: string) => symptoms.some((s) => s.name.toLowerCase() === n.toLowerCase());
  return (
    <section className="jr-block" aria-label="Symptoms">
      <h3>Symptoms</h3>
      <div className="jr-chips">
        {COMMON.map((n) => (
          <button key={n} className="chip" aria-pressed={has(n)} disabled={readOnly} onClick={() => onToggle(n)}>
            {n}
          </button>
        ))}
      </div>
      {!readOnly && <AddInput placeholder="Other symptom" label="Add symptom" onAdd={(t) => !has(t) && onToggle(t.trim())} />}
      {symptoms.map((s) => (
        <div key={s.name} className="jr-sev">
          <span>{s.name}</span>
          <div role="radiogroup" aria-label={s.name + ' severity'} className="jr-sev-scale">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                role="radio"
                aria-checked={s.severity === n}
                aria-label={'Severity ' + n}
                disabled={readOnly}
                className={'jr-sev-n' + (s.severity === n ? ' on' : '')}
                onClick={() => onSeverity(s.name, n)}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
