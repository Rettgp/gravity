import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import type { Glimmer } from '@gravity/shared';
import { Icon } from '../../components/Icon';
import { dayLabel } from '../../lib/dates';
import { useGlimmerImage } from './api';

/** Full-size glimmer, rendered above any sheet. Esc closes only the lightbox. */
export function GlimmerLightbox({ glimmer, who, onClose }: { glimmer: Glimmer; who?: string; onClose: () => void }) {
  const img = useGlimmerImage(glimmer.id, 'full', glimmer.hasImage);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return createPortal(
    <motion.div className="gl-lightbox" role="dialog" aria-modal="true" aria-label="Glimmer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={onClose}>
      <button ref={closeRef} className="btn btn-ghost btn-sm jr-icon-btn gl-lightbox-x" onClick={onClose} aria-label="Close glimmer">
        <Icon name="x" />
      </button>
      <figure onClick={(e) => e.stopPropagation()}>
        {glimmer.hasImage && (img.data ? <img src={img.data} alt={glimmer.caption ?? 'A glimmer'} /> : <div className="gl-lightbox-wait muted">{img.isError ? 'Could not load the photo.' : 'Loading...'}</div>)}
        <figcaption>
          {glimmer.caption && <p>{glimmer.caption}</p>}
          <small>{(who ? who + ' · ' : '') + dayLabel(glimmer.date)}</small>
        </figcaption>
      </figure>
    </motion.div>,
    document.body,
  );
}
