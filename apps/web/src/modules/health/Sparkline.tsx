import { useState, type PointerEvent } from 'react';

interface Props {
  /** Oldest -> newest, one entry per day; undefined = no data that day (drawn as a gap, never as zero). */
  values: (number | undefined)[];
  /** Screen-reader summary of the whole line. */
  label: string;
  /** Called with the hovered day index, or null when the pointer leaves. */
  onHover?: (index: number | null) => void;
}

const W = 200;
const H = 52;
const PAD = 6;

/** One thin line in the brand accent: gaps stay gaps, the newest point wears a surface ring, hover shows a crosshair. */
export function Sparkline({ values, label, onHover }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const have = values.filter((v): v is number => v !== undefined);
  if (have.length === 0) return <div className="hl-spark hl-spark-empty" aria-hidden="true" />;
  let lo = Math.min(...have);
  let hi = Math.max(...have);
  if (hi === lo) {
    lo -= 1;
    hi += 1;
  }
  const n = Math.max(1, values.length - 1);
  const x = (i: number) => PAD + (i / n) * (W - PAD * 2);
  const y = (v: number) => H - PAD - ((v - lo) / (hi - lo)) * (H - PAD * 2);

  // Split into runs of consecutive days so a missing day breaks the line.
  const runs: { i: number; v: number }[][] = [];
  values.forEach((v, i) => {
    if (v === undefined) return;
    const last = runs[runs.length - 1];
    if (last && last[last.length - 1]!.i === i - 1) last.push({ i, v });
    else runs.push([{ i, v }]);
  });
  const lastIdx = values.length - 1 - [...values].reverse().findIndex((v) => v !== undefined);

  const move = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    // Pointer position -> viewBox x -> nearest day.
    const vx = ((e.clientX - r.left) / r.width) * W;
    const i = Math.max(0, Math.min(values.length - 1, Math.round(((vx - PAD) / (W - PAD * 2)) * n)));
    setHover(i);
    onHover?.(i);
  };
  const leave = () => {
    setHover(null);
    onHover?.(null);
  };
  const hv = hover !== null ? values[hover] : undefined;

  return (
    <svg className="hl-spark" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} onPointerMove={move} onPointerLeave={leave} onPointerCancel={leave}>
      {runs.map((run, k) =>
        run.length === 1 ? (
          <circle key={k} cx={x(run[0]!.i)} cy={y(run[0]!.v)} r={2.5} className="hl-spark-dot" />
        ) : (
          <polyline key={k} points={run.map((p) => `${x(p.i)},${y(p.v)}`).join(' ')} className="hl-spark-line" />
        ),
      )}
      {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={PAD / 2} y2={H - PAD / 2} className="hl-spark-cross" />}
      {hover !== null && hv !== undefined && <circle cx={x(hover)} cy={y(hv)} r={4} className="hl-spark-point" />}
      {hover === null && <circle cx={x(lastIdx)} cy={y(values[lastIdx]!)} r={4} className="hl-spark-point" />}
    </svg>
  );
}
