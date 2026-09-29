import { useCallback, useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';
export type ThemeMode = Theme | 'system';
const KEY = 'gravity.theme';
const QUERY = '(prefers-color-scheme: dark)';

const systemTheme = (): Theme => (window.matchMedia(QUERY).matches ? 'dark' : 'light');
const storedMode = (): ThemeMode => {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
};

/** 'system' = no data-theme attribute, so the prefers-color-scheme rules in tokens.css apply (and follow the device live). */
function apply(mode: ThemeMode) {
  const root = document.documentElement;
  if (mode === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', mode);
  try {
    if (mode === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, mode);
  } catch {
    /* storage may be unavailable (private mode) */
  }
}

export function useTheme() {
  const [mode, setModeState] = useState<ThemeMode>(storedMode);
  const [system, setSystem] = useState<Theme>(systemTheme);

  // Track device setting changes so 'system' and the resolved theme stay live.
  useEffect(() => {
    const mq = window.matchMedia(QUERY);
    const on = () => setSystem(mq.matches ? 'dark' : 'light');
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  const setMode = useCallback((m: ThemeMode) => {
    apply(m);
    setModeState(m);
  }, []);

  const theme: Theme = mode === 'system' ? system : mode;
  /** Quick toggle (nav button): flips the currently visible theme to an explicit choice. */
  const toggle = useCallback(() => setMode(theme === 'dark' ? 'light' : 'dark'), [theme, setMode]);
  return { theme, mode, setMode, toggle };
}
