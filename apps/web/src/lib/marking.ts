import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';
import { api, type MarkPoint, type Position, type Sheet, type TavolaResponse } from '@/lib/api';
import {
  findMark,
  placedAt,
  pointOf,
  Spent,
  stillOn,
  undoStep,
  UNDO_DEPTH,
  type Step,
} from '@/lib/marking-undo';
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
  /**
   * Whether the print under one Mark can be read; the club types the number over it if not.
   * `settled` is told when the archive has answered, either way.
   */
  markLegibility: (markId: string, illegible: boolean, settled?: () => void) => void;
  removePosition: (positionId: string) => void;
  /**
   * **Picking several numbers to remove together** (issue #240): a run of stray clicks is one
   * confirmation, not three presses a number. While `selecting`, a press on a number in the strip
   * or on the drawing toggles it in `picked` instead of reading it.
   */
  selecting: boolean;
  setSelecting: (selecting: boolean) => void;
  /** The ids picked, in no particular order: the sheet says what order they are in. */
  picked: ReadonlySet<string>;
  /**
   * One number pressed, against the sheet as it is shown. `run` (a Shift+click) picks everything
   * from the number last pressed to this one, in the sheet's order.
   */
  pick: (position: Position, positions: Position[], how: { run: boolean }) => void;
  /**
   * Removes every picked number still on the sheet in one request, and stops selecting. One that
   * somebody else removed meanwhile is left out rather than refusing the rest.
   */
  removePicked: () => void;
  /**
   * Taking back the last thing this Editor did with the tool open, newest first (issue #236).
   * Removing a Position is not one of them: it asks first instead.
   */
  undo: () => void;
  canUndo: boolean;
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
   * What this Editor can take back, **on this Tavola**: the page stays mounted when it moves on to
   * another sheet, and a step from the last one would be undone on the wrong drawing.
   */
  const [history, setHistory] = useState<{ tavolaId: string; steps: Step[] }>({
    tavolaId,
    steps: [],
  });
  const steps = history.tavolaId === tavolaId ? history.steps : [];
  const setSteps = useCallback(
    (change: (steps: Step[]) => Step[]) =>
      setHistory((now) => ({
        tavolaId,
        steps: change(now.tavolaId === tavolaId ? now.steps : []),
      })),
    [tavolaId],
  );
  const remember = useCallback(
    (step: Step) => setSteps((done) => [...done, step].slice(-UNDO_DEPTH)),
    [setSteps],
  );
  /** Set the moment an undo is asked for, so a second press before the screen catches up waits. */
  const undoing = useRef(false);
  /** The sheet as this screen has it, which is what each step is worked out against. */
  const shown = useCallback(
    () => queryClient.getQueryData<TavolaResponse>(['tavola', tavolaId])?.positions ?? [],
    [queryClient, tavolaId],
  );

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
    mutationFn: async (point: MarkPoint) => {
      const before = shown();
      const sheet = await api.placeMark(tavolaId, { number, ...point });
      return { sheet, before, point, placing: number };
    },
    onSuccess: ({ sheet, before, point, placing }) => {
      onward(sheet);
      const placed = placedAt(sheet, placing, point);
      if (placed) {
        remember({
          kind: 'placed',
          markId: placed.mark.id,
          positionId: placed.position.id,
          number: placed.position.number,
          at: point,
          created: !before.some((position) => position.id === placed.position.id),
        });
      }
    },
  });
  const list = useMutation({
    mutationFn: async () => {
      const before = shown();
      return { sheet: await api.addPosition(tavolaId, { number }), before };
    },
    onSuccess: ({ sheet, before }) => {
      onward(sheet);
      // A number the sheet already had was not changed, so there is nothing to take back.
      const listed = sheet.positions.find(
        (position) => !before.some((known) => known.id === position.id),
      );
      if (listed) {
        remember({ kind: 'listed', positionId: listed.id, number: listed.number });
      }
    },
  });
  const moveMark = useMutation({
    mutationFn: async (moved: { markId: string; to: MarkPoint }) => {
      const was = findMark(shown(), moved.markId)?.mark;
      return { sheet: await api.moveMark(moved.markId, moved.to), was, moved };
    },
    onSuccess: ({ sheet, was, moved }) => {
      record(sheet);
      if (was) {
        remember({
          kind: 'moved',
          markId: moved.markId,
          from: pointOf(was),
          to: moved.to,
        });
      }
    },
  });
  const removeMark = useMutation({
    mutationFn: async (markId: string) => {
      const was = findMark(shown(), markId);
      return { sheet: await api.removeMark(markId), was };
    },
    onSuccess: ({ sheet, was }) => {
      record(sheet);
      if (was) {
        remember({
          kind: 'removed',
          positionId: was.position.id,
          number: was.position.number,
          at: pointOf(was.mark),
          illegible: was.mark.illegible,
        });
      }
    },
  });
  const markLegibility = useMutation({
    mutationFn: (marked: { markId: string; illegible: boolean }) =>
      api.markLegibility(marked.markId, { illegible: marked.illegible }),
    onSuccess: (sheet, marked) => {
      record(sheet);
      remember({ kind: 'legibility', ...marked });
    },
  });
  /**
   * After numbers are removed: the sheet, **and its index** — a Position removed does not take its
   * Listings with it; they stay on the Tavola with no number, which is a line the index beside the
   * drawing prints under a heading of its own, and leaving it stale would show them at a number
   * that is gone. And whether Visitors see it: removing the number open to them ends the Sample
   * (issue #130), which the sheet does not say, so an Administrator would read it as still shown.
   */
  const removed = (sheet: Sheet, positionIds: string[]) => {
    const current = queryClient.getQueryData<TavolaResponse>(['tavola', tavolaId]);
    record(sheet);
    void rereadListings();
    // What was done to the numbers before is gone with them, and can no longer be taken back.
    setSteps((done) => done.filter((step) => stillOn(step, sheet.positions)));
    const open = current?.tavola.sample?.open.positionId;
    if (open !== undefined && positionIds.includes(open)) {
      void queryClient.invalidateQueries({ queryKey: ['tavola', tavolaId] });
      void queryClient.invalidateQueries({ queryKey: ['samples'] });
    }
  };
  const removePosition = useMutation({
    mutationFn: (positionId: string) => api.removePosition(positionId),
    onSuccess: (sheet, positionId) => removed(sheet, [positionId]),
  });

  /**
   * The numbers picked, **on this Tavola**, and the last one pressed — which a Shift+click runs
   * from. Kept by the Tavola for the same reason the undo steps are.
   */
  const [picks, setPicks] = useState<{
    tavolaId: string;
    on: boolean;
    ids: ReadonlySet<string>;
    anchor: string | null;
  }>({ tavolaId, on: false, ids: new Set(), anchor: null });
  // Leaving the Tavola ends selecting there, so coming back does not find it switched on again.
  if (picks.tavolaId !== tavolaId && picks.on) {
    setPicks({ tavolaId, on: false, ids: new Set(), anchor: null });
  }
  const selecting = picks.tavolaId === tavolaId && picks.on;
  const picked: ReadonlySet<string> = selecting ? picks.ids : new Set();
  const setSelecting = useCallback(
    (on: boolean) => setPicks({ tavolaId, on, ids: new Set(), anchor: null }),
    [tavolaId],
  );
  const pick = useCallback(
    (position: Position, positions: Position[], how: { run: boolean }) =>
      setPicks((now) => {
        const ids = new Set(now.tavolaId === tavolaId ? now.ids : []);
        const from = positions.findIndex((one) => one.id === now.anchor);
        const to = positions.findIndex((one) => one.id === position.id);
        if (how.run && from !== -1 && to !== -1) {
          // A run is picked, whatever was picked inside it before: 23 to 36 is fourteen numbers.
          for (const one of positions.slice(Math.min(from, to), Math.max(from, to) + 1)) {
            ids.add(one.id);
          }
        } else if (ids.has(position.id)) {
          ids.delete(position.id);
        } else {
          ids.add(position.id);
        }
        return { tavolaId, on: true, ids, anchor: position.id };
      }),
    [tavolaId],
  );
  const removePositions = useMutation({
    mutationFn: (positionIds: string[]) => api.removePositions(tavolaId, { positionIds }),
    onSuccess: (sheet, positionIds) => {
      removed(sheet, positionIds);
      setSelecting(false);
    },
  });

  const undo = useMutation({
    mutationFn: (step: Step) => undoStep(tavolaId, step),
    onSuccess: (sheet, step) => {
      record(sheet);
      if (step.kind === 'placed' || step.kind === 'listed') {
        // Back on the number, ready to be placed again where it should have gone.
        setNumber(step.number);
        void rereadListings();
      }
    },
    onError: (error) => {
      // Done in part, or refused because somebody else changed the sheet: either way this screen
      // reads it again rather than going on showing what it last believed.
      if (error instanceof Spent) {
        void queryClient.invalidateQueries({ queryKey: ['tavola', tavolaId] });
      }
    },
    // A step that no longer applies is spent either way; one the network lost is kept to try again.
    onSettled: (_sheet, error, step) => {
      undoing.current = false;
      if (!error || error instanceof Spent) {
        setSteps((done) => done.filter((one) => one !== step));
      }
    },
  });

  const writes = [
    place,
    list,
    moveMark,
    removeMark,
    markLegibility,
    removePosition,
    removePositions,
    undo,
  ];
  const busy = writes.some((mutation) => mutation.isPending);
  /** What the last thing the Editor did was refused with, if it was: older refusals are history. */
  const latest = writes.reduce((last, mutation) =>
    mutation.submittedAt > last.submittedAt ? mutation : last,
  );

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
    // Done is the end of the sitting, and of what it can take back.
    stop: useCallback(() => {
      setOn(false);
      setSteps(() => []);
      setSelecting(false);
    }, [setSteps, setSelecting]),
    number,
    setNumber,
    held,
    setHeld,
    place: place.mutate,
    list: () => list.mutate(),
    moveMark: useCallback((markId, to) => move({ markId, to }).catch(() => undefined), [move]),
    removeMark: removeMark.mutate,
    markLegibility: (markId, illegible, settled) =>
      markLegibility.mutate({ markId, illegible }, { onSettled: settled }),
    removePosition: removePosition.mutate,
    selecting,
    setSelecting,
    picked,
    pick,
    removePicked: () => {
      const still = shown()
        .filter((position) => picked.has(position.id))
        .map((position) => position.id);
      if (still.length > 0) {
        removePositions.mutate(still);
      }
    },
    // Not while anything is in flight: the step it would take back may not be the last one yet.
    undo: () => {
      const last = steps.at(-1);
      if (last && !busy && !undoing.current) {
        undoing.current = true;
        undo.mutate(last);
      }
    },
    canUndo: steps.length > 0,
    busy,
    refusal: latest.error?.message ?? null,
  };
}
