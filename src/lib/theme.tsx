'use client';

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';

export type AppTheme = 'dark' | 'light';

interface ThemeContextType {
  theme: AppTheme;
  toggleTheme: () => void;
  setTheme: (theme: AppTheme) => void;
  isDark: boolean;
}

const THEME_STORAGE_KEY = 'analyzer_theme';
const DEFAULT_THEME: AppTheme = 'dark';

const ThemeContext = createContext<ThemeContextType>({
  theme: DEFAULT_THEME,
  toggleTheme: () => {},
  setTheme: () => {},
  isDark: true,
});

export const ThemeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<AppTheme>(DEFAULT_THEME);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(THEME_STORAGE_KEY) as AppTheme | null;
      const initial = stored === 'light' || stored === 'dark' ? stored : DEFAULT_THEME;
      setThemeState(initial);
      document.documentElement.setAttribute('data-theme', initial);
    } catch {
      document.documentElement.setAttribute('data-theme', DEFAULT_THEME);
    }
    setMounted(true);
  }, []);

  const setTheme = (newTheme: AppTheme) => {
    setThemeState(newTheme);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, newTheme);
    } catch {}
    document.documentElement.setAttribute('data-theme', newTheme);
    window.dispatchEvent(new CustomEvent('analyzer_theme_changed', { detail: { theme: newTheme } }));
  };

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme, isDark: theme === 'dark' }}>
      {children}
    </ThemeContext.Provider>
  );
};

export function useTheme(): ThemeContextType {
  return useContext(ThemeContext);
}

