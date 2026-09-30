import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { addDays, type HealthDay } from '@gravity/shared';
import { Icon } from '../../components/Icon';
import { localToday } from '../../lib/dates';
import { tempLabel, useTempUnit } from '../../lib/units';
import { useHttpJournalApi } from '../journal/api';
import { BigChart } from './BigChart';
import { dayName, fmtDuration, fullDate, show, showDiff, withUnit, type MetricDef } from './metrics';
import { StagesChart } from './StagesChart';
import { daySpan, monthsBetween, pointsOf, summarize, unwellSplit } from './stats';

const RANGES = [
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
  { days: 365, label: 'Year' },
] as const;

interface Props {
  def: MetricDef;
  pid: string;
  /** Everything loaded so far (at least 90 days). The full year arrives separately and replaces it. */
  days: HealthDay[];
  loadingYear: boolean;
  onClose: () => void;
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="hl-stat">
      <dt className="muted">{label}</dt>
      <dd>
        <strong>{value}</strong>
        {sub && <small className="muted"> {sub}</small>}
      </dd>
    </div>
  );
}

/** Full-screen-ish view of one number: big chart, range picker, stats, what it means, and the raw values. */
export function MetricDetail({ def, pid, days, loadingYear, onClose }: Props) {
  const today = localToday();
  const [unit, setUnit] = useTempUnit();
  const [range, setRange] = useState<(typeof RANGES)[number]['days']>(30);
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const from = addDays(today, -(range - 1));
  const span = daySpan(from, today);

  // Focus in, lock background scroll, Esc closes, Tab stays inside.
  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true });
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return onClose();
      if (e.key !== 'Tab' || !panelRef.current) return;
      const f = [...panelRef.current.querySelectorAll<HTMLElement>('button, [href], summary, [tabindex="0"]')].filter((el) => !el.hasAttribute('disabled'));
      if (f.length === 0) return;
      const first = f[0]!;
      const last = f[f.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  // Days logged as unwell in the journal, for the range on screen.
  const api = useHttpJournalApi();
  const months = useMemo(() => monthsBetween(from, today), [from, today]);
  const monthQs = useQueries({ queries: months.map((m) => ({ queryKey: ['journal', 'month', pid, m], queryFn: () => api.listMonth(pid, m), staleTime: 60_000 })) });
  const unwell = useMemo(() => new Set(monthQs.flatMap((q) => q.data ?? []).filter((d) => d.unwell).map((d) => d.date)), [monthQs]);

  const all = useMemo(() => pointsOf(days, def.key, addDays(today, -364), today), [days, def.key, today]);
  const inRange = useMemo(() => all.filter((p) => p.date >= from), [all, from]);
  const s = useMemo(() => summarize(all, inRange, today, span), [all, inRange, today, span]);
  const split = useMemo(() => unwellSplit(inRange, unwell), [inRange, unwell]);
  const rows = useMemo(() => [...inRange].reverse(), [inRange]);
  const sleep = def.key === 'sleepMinutes';
  const half = 10 ** -(def.digits ?? 0) / 2;

  return (
    <>
      <motion.div className="jr-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
      <motion.div
        ref={panelRef}
        className="hl-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="hl-detail-title"
        initial={{ opacity: 0, y: 32 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 32 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      >
        <header className="hl-modal-head">
          <div>
            <p className="muted hl-fine">Last {range === 365 ? 'year' : range + ' days'}</p>
            <h2 id="hl-detail-title">{def.label}</h2>
          </div>
          <button ref={closeRef} className="btn btn-ghost btn-sm jr-icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="x" />
          </button>
        </header>

        <div className="hl-controls">
          <div className="hl-range" role="group" aria-label="Time range">
            {RANGES.map((r) => (
              <button key={r.days} className={'jr-tab' + (range === r.days ? ' on' : '')} aria-pressed={range === r.days} onClick={() => setRange(r.days)}>
                {r.label}
              </button>
            ))}
          </div>
          {def.key === 'skinTempC' && (
            <div className="hl-units" role="group" aria-label="Temperature unit">
              {(['F', 'C'] as const).map((u) => (
                <button key={u} className="chip" aria-pressed={unit === u} onClick={() => setUnit(u)}>
                  {tempLabel(u)}
                </button>
              ))}
            </div>
          )}
        </div>

        {loadingYear && range > 90 && <p className="muted hl-fine">Loading the full year...</p>}
        {inRange.length === 0 ? (
          <p className="jr-empty">No {def.label.toLowerCase()} data in this range.</p>
        ) : (
          <BigChart def={def} points={inRange} from={from} to={today} usual={s.usual} unwell={unwell} />
        )}
        {sleep && <StagesChart days={days.filter((d) => d.date >= from)} from={from} to={today} />}

        <dl className="hl-stats" aria-label="Summary">
          <Stat label="Latest" value={s.latest ? withUnit(def, s.latest.value) : '–'} sub={s.latest ? dayName(s.latest.date, today) : undefined} />
          <Stat label="7-day average" value={s.avg7 !== undefined ? withUnit(def, s.avg7) : '–'} sub={s.diff !== undefined && Math.abs(s.diff) >= half ? `${s.diff > 0 ? '+' : '−'}${showDiff(def, s.diff)} vs usual` : undefined} />
          <Stat label="30-day average" value={s.avg30 !== undefined ? withUnit(def, s.avg30) : '–'} />
          <Stat label="Your usual" value={s.usual ? withUnit(def, s.usual.mean) : '–'} sub={s.usual ? `± ${showDiff(def, s.usual.sd)}` : 'needs a week of data'} />
          <Stat label="Lowest" value={s.min ? withUnit(def, s.min.value) : '–'} sub={s.min ? dayName(s.min.date, today) : undefined} />
          <Stat label="Highest" value={s.max ? withUnit(def, s.max.value) : '–'} sub={s.max ? dayName(s.max.date, today) : undefined} />
          <Stat label="Days with data" value={`${s.count} of ${s.span}`} />
        </dl>

        {split && (
          <p className="hl-unwell-note">
            You logged <strong>{split.unwellDays}</strong> unwell days in this range. On those days {def.label.toLowerCase()} averaged <strong>{withUnit(def, split.unwellMean)}</strong>, versus{' '}
            <strong>{withUnit(def, split.otherMean)}</strong> on the other {split.otherDays}.
          </p>
        )}

        <section className="hl-about" aria-label={'About ' + def.label}>
          <h3>About this number</h3>
          <p>{def.about.what}</p>
          <p className="muted">{def.about.moves}</p>
          <p className="muted hl-fine">Hints from your own data, not medical advice.</p>
        </section>

        <details className="hl-table hl-modal-table">
          <summary>Show every value as a table</summary>
          <div className="hl-scroll hl-scroll-tall">
            <table>
              <thead>
                <tr>
                  <th scope="col">Day</th>
                  <th scope="col">{def.label}</th>
                  {sleep && (
                    <>
                      <th scope="col">Deep</th>
                      <th scope="col">REM</th>
                      <th scope="col">Light</th>
                      <th scope="col">Awake</th>
                    </>
                  )}
                  <th scope="col">Journal</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const d = days.find((x) => x.date === p.date);
                  const m = (v?: number) => (v === undefined ? '–' : fmtDuration(v));
                  return (
                    <tr key={p.date}>
                      <th scope="row">{fullDate(p.date)}</th>
                      <td>{withUnit(def, p.value)}</td>
                      {sleep && (
                        <>
                          <td>{m(d?.sleepDeepMin)}</td>
                          <td>{m(d?.sleepRemMin)}</td>
                          <td>{m(d?.sleepLightMin)}</td>
                          <td>{m(d?.sleepAwakeMin)}</td>
                        </>
                      )}
                      <td>{unwell.has(p.date) ? 'Felt unwell' : ''}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </details>
      </motion.div>
    </>
  );
}
