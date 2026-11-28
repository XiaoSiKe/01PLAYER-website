'use client';
import horizontalLogo from '../../../public/images/club-logo-horizontal-white.svg';
import Link from 'next/link';
import React, { useCallback, useEffect, useRef } from 'react';
import { useTheme as useAdminTheme } from '@payloadcms/ui';
import { ThemeContext, ThemeSwitch } from '../../../src/ThemeControl';
import { DeskLanguageProvider, useDeskLanguage } from './DeskLanguage';
import '../app/(payload)/official-controls.scss';

const storageKey = '01ai-theme';
const isTheme = (value) => value === 'light' || value === 'dark';

export function OfficialTheme({ children }) {
  const { theme, setTheme } = useAdminTheme();
  const requestedTheme = useRef(null);
  const latestTheme = useRef(theme);
  latestTheme.current = theme;
  useEffect(() => {
    function syncFromWebsite() {
      let saved;
      try {
        saved = localStorage.getItem(storageKey);
      } catch {}
      const cookie = document.cookie
        .split('; ')
        .find((value) => value.startsWith('payload-theme='))
        ?.split('=')[1];
      const choice = isTheme(saved) ? saved : isTheme(cookie) ? cookie : 'dark';
      if (latestTheme.current !== choice) {
        requestedTheme.current = choice;
        setTheme(choice);
      }
    }
    syncFromWebsite();
    const onStorage = (event) => {
      if (event.key === storageKey || event.key === null) syncFromWebsite();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [setTheme]);
  useEffect(() => {
    if (requestedTheme.current && requestedTheme.current !== theme) return;
    requestedTheme.current = null;
    try {
      localStorage.setItem(storageKey, theme);
    } catch {}
  }, [theme]);
  const toggleTheme = useCallback(
    () => setTheme(theme === 'dark' ? 'light' : 'dark'),
    [theme, setTheme],
  );
  return <ThemeContext.Provider value={{ theme, toggleTheme }}><DeskLanguageProvider>{children}</DeskLanguageProvider></ThemeContext.Provider>;
}

export function Action({ children, size = 'sm', href, disabled, type = 'button', className = '', ...props }) {
  const navigable = Boolean(href) && !disabled;
  const clientNavigation = navigable && href.startsWith('/admin');
  const Element = clientNavigation ? Link : navigable ? 'a' : 'button';
  return (
    <Element {...props}
      {...(navigable ? { href } : { type: href ? 'button' : type, disabled })}
      {...(clientNavigation ? { prefetch: false } : {})}
      className={`specular-button specular-button--${size} op-action${className ? ' ' + className : ''}`}>
      <span className="specular-button__label">{children}</span>
    </Element>
  );
}
export function ClubBrand() {
  return (
    <img className="op-official-logo" src={horizontalLogo.src} alt="零一玩家" width="1602" height="560" />
  );
}
export function DeskTitle({ title, id, heading: Heading = 'h1', children }) {
  const { t } = useDeskLanguage();
  return (
    <header className="op-head">
      <Heading id={id}>{t(title)}</Heading>
      {children}
    </header>
  );
}
export function DeskBack(props) {
  const { t } = useDeskLanguage();
  return <Action {...props} className="op-back">{t('返回')}</Action>;
}
export { ThemeSwitch };
