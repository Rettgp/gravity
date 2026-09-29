import { NavLink } from 'react-router-dom';
import { motion } from 'motion/react';
import { useAuth } from '../lib/auth';
import { useTheme } from '../lib/theme';
import { Wordmark } from './Brand';
import { Icon, type IconName } from './Icon';

const LINKS: { to: string; label: string; icon: IconName; end?: boolean }[] = [
  { to: '/app', label: 'Home', icon: 'home', end: true },
  { to: '/app/journal', label: 'Journal', icon: 'book' },
  { to: '/app/profiles', label: 'Family', icon: 'users' },
];

/** One floating glass pill: top-center on desktop, a bottom tab bar on phones. */
export function AppNav() {
  const { theme, toggle } = useTheme();
  const { signOut, user } = useAuth();
  return (
    <header className="app-nav glass">
      <div className="app-nav-brand">
        <Wordmark to="/app" />
      </div>
      <nav aria-label="Primary" className="app-nav-links">
        {LINKS.map((l) => (
          <NavLink key={l.to} to={l.to} end={l.end} className="app-nav-link">
            {({ isActive }) => (
              <>
                {isActive && <motion.span layoutId="nav-active" className="app-nav-active" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
                <Icon name={l.icon} size={20} />
                <span>{l.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
      <div className="app-nav-tools">
        <button className="btn btn-ghost btn-sm jr-icon-btn" onClick={toggle} aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
          <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={18} />
        </button>
        <button className="btn btn-ghost btn-sm jr-icon-btn" onClick={() => void signOut()} aria-label={'Sign out ' + (user?.email ?? '')}>
          <Icon name="out" size={18} className="signout-icon" />
        </button>
      </div>
    </header>
  );
}
