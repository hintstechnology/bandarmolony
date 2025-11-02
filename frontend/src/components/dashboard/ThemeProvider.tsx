import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

type Theme = 'dark' | 'light' | 'system';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('dark');

  const applyDarkTheme = useCallback(() => {
    const nextTheme: Theme = 'dark';
    setThemeState(nextTheme);

    if (typeof document !== 'undefined') {
      document.documentElement.classList.remove('light');
      document.documentElement.classList.add('dark');
    }

    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('theme', nextTheme);
      } catch (error) {
        console.warn('Unable to persist theme preference', error);
      }
    }
  }, []);
  

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      const savedTheme = localStorage.getItem('theme') as Theme | null;
      if (savedTheme !== 'dark') {
        localStorage.setItem('theme', 'dark');
      }
    } catch (error) {
      console.warn('Unable to read persisted theme preference', error);
    }

    applyDarkTheme();
  }, [applyDarkTheme]);

  const toggleTheme = () => {
    applyDarkTheme();
  };

  const setTheme = (_theme: Theme) => {
    applyDarkTheme();
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
