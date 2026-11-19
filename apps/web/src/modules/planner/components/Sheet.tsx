import type { ReactNode } from 'react';
import { Sheet as GravitySheet } from '../../../components/Sheet';
import { Themed } from './Themed';

type Props = { open: boolean; onClose: () => void; title: string; subtitle?: string; children: ReactNode; footer?: ReactNode; wide?: boolean };

/** The planner's sheet API (open, footer, wide) over Gravity's shared sheet. Sheets render in a portal, so re-apply the planner theme inside. */
export function Sheet({ open, onClose, title, subtitle, children, footer, wide }: Props) {
  if (!open) return null;
  return (
    <GravitySheet title={title} subtitle={subtitle} onClose={onClose}>
      <Themed className={'sheet-inner' + (wide ? ' wide' : '')}>
        {children}
        {footer && <footer className="sheet-foot">{footer}</footer>}
      </Themed>
    </GravitySheet>
  );
}
