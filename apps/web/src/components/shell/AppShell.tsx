import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { useEdgeFade } from './edgeFade';
import { Sidebar } from './Sidebar';
import { SidebarSlot } from './slots';
import { TopBar } from './TopBar';

/** Fades each new page in (the planner's entrance), without remounting it, so data and typed text survive. A `?tab=` counts as a page. */
function usePageEntrance(main: () => HTMLElement | null) {
  const { pathname, search } = useLocation();
  const page = pathname + '|' + (new URLSearchParams(search).get('tab') ?? '');
  const first = useRef(true);
  useEffect(() => {
    if (first.current) return void (first.current = false);
    const el = main();
    // Modules with their own entrance (the planner keeps its header still) opt out with .route-fade.
    if (!el || el.querySelector('.route-fade') || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    el.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 300, easing: 'ease' });
  }, [page, main]);
}

/** Page backdrop (--field) plus chrome. Pages render as `children`; modules only declare `sections`.
 *  768px and up: the contextual sidebar is the only chrome. Phones: a slim top bar whose Menu button slides the same sidebar in. */
export function AppShell({ children }: { children: ReactNode }) {
  const shell = useRef<HTMLDivElement>(null);
  const main = useRef<HTMLElement>(null);
  useEdgeFade(useCallback(() => shell.current, []));
  usePageEntrance(useCallback(() => main.current, []));
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [menu, setMenu] = useState(false);
  const closeMenu = useCallback(() => setMenu(false), []);
  return (
    <div className={'app-shell' + (menu ? ' menu-open' : '')} ref={shell}>
      <SidebarSlot.Provider value={slot}>
        <Sidebar slotRef={setSlot} open={menu} onClose={closeMenu} />
        <div className="app-body">
          <TopBar menuOpen={menu} onMenu={() => setMenu(true)} />
          <main className="app-main" ref={main}>
            {children}
          </main>
        </div>
      </SidebarSlot.Provider>
    </div>
  );
}
