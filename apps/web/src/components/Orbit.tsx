import type { CSSProperties } from 'react';
import { Icon, type IconName } from './Icon';
import { LogoMark } from './Brand';

interface Orb {
  icon: IconName;
  /** Orbit radius as a fraction of the stage (0-1). */
  k: number;
  /** Seconds per revolution. */
  d: number;
  /** Start angle in degrees. */
  a: number;
  /** Diameter in px. */
  s: number;
  tone: 'cyan' | 'blue' | 'violet';
}

const ORBS: Orb[] = [
  { icon: 'book', k: 0.46, d: 46, a: 20, s: 58, tone: 'blue' },
  { icon: 'fork', k: 0.46, d: 46, a: 140, s: 46, tone: 'cyan' },
  { icon: 'thermo', k: 0.46, d: 46, a: 260, s: 52, tone: 'violet' },
  { icon: 'calendar', k: 0.68, d: 64, a: 70, s: 50, tone: 'violet' },
  { icon: 'heart', k: 0.68, d: 64, a: 190, s: 44, tone: 'cyan' },
  { icon: 'chart', k: 0.68, d: 64, a: 310, s: 54, tone: 'blue' },
  { icon: 'bowl', k: 0.92, d: 88, a: 0, s: 40, tone: 'blue' },
  { icon: 'pill', k: 0.92, d: 88, a: 120, s: 46, tone: 'cyan' },
  { icon: 'spark', k: 0.92, d: 88, a: 240, s: 38, tone: 'violet' },
];

/** The gravity motif: glass orbs circling the logo. Pure CSS animation, no canvas. */
export function Orbit() {
  return (
    <div className="orbit" aria-hidden="true">
      {[0.46, 0.68, 0.92].map((k) => (
        <span key={k} className="orbit-ring" style={{ '--k': k } as CSSProperties} />
      ))}
      <div className="orbit-core">
        <span className="orbit-pulse" />
        <LogoMark size={190} priority />
      </div>
      {ORBS.map((o, i) => (
        <div key={i} className="orb-wrap" style={{ '--d': o.d + 's', '--a': o.a } as CSSProperties}>
          <div className={'orb orb-' + o.tone} style={{ '--k': o.k, '--s': o.s + 'px' } as CSSProperties}>
            <Icon name={o.icon} size={Math.round(o.s * 0.42)} />
          </div>
        </div>
      ))}
    </div>
  );
}
