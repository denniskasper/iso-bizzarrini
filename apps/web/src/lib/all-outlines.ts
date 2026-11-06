import { useCallback, useState } from 'react';

const STORAGE_KEY = 'ricambi.all-outlines';

/**
 * **Whether the drawing shows every Sub-assembly's outline** (issue #231), quietly, so a member
 * sees how a Tavola divides before choosing anything. On unless a member turned it off, and
 * remembered in this browser, because a crowded sheet is a reason to turn it off once and not on
 * every visit. Storage can be missing or refuse; the switch still works for the visit.
 */
export function useAllOutlines(): { on: boolean; set: (on: boolean) => void } {
  const [on, setOn] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem(STORAGE_KEY) !== 'off';
    } catch {
      return true;
    }
  });

  const set = useCallback((next: boolean) => {
    setOn(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? 'on' : 'off');
    } catch {
      // Not remembered, and nothing else lost.
    }
  }, []);

  return { on, set };
}
