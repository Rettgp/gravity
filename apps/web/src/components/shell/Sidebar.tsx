import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowLeft, ChevronRight, X } from 'lucide-react';
import { Wordmark } from '../Brand';
import { useQuery } from '@tanstack/react-query';
import type { TripMeta } from '@gravity/shared';
import { useFetcher } from '../../lib/api';
import { AccountMenu } from './AccountMenu';
import { FAMILY, NAV, activeItem, iconFor, isActive, matches, type NavItem } from './nav';

type SubItem = NonNullable<NavItem['sections']>[number];

/** Trips has no fixed sub-pages, so its list is every trip under a year header, newest year first (shares the trips module's cache key). */
// shortcut: lists every trip; cap to recent years if the history grows long enough to crowd the list.
function useTripSections(): SubItem[] {
  const f = useFetcher();
  const trips = useQuery({ queryKey: ['trips'], queryFn: () => f<TripMeta[]>('/api/trips'), staleTime: 60_000 });
  return [...(trips.data ?? [])]
    .sort((a, b) => b.startDate.slice(0, 4).localeCompare(a.startDate.slice(0, 4)) || a.startDate.localeCompare(b.startDate))
    .map((t) => ({ label: t.name, path: '/app/trips/' + encodeURIComponent(t.id), icon: 'pin', group: t.startDate.slice(0, 4) }));
}

/** Runs of items that share a `group`, in order. */
function groups(subs: SubItem[]) {
  const out: { group?: string; items: SubItem[] }[] = [];
  for (const s of subs) {
    const last = out[out.length - 1];
    if (last && last.group === s.group) last.items.push(s);
    else out.push({ group: s.group, items: [s] });
  }
  return out;
}

/**
 * Contextual sidebar (768px and up). It lists the apps; inside an app that has pages (Meals, Planner, Trips) it swaps to that
 * app's pages, with "All apps" to go back. Family and the account menu sit at the bottom.
 */
export function Sidebar({ slotRef, open = false, onClose }: { slotRef?: (el: HTMLElement | null) => void; open?: boolean; onClose?: () => void }) {
  const loc = useLocation();
  const current = activeItem(loc);
  const tripSections = useTripSections();
  const subsOf = (item?: NavItem): SubItem[] => (item?.id === 'trips' ? tripSections : item?.sections) ?? [];
  // "All apps" shows the app list without leaving the page; any navigation goes back to the context list.
  const [browsing, setBrowsing] = useState(false);
  useEffect(() => {
    setBrowsing(false);
    onClose?.(); // phones: picking a page closes the menu
  }, [loc.key, onClose]);
  // Phones: focus the drawer while open, close on Escape, and hand focus back to the Menu button.
  const closeBtn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const back = document.activeElement as HTMLElement | null;
    closeBtn.current?.focus();
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('keydown', esc);
      back?.focus();
    };
  }, [open, onClose]);
  const ctx = !browsing && current && subsOf(current).length > 0 ? current : undefined;

  return (
    <>
    {open && <div className="sb-scrim" onClick={onClose} />}
    <aside className={'sidebar glass-card' + (open ? ' is-open' : '')} aria-label="Sidebar">
      <div className="sb-brand">
        <Wordmark to="/app" />
        <button ref={closeBtn} type="button" className="icon-btn sb-close" aria-label="Close menu" onClick={onClose}>
          <X size={20} aria-hidden="true" />
        </button>
      </div>
      <div className="sb-scroll">
        {ctx ? (
          <>
            <button type="button" className="sb-link sb-back" onClick={() => setBrowsing(true)}>
              <ArrowLeft size={18} aria-hidden="true" />
              <span className="sb-text">All apps</span>
            </button>
            <div className="sb-app-head">
              <Link to={ctx.path} className="sb-app-title">
                <ctx.icon size={20} aria-hidden="true" />
                {ctx.label}
              </Link>
              <div ref={slotRef} className="sb-slot" />
            </div>
            <nav aria-label={ctx.label + ' pages'} className="sb-group sb-pages">
              {groups(subsOf(ctx)).map((g, i) => (
                <div key={(g.group ?? '') + i}>
                  {g.group && <p className="sb-subhead">{g.group}</p>}
                  <ul className="sb-subs" aria-label={g.group}>
                    {g.items.map((s) => {
                      const Icon = iconFor(s.icon);
                      return (
                        <li key={s.path}>
                          <Link to={s.path} className="sb-link" aria-current={matches(s.path, loc, ctx.id !== 'trips') ? 'page' : undefined}>
                            <Icon size={18} aria-hidden="true" />
                            <span className="sb-text">{s.label}</span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </nav>
          </>
        ) : (
          <nav aria-label="Primary" className="sb-group">
            {NAV.filter((i) => !i.soon && i.id !== FAMILY.id).map((item) => (
              <Link key={item.id} to={item.path} className="sb-link" aria-current={isActive(item, loc) ? 'page' : undefined}>
                <item.icon size={20} aria-hidden="true" />
                <span className="sb-text">{item.label}</span>
                {subsOf(item).length > 0 && <ChevronRight size={16} className="sb-more" aria-hidden="true" />}
              </Link>
            ))}
          </nav>
        )}
      </div>
      <div className="sb-foot">
        <Link to={FAMILY.path} className="sb-link" aria-current={isActive(FAMILY, loc) ? 'page' : undefined}>
          <FAMILY.icon size={20} aria-hidden="true" />
          <span className="sb-text">{FAMILY.label}</span>
        </Link>
        <AccountMenu wide />
      </div>
    </aside>
    </>
  );
}
