'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import english from '../desk-en.json';

const preferenceKey = '01player-operations-language';
const DeskLanguage = createContext(null);

export function DeskLanguageProvider({ children }) {
  const [language, setLanguage] = useState('zh');
  useEffect(() => {
    try {
      if (localStorage.getItem(preferenceKey) === 'en') setLanguage('en');
    } catch { /* The language can still be switched for the current visit. */ }
  }, []);
  useEffect(() => {
    document.documentElement.lang = language === 'en' ? 'en' : 'zh-Hans';
  }, [language]);

  const value = useMemo(() => ({
    language,
    t(message, values = []) {
      if (typeof message !== 'string') return message;
      const copy = language === 'en' && Object.hasOwn(english, message) ? english[message] : message;
      return copy.replace(/\{(\d+)\}/g, (token, index) => values[index] ?? token);
    },
    toggleLanguage() {
      const next = language === 'en' ? 'zh' : 'en';
      setLanguage(next);
      try { localStorage.setItem(preferenceKey, next); } catch {}
    },
  }), [language]);
  return <DeskLanguage.Provider value={value}>{children}</DeskLanguage.Provider>;
}

export const useDeskLanguage = () => useContext(DeskLanguage);

export function DeskText({ message }) {
  const { t } = useDeskLanguage();
  return t(message);
}
