import { Link } from 'react-router-dom';
import { Menu, Moon, Sun } from 'lucide-react';
import { useTheme } from '../../lib/theme';
import { LogoMark } from '../Brand';
import { AccountMenu } from './AccountMenu';

/** Phones only (hidden from 768px). Menu slides in the sidebar: the apps, or the current app's pages. */
export function TopBar({ menuOpen, onMenu }: { menuOpen: boolean; onMenu: () => void }) {
  const { theme, toggle } = useTheme();
  return (
    <header className="topbar glass-card">
      <div className="topbar-start">
        <button className="icon-btn" onClick={onMenu} aria-label="Menu" aria-haspopup="dialog" aria-expanded={menuOpen}>
          <Menu size={22} aria-hidden="true" />
        </button>
        <Link to="/app" className="topbar-brand" aria-label="Gravity home">
          <LogoMark size={36} />
        </Link>
      </div>
      <div className="topbar-tools">
        <button className="icon-btn" onClick={toggle} aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
          {theme === 'dark' ? <Sun size={20} aria-hidden="true" /> : <Moon size={20} aria-hidden="true" />}
        </button>
        <AccountMenu />
      </div>
    </header>
  );
}
