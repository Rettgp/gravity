import { createContext, useContext, useSyncExternalStore } from 'react';

/** A spot in the sidebar, under "All apps", where the current module can portal its own controls (the planner's year). */
export const SidebarSlot = createContext<HTMLElement | null>(null);
export const useSidebarSlot = () => useContext(SidebarSlot);

/** True when the sidebar is showing (768px and up); below that the phone layout takes over. */
const WIDE = '(min-width: 768px)';
export const useWide = () =>
  useSyncExternalStore(
    (l) => {
      const mq = window.matchMedia(WIDE);
      mq.addEventListener('change', l);
      return () => mq.removeEventListener('change', l);
    },
    () => window.matchMedia(WIDE).matches,
    () => true,
  );
