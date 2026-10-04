import { useRef, type PointerEvent } from 'react';

/** Press and hold (touch, pen or mouse) to fire `onLong`. A normal tap still fires the element's own click. */
export function useLongPress(onLong: () => void, ms = 450) {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const start = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);
  const cancel = () => {
    clearTimeout(timer.current);
    start.current = null;
  };
  return {
    onPointerDown: (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      fired.current = false;
      start.current = { x: e.clientX, y: e.clientY };
      timer.current = setTimeout(() => {
        fired.current = true;
        navigator.vibrate?.(12);
        onLong();
      }, ms);
    },
    onPointerMove: (e: PointerEvent) => {
      const s = start.current;
      if (s && Math.hypot(e.clientX - s.x, e.clientY - s.y) > 10) cancel();
    },
    onPointerUp: cancel,
    onPointerLeave: cancel,
    onPointerCancel: cancel,
    // The long press owns the gesture: no browser context menu / text selection callout, and no click afterwards.
    onContextMenu: (e: { preventDefault: () => void }) => {
      e.preventDefault();
      if (!fired.current) {
        fired.current = true;
        onLong();
      }
    },
    /** Wrap the element's onClick so the click that follows a long press is ignored. */
    guard: (fn: () => void) => () => {
      if (fired.current) {
        fired.current = false;
        return;
      }
      fn();
    },
  };
}
