import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { translations, Locale, TranslationKey, formatRelativeDate, formatNumber } from '@/lib/i18n';

interface LanguageContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey) => string;
  formatDate: (days: number) => string;
  formatNum: (num: number) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(() => {
    const saved = localStorage.getItem('aigor-locale');
    return (saved === 'en' ? 'en' : 'ru') as Locale;
  });

  const handleSetLocale = useCallback((newLocale: Locale) => {
    setLocale(newLocale);
    localStorage.setItem('aigor-locale', newLocale);
    document.documentElement.lang = newLocale === 'ru' ? 'ru-RU' : 'en-US';
  }, []);

  const t = useCallback((key: TranslationKey): string => {
    return translations[locale][key] || translations.en[key] || key;
  }, [locale]);

  const formatDate = useCallback((days: number): string => {
    return formatRelativeDate(days, locale);
  }, [locale]);

  const formatNum = useCallback((num: number): string => {
    return formatNumber(num, locale);
  }, [locale]);

  return (
    <LanguageContext.Provider value={{ locale, setLocale: handleSetLocale, t, formatDate, formatNum }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
