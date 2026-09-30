import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { dayLabel } from '../../lib/dates';
import { useJournalApi } from './api';
import { BodySignalsCard } from './BodySignalsCard';

export function Insights({ pid }: { pid: string }) {
  const api = useJournalApi();
  const q = useQuery({ queryKey: ['journal', 'insights', pid], queryFn: () => api.insights(pid) });
  const [open, setOpen] = useState<string | null>(null);

  if (q.isLoading) return <p className="muted">Crunching your journal...</p>;
  if (q.isError || !q.data) return <p className="jr-error">Could not load insights.</p>;
  const { loggedDays, unwellDays, suspects, symptoms } = q.data;
  const maxLift = Math.max(2, ...suspects.map((s) => s.lift));
  const maxSym = Math.max(1, ...symptoms.map((s) => s.count));

  return (
    <div className="jr-insights">
      <div className="jr-stats">
        <div className="card">
          <strong>{loggedDays}</strong>
          <span className="muted">days logged</span>
        </div>
        <div className="card">
          <strong className="jr-coral">{unwellDays}</strong>
          <span className="muted">unwell days</span>
        </div>
      </div>

      <section className="card" aria-labelledby="suspects-h">
        <h2 id="suspects-h">Possible triggers</h2>
        <p className="muted jr-lede">Foods eaten on or the day before unwell days, compared with how often you are unwell overall.</p>
        {suspects.length === 0 ? (
          <p className="jr-empty">Nothing stands out yet. Keep logging meals, and mark the days you feel unwell.</p>
        ) : (
          <ul className="jr-suspects">
            {suspects.map((s) => (
              <li key={s.food}>
                <button className="jr-suspect" aria-expanded={open === s.food} onClick={() => setOpen(open === s.food ? null : s.food)}>
                  <span className="jr-suspect-name">{s.food}</span>
                  <span className="jr-bar" role="img" aria-label={s.lift + ' times more likely'}>
                    <i style={{ width: Math.min(100, (s.lift / maxLift) * 100) + '%' }} />
                  </span>
                  <span className="jr-suspect-n">
                    {s.lift}x <small className="muted">{s.unwellDays}/{s.exposedDays} days</small>
                  </span>
                </button>
                {open === s.food && (
                  <ul className="jr-dates">
                    {s.dates.map((d) => (
                      <li key={d}>{dayLabel(d)}</li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <BodySignalsCard pid={pid} />

      {symptoms.length > 0 && (
        <section className="card" aria-labelledby="sym-h">
          <h2 id="sym-h">Common symptoms</h2>
          <ul className="jr-suspects">
            {symptoms.map((s) => (
              <li key={s.name} className="jr-sym">
                <span className="jr-suspect-name">{s.name}</span>
                <span className="jr-bar violet" role="img" aria-label={s.count + ' days'}>
                  <i style={{ width: (s.count / maxSym) * 100 + '%' }} />
                </span>
                <span className="jr-suspect-n">{s.count}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="muted jr-note">Patterns are hints from your own notes, not medical advice. Talk to a doctor about ongoing symptoms.</p>
    </div>
  );
}
