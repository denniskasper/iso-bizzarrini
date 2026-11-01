/*
 * Settles what the document is before first paint: which theme it wears, and which environment
 * it belongs to. Both have to be decided here — the theme so the archive never flashes the
 * wrong one at someone working in a dark garage, the environment so a practice system is never
 * for an instant indistinguishable from the real archive.
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

  /*
   * Whatever serves this document declares the environment on the <html> element. If nothing
   * did — `vite dev`, or a static host that has not been taught to — it is not the archive.
   * The default is the safe direction: an unmarked system gets marked, never trusted.
   */
  if (!document.documentElement.dataset.environmentMode) {
    document.documentElement.dataset.environmentMode = 'non-production';
    // The server stamps the title as well as the element; when nothing stamped either, the tab
    // has to be marked here, or this is the one case where the page says DEMO and the tab does
    // not. Prefixed, because a tab truncates from the right.
    // Development, marked by `vite dev`, says so in the tab too.
    var development = document.documentElement.dataset.environmentSystem === 'development';
    document.title = (development ? 'DEV — ' : 'DEMO — ') + document.title;
  }

  /*
   * The icons follow the system, so a practice system saved to a home screen can never pass for
   * the archive (ADR 0020). The markup links Integration's tinted roundel; Production gets the
   * Club's emblem and the off-white roundel, Development the roundel in its own band's colour.
   * Decided here while Production and Integration share one build.
   */
  var mode = document.documentElement.dataset.environmentMode;
  var system = document.documentElement.dataset.environmentSystem;
  var icons =
    mode === 'production'
      ? '/'
      : '/practice/' + (system === 'development' ? 'development' : 'integration') + '/';
  document.querySelectorAll('link[data-icon]').forEach(function (link) {
    link.setAttribute('href', link.getAttribute('href').replace('/practice/integration/', icons));
  });

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
