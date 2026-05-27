import { createContext, useContext, useMemo, useState } from 'react';
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, createTranslator, getStoredLocale, storeLocale } from './translations';

const LocaleContext = createContext({
  locale: DEFAULT_LOCALE,
  setLocale: () => {},
  t: (key, fallback) => fallback || key,
});

export function LocaleProvider({ children }) {
  const [locale, setLocaleState] = useState(getStoredLocale());

  const setLocale = (next) => {
    const normalized = SUPPORTED_LOCALES.includes(next) ? next : DEFAULT_LOCALE;
    setLocaleState(normalized);
    storeLocale(normalized);
  };

  const t = useMemo(() => createTranslator(locale), [locale]);
  const value = useMemo(() => ({ locale, setLocale, t }), [locale, t]);

  return (
    <LocaleContext.Provider value={value}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  return useContext(LocaleContext);
}
