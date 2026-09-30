import { useMemo, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { addDays, type HealthDay } from '@gravity/shared';
import { fmtDuration, fullDate, shortDate } from './metrics';
import { HOUR_STEPS, niceTicks } from './stats';
import { useWidth } from './useWidth';

const M = { left: 40, right: 12, top: 10, bottom: 26 };
const MAX_NIGHTS = 60;

/** Stack order, bottom to top. Each stage keeps its own colour slot everywhere (bars, legend, readout). */
const STAGES = [
  { key: 'sleepDeepMin', label: 'Deep', cls: 'hl-st-deep' },
  { key: 'sleepRemMin', label: 'REM', cls: 'hl-st-rem' },
  { key: 'sleepLightMin', label: 'Light', cls: 'hl-st-light' },
  { key: 'sleepAwakeMin', label: 'Awake', cls: 'hl-st-awake' },
] as const;

const barPath = (cx: number, w: number, top: number, base: number, round: boolean) => {
  const r = round ? Math.min(4, Math.max(0, base - top), w / 2) : 0;
  const l = cx - w / 2;
  const rt = cx + w / 2;
  return r ? `M${l},${base}V${top + r}Q${l},${top} ${l + r},${top}H${rt - r}Q${rt},${top} ${rt},${top + r}V${base}Z` : `M${l},${base}V${top}H${rt}V${base}Z`;
};

interface Props {
  days: HealthDay[];
  from: string;
  to: string;
}

/** Nights split into deep, REM, light and awake time. Only nights the watch recorded stages for. */
export function StagesChart({ days, from, to }: Props) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const height = width < 420 ? 200 : 240;
  // Show at most the last 60 nights so bars stay readable.
  const start = from > addDays(to, -(MAX_NIGHTS - 1)) ? from : addDays(to, -(MAX_NIGHTS - 1));
  const n = Math.round((Date.parse(to) - Date.parse(start)) / 86_400_000) + 1;
  const dates = useMemo(() => Array.from({ length: n }, (_, i) => addDays(start, i)), [start, n]);
  const byDate = useMemo(() => new Map(days.filter((d) => d.sleepDeepMin !== undefined && d.sleepLightMin !== undefined && d.sleepRemMin !== undefined).map((d) => [d.date, d])), [days]);
  const total = (d: HealthDay) => STAGES.reduce((a, s) => a + ((d[s.key] as number | undefined) ?? 0), 0);
  const [hover, setHover] = useState<number | null>(null);
  const [keyboard, setKeyboard] = useState(false);

  const plotW = width - M.left - M.right;
  const plotH = height - M.top - M.bottom;
  const slot = plotW / n;
  const maxTotal = Math.max(60, ...[...byDate.values()].map(total));
  const { ticks, max } = niceTicks(0, maxTotal / 60, 5, HOUR_STEPS);
  const y = (hours: number) => M.top + plotH - (hours / max) * plotH;
  const x = (i: number) => M.left + (i + 0.5) * slot;

  const latest = useMemo(() => {
    for (let i = n - 1; i >= 0; i--) if (byDate.has(dates[i]!)) return i;
    return -1;
  }, [byDate, dates, n]);
  const sel = hover ?? latest;
  const selDay = sel >= 0 ? byDate.get(dates[sel]!) : undefined;

  if (byDate.size === 0) {
    return <p className="jr-empty">No nights with sleep stages yet. The watch records stages when it is worn to bed.</p>;
  }

  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setHover(Math.max(0, Math.min(n - 1, Math.floor((e.clientX - r.left - M.left) / slot))));
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const at = hover ?? (latest >= 0 ? latest : n - 1);
    const next = e.key === 'ArrowLeft' ? at - 1 : e.key === 'ArrowRight' ? at + 1 : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : null;
    if (next === null) return;
    e.preventDefault();
    setKeyboard(true);
    setHover(Math.max(0, Math.min(n - 1, next)));
  };
  const bw = Math.max(2, Math.min(24, slot - 2));
  const labelCount = width < 420 ? 3 : 5;
  const labelIdx = [...new Set(Array.from({ length: labelCount }, (_, k) => Math.round((k * (n - 1)) / (labelCount - 1))))];

  return (
    <div className="hl-big" ref={ref}>
      <h3 className="hl-sub-h">Sleep stages</h3>
      <div className="hl-readout is-stages" role="status" aria-live={keyboard ? 'polite' : 'off'}>
        <span className="hl-readout-date muted">{fullDate(dates[Math.max(0, sel)]!)}</span>
        <div className="hl-readout-main">
          {selDay ? <strong>{fmtDuration(total(selDay) - (selDay.sleepAwakeMin ?? 0))} asleep</strong> : <strong className="hl-readout-none">No stage data</strong>}
        </div>
        <span className="hl-readout-detail muted">
          {selDay ? STAGES.map((s) => `${s.label} ${fmtDuration((selDay[s.key] as number | undefined) ?? 0)}`).join(' · ') : ''}
        </span>
      </div>
      <div
        className="hl-chart-wrap"
        tabIndex={0}
        role="group"
        aria-roledescription="chart"
        aria-label={`Sleep stages per night, ${shortDate(dates[0]!)} to ${shortDate(to)}. Use the left and right arrow keys to move between nights.`}
        onKeyDown={onKey}
        onBlur={() => {
          setHover(null);
          setKeyboard(false);
        }}
      >
        <svg width={width} height={height} onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)} aria-hidden="true">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={M.left} x2={width - M.right} y1={y(t)} y2={y(t)} className="hl-grid-line" />
              <text x={M.left - 8} y={y(t) + 4} textAnchor="end" className="hl-axis">
                {t}h
              </text>
            </g>
          ))}
          {labelIdx.map((i, k) => (
            <text key={i} x={x(i)} y={height - 6} textAnchor={k === 0 ? 'start' : k === labelIdx.length - 1 ? 'end' : 'middle'} className="hl-axis">
              {shortDate(dates[i]!)}
            </text>
          ))}
          {dates.map((d, i) => {
            const day = byDate.get(d);
            if (!day) return null;
            let acc = 0;
            const segs = STAGES.map((s) => {
              const mins = (day[s.key] as number | undefined) ?? 0;
              const seg = { s, from: acc, to: acc + mins };
              acc += mins;
              return seg;
            }).filter((g) => g.to > g.from);
            return (
              <g key={d} className={i === sel ? 'is-sel' : undefined}>
                {segs.map((g, k) => {
                  // A 2px surface gap between touching segments: trim 1px from each side of an inner boundary.
                  const top = y(g.to / 60) + (k < segs.length - 1 ? 1 : 0);
                  const bottom = y(g.from / 60) - (k > 0 ? 1 : 0);
                  return <path key={g.s.key} d={barPath(x(i), bw, top, Math.max(bottom, top + 1), k === segs.length - 1)} className={'hl-stage ' + g.s.cls} />;
                })}
              </g>
            );
          })}
          {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={M.top} y2={M.top + plotH} className="hl-cross" />}
        </svg>
      </div>
      <ul className="hl-key" aria-label="Sleep stage key">
        {[...STAGES].reverse().map((s) => (
          <li key={s.key}>
            <i className={'hl-key-swatch ' + s.cls} /> {s.label}
          </li>
        ))}
      </ul>
      {n === MAX_NIGHTS && <p className="muted hl-fine">Showing the last {MAX_NIGHTS} nights.</p>}
    </div>
  );
}
