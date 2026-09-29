import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { Icon } from './Icon';

interface Props {
  title: string;
  message: string;
  confirmLabel: string;
  /** Destructive actions get a red-outlined confirm button; the safe default focus stays on Cancel. */
  danger?: boolean;
  /** May be async. The dialog shows a busy state, and any thrown error is shown inside it. */
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

/** In-app replacement for window.confirm: themed, focus-trapped, Esc to cancel, rendered above any sheet. */
export function ConfirmDialog({ title, message, confirmLabel, danger, onConfirm, onCancel }: Props) {
  const titleId = useId();
  const descId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Capture phase + stopImmediatePropagation: Esc closes only this dialog, not the sheet behind it.
        e.stopImmediatePropagation();
        e.preventDefault();
        if (!busy) onCancel();
      } else if (e.key === 'Tab') {
        const first = cancelRef.current;
        const last = confirmRef.current;
        if (!first || !last) return;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      previous?.focus?.({ preventScroll: true });
    };
  }, [busy, onCancel]);

  const confirm = async () => {
    setBusy(true);
    setError('');
    try {
      await onConfirm();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
      setBusy(false);
    }
  };

  return createPortal(
    <div className="cd-root">
      <motion.div className="cd-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={() => !busy && onCancel()} />
      <motion.div
        className="cd glass"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      >
        <span className={'cd-icon' + (danger ? ' danger' : '')} aria-hidden="true">
          <Icon name={danger ? 'trash' : 'spark'} size={22} />
        </span>
        <h2 id={titleId}>{title}</h2>
        <p id={descId} className="muted">
          {message}
        </p>
        {error && (
          <p role="alert" className="jr-error cd-error">
            {error}
          </p>
        )}
        <div className="cd-actions">
          <button ref={cancelRef} className="btn btn-ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button ref={confirmRef} className={'btn ' + (danger ? 'btn-danger' : '')} onClick={() => void confirm()} disabled={busy} aria-busy={busy}>
            {busy ? 'Working...' : confirmLabel}
          </button>
        </div>
      </motion.div>
    </div>,
    document.body,
  );
}
