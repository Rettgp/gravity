import type { ReactNode } from 'react';
import { useOccasion } from '../data/family';

/** Re-applies the planner theme to content portalled out of the module root (sheets, floating buttons). */
export function Themed({ children, className = '' }: { children: ReactNode; className?: string }) {
  const { birthday } = useOccasion();
  return (
    <div className={('planner ' + className).trim()} data-occasion={birthday ? 'birthday' : 'christmas'}>
      {children}
    </div>
  );
}
