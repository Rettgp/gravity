import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../../components/Icon';

/** Bottom sheet on phones, side panel on desktop (the same look as the journal's day sheet). */
export function Sheet({ title, subtitle, onClose, children }: { title: string; subtitle?: string; onClose: () => void; children: ReactNode }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || document.querySelector('.cd-root')) return;
      e.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  return createPortal(
    <>
      <div className="jr-scrim" onClick={onClose} />
      <section className="jr-sheet ml-sheet" role="dialog" aria-modal="true" aria-label={title}>
        <header className="jr-sheet-head">
          <div>
            <h2>{title}</h2>
            {subtitle && <p className="jr-status muted">{subtitle}</p>}
          </div>
          <button ref={closeRef} className="btn btn-ghost btn-sm jr-icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="x" />
          </button>
        </header>
        {children}
      </section>
    </>,
    document.body,
  );
}
