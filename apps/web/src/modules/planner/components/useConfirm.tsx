import { useState, type ReactNode } from 'react';
import { ConfirmDialog } from '../../../components/ConfirmDialog';

type Ask = { title: string; message: string; confirmLabel: string; danger?: boolean; onConfirm: () => void | Promise<void> };

/** In-app replacement for window.confirm: `ask({...})` opens Gravity's ConfirmDialog; render `dialog` once in the component. */
export function useConfirm(): { ask: (a: Ask) => void; dialog: ReactNode } {
  const [req, setReq] = useState<Ask | null>(null);
  const dialog = req && (
    <ConfirmDialog
      {...req}
      onCancel={() => setReq(null)}
      onConfirm={async () => {
        await req.onConfirm();
        setReq(null);
      }}
    />
  );
  return { ask: setReq, dialog };
}
