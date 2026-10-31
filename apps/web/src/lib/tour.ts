import { useCallback, useSyncExternalStore } from 'react';

/**
 * **Where somebody is in the guided tour**, kept in this browser and nowhere else.
 *
 * Temporary: the tour walks one tester through what is new on the practice system, and goes
 * once they have seen it. In the browser rather than on the Account because one of its parts is
 * the archive as a Visitor sees it, which means signed out — and a signed-out request is nobody
 * the server could remember a step for.
 */
export interface TourState {
  step: number;
  /** Folded down to one line, so the drawing underneath can be read. */
  folded: boolean;
}

const KEY = 'ricambi.tour';
const listeners = new Set<() => void>();

function read(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function write(state: TourState | null) {
  try {
    if (state === null) {
      window.localStorage.removeItem(KEY);
    } else {
      window.localStorage.setItem(KEY, JSON.stringify(state));
    }
  } catch {
    // A browser that keeps nothing simply has no tour.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener('storage', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
}

function parse(raw: string | null): TourState | null {
  if (raw === null) {
    return null;
  }
  try {
    const value = JSON.parse(raw) as Partial<TourState>;
    return typeof value.step === 'number'
      ? { step: value.step, folded: value.folded === true }
      : null;
  } catch {
    return null;
  }
}

export function useTour() {
  // The raw string is the snapshot, so an unchanged tour is the same value between renders.
  const raw = useSyncExternalStore(subscribe, read, () => null);
  const state = parse(raw);

  const start = useCallback(() => write({ step: 0, folded: false }), []);
  const end = useCallback(() => write(null), []);
  const goTo = useCallback((step: number) => write({ step, folded: false }), []);
  const fold = useCallback((folded: boolean) => {
    const current = parse(read());
    if (current) {
      write({ ...current, folded });
    }
  }, []);

  return { state, start, end, goTo, fold };
}
