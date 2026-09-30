import { useMemo, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { addDays } from '@gravity/shared';
import { fullDate, shortDate, showDiff, withUnit, type MetricDef } from './metrics';
import { HOUR_STEPS, daySpan, niceTicks, type Point, type Usual } from './stats';
import { useWidth } from './useWidth';

const M = { left: 48, right: 12, top: 10, bottom: 26 };

interface Props {
  def: MetricDef;
  /** Points inside [from, to], oldest first. */
  points: Point[];
  from: string;
  to: string;
  usual?: Usual;
  /** Dates logged as unwell in the journal: drawn as coral bands behind the data. */
  unwell: Set<string>;
}

/** Bars with a 4px rounded data end and a square baseline. */
const barPath = (cx: number, w: number, top: number, base: number) => {
  const r = Math.min(4, Math.max(0, base - top), w / 2);
  const l = cx - w / 2;
  const rt = cx + w / 2;
  return `M${l},${base}V${top + r}Q${l},${top} ${l + r},${top}H${rt - r}Q${rt},${top} ${rt},${top + r}V${base}Z`;
};

export function BigChart({ def, points, from, to, usual, unwell }: Props) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const height = width < 420 ? 210 : 260;
  const n = daySpan(from, to);
  const dates = useMemo(() => Array.from({ length: n }, (_, i) => addDays(from, i)), [from, n]);
  const byDate = useMemo(() => new Map(points.map((p) => [p.date, p.value])), [points]);
  const plotW = width - M.left - M.right;
  const plotH = height - M.top - M.bottom;
  const slot = plotW / n;
  // Very long ranges would need 1px bars; a line reads better there.
  const bars = def.chart === 'bars' && n <= 93;

  const { ticks, min, max } = useMemo(() => {
    const vals = points.map((p) => p.value);
    let lo = vals.length ? Math.min(...vals) : 0;
    let hi = vals.length ? Math.max(...vals) : 1;
    if (usual) {
      lo = Math.min(lo, usual.mean - usual.sd);
      hi = Math.max(hi, usual.mean + usual.sd);
    }
    if (def.key === 'sleepMinutes') {
      // Time axes step in whole hours, not in round numbers of minutes.
      const t = niceTicks(0, hi / 60, 5, HOUR_STEPS);
      return { ticks: t.ticks.map((x) => x * 60), min: t.min * 60, max: t.max * 60 };
    }
    if (def.chart === 'bars') return niceTicks(0, hi);
    const pad = (hi - lo) * 0.1 || 1;
    return niceTicks(lo - pad, hi + pad);
  }, [points, usual, def.chart]);
  const y = (v: number) => M.top + plotH - ((v - min) / (max - min)) * plotH;
  const x = (i: number) => M.left + (i + 0.5) * slot;
  const base = y(Math.max(min, 0));

  const latestIdx = useMemo(() => {
    for (let i = n - 1; i >= 0; i--) if (byDate.has(dates[i]!)) return i;
    return -1;
  }, [byDate, dates, n]);
  const [hover, setHover] = useState<number | null>(null);
  const [keyboard, setKeyboard] = useState(false);
  const sel = hover ?? latestIdx;
  const selDate = sel >= 0 ? dates[sel]! : undefined;
  const selVal = selDate ? byDate.get(selDate) : undefined;

  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setHover(Math.max(0, Math.min(n - 1, Math.floor((e.clientX - r.left - M.left) / slot))));
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const at = hover ?? (latestIdx >= 0 ? latestIdx : n - 1);
    const next = e.key === 'ArrowLeft' ? at - 1 : e.key === 'ArrowRight' ? at + 1 : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : null;
    if (next === null) return;
    e.preventDefault();
    setKeyboard(true);
    setHover(Math.max(0, Math.min(n - 1, next)));
  };

  // Runs of consecutive days, so a missing day is a gap in the line rather than a false slope.
  const runs = useMemo(() => {
    const out: { i: number; v: number }[][] = [];
    dates.forEach((d, i) => {
      const v = byDate.get(d);
      if (v === undefined) return;
      const last = out[out.length - 1];
      if (last && last[last.length - 1]!.i === i - 1) last.push({ i, v });
      else out.push([{ i, v }]);
    });
    return out;
  }, [dates, byDate]);

  const labelCount = width < 420 ? 3 : 5;
  const labelIdx = [...new Set(Array.from({ length: labelCount }, (_, k) => Math.round((k * (n - 1)) / Math.max(1, labelCount - 1))))];
  const tickText = (t: number) => (def.key === 'sleepMinutes' ? `${Math.round(t / 60)}h` : def.key === 'steps' ? t.toLocaleString() : String(Math.round(t * 100) / 100));
  const unwellIdx = dates.map((d, i) => (unwell.has(d) ? i : -1)).filter((i) => i >= 0);
  // Merge consecutive unwell days into one band so a multi-day illness has no seams.
  const unwellRuns = unwellIdx.reduce<{ start: number; end: number }[]>((acc, i) => {
    const last = acc[acc.length - 1];
    if (last && last.end === i - 1) last.end = i;
    else acc.push({ start: i, end: i });
    return acc;
  }, []);

  const usualTop = usual ? Math.max(M.top, y(usual.mean + usual.sd)) : 0;
  const usualBottom = usual ? Math.min(M.top + plotH, y(usual.mean - usual.sd)) : 0;
  const diff = selVal !== undefined && usual ? selVal - usual.mean : undefined;
  const half = 10 ** -(def.digits ?? 0) / 2;

  return (
    <div className="hl-big" ref={ref}>
      <div className="hl-readout" role="status" aria-live={keyboard ? 'polite' : 'off'}>
        {selDate ? (
          <>
            <span className="muted">{fullDate(selDate)}</span>
            {selVal !== undefined ? <strong>{withUnit(def, selVal)}</strong> : <span className="muted">No data</span>}
            {diff !== undefined && (
              <span className="muted">{Math.abs(diff) < half ? 'about your usual' : `${showDiff(def, diff)} ${diff > 0 ? 'above' : 'below'} your usual`}</span>
            )}
            {unwell.has(selDate) && <span className="hl-chip-unwell">Felt unwell</span>}
          </>
        ) : (
          <span className="muted">No data in this range</span>
        )}
      </div>
      <div
        className="hl-chart-wrap"
        tabIndex={0}
        role="group"
        aria-roledescription="chart"
        aria-label={`${def.label}, ${shortDate(from)} to ${shortDate(to)}. Use the left and right arrow keys to move between days.`}
        onKeyDown={onKey}
        onBlur={() => {
          setHover(null);
          setKeyboard(false);
        }}
      >
        <svg width={width} height={height} onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)} aria-hidden="true">
          {unwellRuns.map((r) => (
            <rect key={r.start} x={M.left + r.start * slot} y={M.top} width={Math.max((r.end - r.start + 1) * slot, 2)} height={plotH} className="hl-band-unwell" />
          ))}
          {usual && <rect x={M.left} y={usualTop} width={plotW} height={Math.max(2, usualBottom - usualTop)} className="hl-band-usual" />}
          {ticks.map((t) => (
            <g key={t}>
              <line x1={M.left} x2={width - M.right} y1={y(t)} y2={y(t)} className="hl-grid-line" />
              <text x={M.left - 8} y={y(t) + 4} textAnchor="end" className="hl-axis">
                {tickText(t)}
              </text>
            </g>
          ))}
          {labelIdx.map((i, k) => (
            <text key={i} x={x(i)} y={height - 6} textAnchor={k === 0 && labelIdx.length > 1 ? 'start' : k === labelIdx.length - 1 && labelIdx.length > 1 ? 'end' : 'middle'} className="hl-axis">
              {shortDate(dates[i]!)}
            </text>
          ))}
          {bars
            ? dates.map((d, i) => {
                const v = byDate.get(d);
                if (v === undefined) return null;
                return <path key={d} d={barPath(x(i), Math.max(2, Math.min(24, slot - 2)), y(v), base)} className={'hl-big-bar' + (i === sel ? ' is-sel' : '')} />;
              })
            : runs.map((run, k) =>
                run.length === 1 ? (
                  <circle key={k} cx={x(run[0]!.i)} cy={y(run[0]!.v)} r={3} className="hl-big-dot" />
                ) : (
                  <polyline key={k} points={run.map((p) => `${x(p.i)},${y(p.v)}`).join(' ')} className="hl-big-line" />
                ),
              )}
          {usual && usualBottom - usualTop >= 20 && (
            // Drawn after the data so the line never strikes through it; the halo keeps it readable where it crosses.
            <text x={M.left + 6} y={usualTop + 13} className="hl-axis hl-band-label">
              Your usual
            </text>
          )}
          {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={M.top} y2={M.top + plotH} className="hl-cross" />}
          {!bars && selVal !== undefined && sel >= 0 && <circle cx={x(sel)} cy={y(selVal)} r={4} className="hl-pt" />}
        </svg>
      </div>
      <ul className="hl-key" aria-label="Chart key">
        <li>
          <i className={bars ? 'hl-key-bar' : 'hl-key-line'} /> {def.label}
        </li>
        {usual && (
          <li>
            <i className="hl-key-usual" /> Your usual range
          </li>
        )}
        {unwellIdx.length > 0 && (
          <li>
            <i className="hl-key-unwell" /> Felt unwell
          </li>
        )}
      </ul>
    </div>
  );
}
