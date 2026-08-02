import { useCallback, useEffect, useState } from 'react';

export type Theme = 'dark' | 'light';

/** Must match the key the pre-paint script in `index.html` reads. */
const STORAGE_KEY = 'ricambi.theme';

/**
 * Which theme is already on screen.
 *
 * The choice itself — dark by default, a stated system preference for light beating that, an
 * explicit choice beating both — is made once by the inline script in `index.html`, because it
 * has to run before first paint or the archive flashes the wrong theme at someone in a dark
 * garage. React reads the answer off the document rather than deciding it a second time.
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
    // Only an explicit choice is remembered. Writing the system-derived default here would
    // freeze it, and someone whose phone switches to dark at dusk would never follow it.
    window.localStorage.setItem(STORAGE_KEY, next);
    setTheme(next);
  }, [theme]);

  return { theme, toggle };
}
