import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { api, type MarkPoint, type Sheet, type TavolaResponse } from '@/lib/api';
import { useRereadListings } from '@/lib/parts';
import { useRecordSheet } from '@/lib/positions';

/**
 * The marking tool's state, kept out of the screen that draws it.
 *
 * **This tool's speed is the project's critical path.** A Tavola can carry over two hundred
 * Positions, there are hundreds of Tavole, and every one of them is somebody's evening. So the
 * arrangement here is arithmetic about clicks: the number to place is always already in the
 * field, placing it is one request, and the field has advanced by the time the Editor's hand
 * gets back to the drawing. Nothing asks a question, and nothing opens.
 */

/**
 * What the field says next, after a number has been placed.
 *
 * The leading digits, one higher, **without whatever followed them** — `12` becomes `13`,
 * `210 S` becomes `211`, `12 bis` becomes `13`. Dropping the suffix is the deliberate half:
 * the factory's suffixes mark a pair rather than a run (`210 S` is the left one, `211 D` the
 * right), so carrying one forward would be wrong far more often than right, and a guess an
 * Editor has to keep undoing is worse than no guess. A number with no digits at all — should
 * the archive ever meet one — simply stays put, and the Editor types.
 */
export function nextNumberAfter(number: string): string {
  const digits = /^\s*(\d{1,9})/.exec(number);
  return digits?.[1] === undefined ? number : String(Number(digits[1]) + 1);
}

export interface MarkingTool {
  /** Whether the drawing is a tool at the moment, or a drawing. */
  on: boolean;
  /**
   * Opening the tool, from the last number already on the sheet.
   *
   * A Tavola is rarely marked in one sitting — two hundred circles is several evenings — so
   * picking up at the number after the last one recorded is what an Editor coming back to a
   * half-marked drawing actually wants. On a sheet nobody has touched that is `1`.
   */
  start: (resumeAfter?: string | undefined) => void;
  stop: () => void;
  /** What the next click on the sheet will place. */
  number: string;
  setNumber: (number: string) => void;
  /**
   * Whether the number stays put instead of advancing.
   *
   * **The one-click promise, kept for the number the factory printed four times.** Without it
   * the second circle of a run costs a click *and* re-typing what was just placed — so the very
   * case this archive most needs marked properly would be the only one that is not one click.
   */
  held: boolean;
  setHeld: (held: boolean) => void;
  /** One click on the drawing. */
  place: (at: MarkPoint) => void;
  /** The same number, recorded without a circle: listed but not drawn. */
  list: () => void;
  /** Answers when the archive has it, so a circle can stay under the thumb until then. */
  moveMark: (markId: string, to: MarkPoint) => Promise<unknown>;
  removeMark: (markId: string) => void;
  removePosition: (positionId: string) => void;
  busy: boolean;
  refusal: string | null;
}

export function useMarkingTool(tavolaId: string): MarkingTool {
  const queryClient = useQueryClient();
  const rereadListings = useRereadListings(tavolaId);
  const [on, setOn] = useState(false);
  const [number, setNumber] = useState('1');
  const [held, setHeld] = useState(false);

  /** Every write answers with the sheet, and the sheet goes straight into the cache. */
  const record = useRecordSheet(tavolaId);

  /**
   * Placing and listing both consume the number in the field — and only once the archive has
   * it, so that a refused click does not quietly move an Editor's place in the catalog on.
   */
  const onward = useCallback(
    (sheet: Sheet) => {
      record(sheet);
      setNumber((current) => (held ? current : nextNumberAfter(current)));
    },
    [held, record],
  );

  const place = useMutation({
    mutationFn: (at: MarkPoint) => api.placeMark(tavolaId, { number, ...at }),
    onSuccess: onward,
  });
  const list = useMutation({
    mutationFn: () => api.addPosition(tavolaId, { number }),
    onSuccess: onward,
  });
  const moveMark = useMutation({
    mutationFn: (moved: { markId: string; to: MarkPoint }) => api.moveMark(moved.markId, moved.to),
    onSuccess: record,
  });
  const removeMark = useMutation({
    mutationFn: (markId: string) => api.removeMark(markId),
    onSuccess: record,
  });
  const removePosition = useMutation({
    mutationFn: (positionId: string) => api.removePosition(positionId),
    // The sheet, **and its index**: a Position removed does not take its Listings with it — they
    // stay on the Tavola with no number, which is a line the index beside the drawing prints
    // under a heading of its own. Leaving it stale would show them at a number that is gone.
    // And whether Visitors see it: removing the number open to them ends the Sample (issue #130),
    // which the sheet does not say, so an Administrator would read it as still shown.
    onSuccess: (sheet, positionId) => {
      const current = queryClient.getQueryData<TavolaResponse>(['tavola', tavolaId]);
      record(sheet);
      void rereadListings();
      if (current?.tavola.sample?.open.positionId === positionId) {
        void queryClient.invalidateQueries({ queryKey: ['tavola', tavolaId] });
        void queryClient.invalidateQueries({ queryKey: ['samples'] });
      }
    },
  });

  const writes = [place, list, moveMark, removeMark, removePosition];

  /**
   * `mutate` and not `mutateAsync` everywhere but one: nothing here can *answer* for a refusal
   * — the callers are pointer handlers — and the refusal is already on the screen below. Only
   * moving a Mark needs to know when the archive has it, so that the circle can stay under the
   * thumb that dropped it rather than snapping back and moving again.
   */
  const move = moveMark.mutateAsync;

  return {
    on,
    start: useCallback((resumeAfter?: string) => {
      setOn(true);
      if (resumeAfter !== undefined) {
        setNumber(nextNumberAfter(resumeAfter));
      }
    }, []),
    stop: useCallback(() => setOn(false), []),
    number,
    setNumber,
    held,
    setHeld,
    place: place.mutate,
    list: () => list.mutate(),
    moveMark: useCallback((markId, to) => move({ markId, to }).catch(() => undefined), [move]),
    removeMark: removeMark.mutate,
    removePosition: removePosition.mutate,
    busy: writes.some((mutation) => mutation.isPending),
    refusal: writes.find((mutation) => mutation.error)?.error?.message ?? null,
  };
}
