import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LogOut, MessageSquarePlus, Monitor, Moon, Sun, Users } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { useMe } from '../../lib/me';
import { useTheme, type ThemeMode } from '../../lib/theme';
import { Avatar } from '../Avatar';

const THEME_CHOICES: { mode: ThemeMode; label: string; icon: typeof Sun }[] = [
  { mode: 'light', label: 'Light', icon: Sun },
  { mode: 'dark', label: 'Dark', icon: Moon },
  { mode: 'system', label: 'System', icon: Monitor },
];

/** Avatar button with theme, Family, Feedback and Sign out. `wide` shows the name too (sidebar footer; the menu opens upward). */
export function AccountMenu({ wide = false }: { wide?: boolean }) {
  const loc = useLocation();
  const { mode, setMode } = useTheme();
  const { signOut, user } = useAuth();
  const me = useMe().data;
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const self = me?.family.find((p) => p.id === me.defaultProfileId) ?? me?.family[0];

  useEffect(() => setOpen(false), [loc.pathname]);
  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  return (
    <div className={'menu-wrap' + (wide ? ' menu-up' : '')} ref={wrap}>
      <button className={wide ? 'sb-link sb-account' : 'icon-btn'} aria-label="Account menu" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Avatar person={self} size={wide ? 28 : 32} />
        {wide && <span className="sb-text">{self?.name ?? user?.email}</span>}
      </button>
      {open && (
        <div className="menu" role="menu" aria-label="Account">
          <p className="menu-label">{user?.email}</p>
          {THEME_CHOICES.map((c) => (
            <button
              key={c.mode}
              role="menuitemradio"
              aria-checked={mode === c.mode}
              className="menu-item"
              onClick={() => {
                setMode(c.mode);
                setOpen(false);
              }}
            >
              <c.icon size={18} aria-hidden="true" /> {c.label}
            </button>
          ))}
          <div className="menu-sep" />
          <Link to="/app/profiles" role="menuitem" className="menu-item">
            <Users size={18} aria-hidden="true" /> Family
          </Link>
          <Link to="/app/feedback" role="menuitem" className="menu-item">
            <MessageSquarePlus size={18} aria-hidden="true" /> Feedback
          </Link>
          <button role="menuitem" className="menu-item" onClick={() => void signOut()}>
            <LogOut size={18} className="signout-icon" aria-hidden="true" /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}
