/*
 * Decides the theme before first paint, so the archive never flashes the wrong one at someone
 * working in a dark garage.
 *
 * A separate file rather than an inline script on purpose: the API serves this app behind a
 * Content-Security-Policy of `script-src 'self'`, which blocks inline scripts outright. Inline,
 * this silently did nothing in production and every deployment ignored a member's stated
 * preference for light.
 *
 * Loaded without `type="module"` so it is render-blocking and runs before anything is painted.
 * This is the only place the choice is made; React reads the answer off the document.
 */
(function () {
  var STORAGE_KEY = 'ricambi.theme';
  try {
    var stored = localStorage.getItem(STORAGE_KEY);
    var explicit = stored === 'light' || stored === 'dark';
    var prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
    var theme = explicit ? stored : prefersLight ? 'light' : 'dark';
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.style.colorScheme = theme;
  } catch {
    /* No localStorage or matchMedia — the default dark class in the markup stands. */
  }
})();
