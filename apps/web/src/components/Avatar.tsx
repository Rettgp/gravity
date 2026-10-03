import { useEffect, useState } from 'react';

interface Person {
  name: string;
  color: string;
  picture?: string;
}

/** Black or white, whichever reads better on the person's colour. */
const inkOn = (hex: string) => {
  const n = parseInt(hex.replace('#', ''), 16);
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.62 ? '#0e1a24' : '#ffffff';
};

/** A person's Google photo when they signed in with Google, otherwise the first letter of their name on their colour. */
export function Avatar({ person, size = 40 }: { person?: Person; size?: number }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [person?.picture]);
  const letter = (Array.from((person?.name ?? '').trim())[0] ?? '?').toUpperCase();
  const style = { width: size, height: size, fontSize: Math.round(size * 0.46), background: person?.color ?? 'var(--surface-2)', color: inkOn(person?.color ?? '#566677') };
  return (
    <span className="avatar" style={style} aria-hidden="true">
      {person?.picture && !broken ? <img src={person.picture} alt="" referrerPolicy="no-referrer" onError={() => setBroken(true)} /> : letter}
    </span>
  );
}
