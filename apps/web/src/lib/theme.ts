import { useCallback, useEffect, useState } from 'react';

export type Theme = 'dark' | 'light';

/** Must match the key the pre-paint script, `public/theme.js`, reads. */
const STORAGE_KEY = 'ricambi.theme';

/**
 * Which theme is already on screen.
 *
 * The choice itself — light by default, as on the Club website, and an explicit choice of dark
 * kept — is made once by `public/theme.js`, because it has to run before first paint or the
 * archive flashes the wrong theme at someone who chose dark for a dim garage. React reads the answer off the document rather than deciding it a second time.
 */
export function resolveInitialTheme(): Theme {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

export function useTheme(): { theme: Theme; toggle: () => void } {
  const [theme, setTheme] = useState<Theme>(resolveInitialTheme);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  const toggle = useCallback(() => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    // Remembered, so somebody who chose dark keeps it on every visit.
    window.localStorage.setItem(STORAGE_KEY, next);
    setTheme(next);
  }, [theme]);

  return { theme, toggle };
}
