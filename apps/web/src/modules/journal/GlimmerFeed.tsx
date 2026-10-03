import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { addDays, type Glimmer, type ProfileSummary } from '@gravity/shared';
import { Icon } from '../../components/Icon';
import { localToday } from '../../lib/dates';
import { useJournalApi } from './api';
import { GlimmerLightbox } from './GlimmerLightbox';
import { GlimmerPicture } from './GlimmerThumb';

const SEEN_KEY = 'gravity.glimmers.seen';
const readSeen = () => {
  try {
    return localStorage.getItem(SEEN_KEY) ?? '';
  } catch {
    return '';
  }
};

const whenLabel = (date: string, today: string) =>
  date === today ? 'Today' : date === addDays(today, -1) ? 'Yesterday' : new Date(date + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });

/** The family's recent glimmers, front and centre on the dashboard. */
export function GlimmerFeed({ family }: { family: ProfileSummary[] }) {
  const api = useJournalApi();
  const q = useQuery({ queryKey: ['glimmers', 'feed'], queryFn: () => api.glimmerFeed() });
  const names = useMemo(() => new Map(family.map((p) => [p.id, p])), [family]);
  const today = localToday();
  const [open, setOpen] = useState<Glimmer | null>(null);
  // "New" is relative to the previous visit; captured once so badges do not vanish mid-visit.
  const seen = useRef(readSeen());
  const items = q.data ?? [];
  const newest = items.reduce((m, g) => (g.createdAt > m ? g.createdAt : m), '');

  useEffect(() => {
    if (!newest) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(SEEN_KEY, newest);
      } catch {
        /* private mode: badges just show again next time */
      }
    }, 4000);
    return () => clearTimeout(t);
  }, [newest]);

  return (
    <section className="card gl-card" aria-label="Glimmers">
      <span className="gl-sparkles" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
      </span>
      <header className="gl-head">
        <div>
          <h2>
            <Icon name="spark" size={20} /> Glimmers
          </h2>
          <p className="muted">Little things that brightened the family's days.</p>
        </div>
        <Link className="btn btn-sm" to={'/app/journal?date=' + today + '&glimmer=1'}>
          <Icon name="plus" size={16} /> Add a glimmer
        </Link>
      </header>
      {q.isError && <p className="jr-error">Could not load glimmers.</p>}
      {q.data && items.length === 0 && <p className="gl-empty">What made you smile today? Add the first glimmer.</p>}
      {items.length > 0 && (
        <ul className="gl-strip">
          {items.map((g, i) => {
            const p = names.get(g.profileId);
            const isNew = !!seen.current && g.createdAt > seen.current;
            return (
              <motion.li key={g.id} className="gl-slide" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 6) * 0.07, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}>
                <button className="gl-tile" onClick={() => setOpen(g)} aria-label={`${p?.name ?? 'Family'}, ${whenLabel(g.date, today)}${g.caption ? ': ' + g.caption : ''}`}>
                  <GlimmerPicture glimmer={g} />
                  {isNew && <span className="gl-new">New</span>}
                  <span className="gl-scrim">
                    {g.caption && <span className="gl-text">{g.caption}</span>}
                    <span className="gl-by">
                      <span className="avatar gl-avatar" style={{ background: p?.color }} aria-hidden="true">
                        {p?.emoji}
                      </span>
                      <span>
                        {p?.name ?? 'Family'} · {whenLabel(g.date, today)}
                      </span>
                    </span>
                  </span>
                </button>
              </motion.li>
            );
          })}
        </ul>
      )}
      {open && <GlimmerLightbox glimmer={open} who={names.get(open.profileId)?.name} onClose={() => setOpen(null)} />}
    </section>
  );
}
