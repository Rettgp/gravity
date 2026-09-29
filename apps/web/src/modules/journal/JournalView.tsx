import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence } from 'motion/react';
import type { ProfileSummary } from '@gravity/shared';
import { localToday, monthOf, shiftMonth } from '../../lib/dates';
import { useJournalApi } from './api';
import { Calendar } from './Calendar';
import { DaySheet } from './DaySheet';
import { Insights } from './Insights';

type Tab = 'calendar' | 'insights' | 'family';

interface Props {
  /** Profiles the viewer can log for. */
  profiles: ProfileSummary[];
  /** Everyone in the family (for names in the shared feed). */
  family: ProfileSummary[];
  defaultProfileId: string;
  /** Landing-page demo: sheet sits beside the calendar instead of overlaying it. */
  inline?: boolean;
  initialDate?: string;
  initialTab?: Tab;
}

export function JournalView({ profiles, family, defaultProfileId, inline, initialDate, initialTab = 'calendar' }: Props) {
  const api = useJournalApi();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [pid, setPid] = useState(defaultProfileId);
  const [month, setMonth] = useState(monthOf(initialDate ?? localToday()));
  const [selected, setSelected] = useState<{ pid: string; date: string; readOnly?: boolean } | null>(initialDate ? { pid: defaultProfileId, date: initialDate } : null);
  const [unwellOnly, setUnwellOnly] = useState(false);

  const monthQ = useQuery({ queryKey: ['journal', 'month', pid, month], queryFn: () => api.listMonth(pid, month) });
  const sharedQ = useQuery({ queryKey: ['journal', 'shared', month], queryFn: () => api.shared(month), enabled: tab === 'family' });
  const names = useMemo(() => new Map(family.map((p) => [p.id, p])), [family]);
  const close = () => setSelected(null);

  const sheet = selected && (
    <DaySheet key={selected.pid + selected.date} pid={selected.pid} date={selected.date} readOnly={selected.readOnly} ownerName={names.get(selected.pid)?.name} onClose={close} />
  );

  return (
    <div className={'jr' + (inline ? ' jr-inline' : '')}>
      <div className="jr-toolbar">
        <div className="jr-tabs" role="tablist" aria-label="Journal sections">
          {(['calendar', 'insights', 'family'] as Tab[]).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} className={'jr-tab' + (tab === t ? ' on' : '')} onClick={() => setTab(t)}>
              {t === 'calendar' ? 'Calendar' : t === 'insights' ? 'Insights' : 'Family'}
            </button>
          ))}
        </div>
        {profiles.length > 1 && tab !== 'family' && (
          <div className="jr-chips" role="group" aria-label="Whose journal">
            {profiles.map((p) => (
              <button key={p.id} className="chip" aria-pressed={pid === p.id} onClick={() => (setPid(p.id), setSelected(null))}>
                <span aria-hidden="true">{p.emoji}</span> {p.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className={inline ? 'jr-split' : undefined}>
        {tab === 'calendar' && (
          <Calendar
            month={month}
            summaries={monthQ.data ?? []}
            selected={selected?.pid === pid ? selected.date : undefined}
            unwellOnly={unwellOnly}
            onSelect={(date) => setSelected({ pid, date })}
            onMonth={(d) => setMonth((m) => shiftMonth(m, d))}
            onUnwellOnly={setUnwellOnly}
          />
        )}
        {tab === 'insights' && <Insights pid={pid} />}
        {tab === 'family' && (
          <section className="card jr-family" aria-label="Shared with family">
            <h2>Shared with family</h2>
            <p className="muted jr-lede">Days family members chose to share. Notes and meals stay private.</p>
            {(sharedQ.data ?? []).length === 0 ? (
              <p className="jr-empty">Nothing shared this month.</p>
            ) : (
              <ul className="jr-feed">
                {(sharedQ.data ?? []).map((s) => {
                  const p = names.get(s.profileId);
                  return (
                    <li key={s.profileId + s.date}>
                      <button className="jr-feed-row" onClick={() => setSelected({ pid: s.profileId, date: s.date, readOnly: true })}>
                        <span aria-hidden="true">{p?.emoji}</span>
                        <strong>{p?.name ?? 'Family'}</strong>
                        <span className="muted">{s.date}</span>
                        <span className={s.unwell ? 'jr-coral' : 'muted'}>{s.unwell ? 'Felt unwell' : 'Logged'}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}
        {inline && tab === 'calendar' && (selected ? sheet : <div className="jr-sheet jr-sheet-empty muted">Pick a day to see the journal.</div>)}
      </div>
      {!inline && <AnimatePresence>{sheet}</AnimatePresence>}
    </div>
  );
}
