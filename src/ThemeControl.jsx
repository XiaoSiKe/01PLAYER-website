import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useState } from 'react';

const STORAGE_KEY = '01ai-theme';
export const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#f4f4f2' : '#090909');
  }, [theme]);

  useEffect(() => {
    function syncPreference() {
      try {
        const value = window.localStorage.getItem(STORAGE_KEY);
        setTheme(value === 'light' ? 'light' : 'dark');
      } catch { /* Keep the current theme when storage is unavailable. */ }
    }
    function storageChanged(event) {
      if (event.key === STORAGE_KEY || event.key === null) syncPreference();
    }
    function pageShown(event) {
      if (event.persisted) syncPreference();
    }
    window.addEventListener('storage', storageChanged);
    window.addEventListener('pageshow', pageShown);
    return () => {
      window.removeEventListener('storage', storageChanged);
      window.removeEventListener('pageshow', pageShown);
    };
  }, []);

  const toggleTheme = useCallback(() => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    try { window.localStorage.setItem(STORAGE_KEY, next); } catch { /* The switch also works without storage access. */ }
  }, [theme]);

  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}

export function ThemeSwitch({ translate = text => text, renderButton }) {
  const { theme, toggleTheme } = useTheme();
  const label = translate(theme === 'dark' ? '切换到浅色背景' : '切换到深色背景');

  const icon = <svg key={theme} width="19.95" height="19.95" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {theme === 'dark' ? <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" /></> : <path d="M20.9 13.1A9 9 0 0 1 10.9 3.1 9 9 0 1 0 20.9 13.1Z" />}
  </svg>;

  return renderButton
    ? renderButton({ label, toggleTheme, icon })
    : <button className="theme-toggle" type="button" onClick={toggleTheme} aria-label={label} title={label}>{icon}</button>;
}
