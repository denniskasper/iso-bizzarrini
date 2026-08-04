import { useCallback, useEffect, useState, type RefObject } from 'react';

/**
 * Filling the screen with one element, on every phone rather than only the ones with the API.
 *
 * Two mechanisms, deliberately: the element is told to fill the viewport by itself — which is
 * all iOS Safari will ever do, since it has no `requestFullscreen` for an element — and where
 * the real thing exists it is asked for as well, because a browser's own chrome is worth
 * another tenth of a small screen. The caller gets one boolean and does not have to know which
 * of the two it got.
 */
export function useFullScreen(element: RefObject<HTMLElement | null>): {
  expanded: boolean;
  toggle: () => void;
} {
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const target = element.current;
    if (!target) {
      return;
    }

    if (expanded) {
      void target.requestFullscreen?.().catch(() => {
        // Refused or unsupported: the element is already filling the viewport regardless.
      });
    } else if (document.fullscreenElement === target) {
      void document.exitFullscreen().catch(() => {});
    }
  }, [element, expanded]);

  // Leaving by the browser's own means — Escape out of native full screen, or the system UI.
  useEffect(() => {
    function onFullscreenChange() {
      if (!document.fullscreenElement) {
        setExpanded(false);
      }
    }

    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  useEffect(() => {
    if (!expanded) {
      return;
    }

    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setExpanded(false);
      }
    }

    // Escape, and nothing scrolling behind an element that is covering the page. Both are the
    // browser's job in native full screen and nobody's in the fallback, so they are done here.
    document.addEventListener('keydown', onKey);
    document.documentElement.classList.add('image-expanded');
    return () => {
      document.removeEventListener('keydown', onKey);
      document.documentElement.classList.remove('image-expanded');
    };
  }, [expanded]);

  return { expanded, toggle: useCallback(() => setExpanded((current) => !current), []) };
}
