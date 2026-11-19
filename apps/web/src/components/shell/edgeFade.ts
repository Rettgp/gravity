import { useEffect } from 'react';

/** Horizontal scrollers that get faded edges. Modules opt any other carousel in with `data-carousel`. */
export const CAROUSEL = '.segmented, .gl-strip, [data-carousel]';

/** Sets `data-fade-l` / `data-fade-r` on a scroller when content is hidden past that edge (CSS draws the fade). */
export function updateFade(el: HTMLElement) {
  const max = el.scrollWidth - el.clientWidth;
  const left = max > 1 && el.scrollLeft > 1;
  const right = max > 1 && el.scrollLeft < max - 1;
  el.toggleAttribute('data-fade-l', left);
  el.toggleAttribute('data-fade-r', right);
}

/**
 * One listener set for the whole app instead of a hook per carousel: scroll (captured, since scroll does not bubble),
 * resize, and DOM changes (route changes, items added) re-evaluate every carousel under `root`.
 */
export function useEdgeFade(root: () => HTMLElement | null) {
  useEffect(() => {
    const host = root();
    if (!host) return;
    let frame = 0;
    const all = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => host.querySelectorAll<HTMLElement>(CAROUSEL).forEach(updateFade));
    };
    const onScroll = (e: Event) => {
      const t = e.target;
      if (t instanceof HTMLElement && t.matches(CAROUSEL)) updateFade(t);
    };
    host.addEventListener('scroll', onScroll, { capture: true, passive: true });
    window.addEventListener('resize', all);
    const mo = new MutationObserver(all);
    mo.observe(host, { childList: true, subtree: true });
    all();
    return () => {
      cancelAnimationFrame(frame);
      host.removeEventListener('scroll', onScroll, { capture: true });
      window.removeEventListener('resize', all);
      mo.disconnect();
    };
  }, [root]);
}
