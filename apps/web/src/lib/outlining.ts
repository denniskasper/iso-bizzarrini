import { useMutation } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { CORNERS_TO_CLOSE, closesTheOutline } from '@/components/viewer/outline-layer';
import { api, type MarkPoint } from '@/lib/api';
import { nearestOnSide } from '@/lib/outline-geometry';
import { useRecordSheet } from '@/lib/positions';

/**
 * **Drawing a Sub-assembly's outline** (issue #113): the marking tool's other mode, kept out of
 * the screen that draws it.
 *
 * A click on the drawing adds a corner. A click on the first corner, or Enter, closes the outline
 * and saves it — replacing whatever outline the Sub-assembly had, since it has at most one.
 * Backspace takes back the last corner (issue #115). Escape abandons it, and nothing is written
 * until it is closed: a half-drawn outline is not something the archive has an opinion about.
 *
 * **Reshaping one already drawn** (issue #115): its corners can be dragged, a click on a side adds
 * a corner there, and a selected corner can be taken off while more than three remain. Each change
 * is saved as it is made, the whole outline at once, as a moved Mark is — so there is nothing to
 * lose by leaving, and "Done" only puts the tool down.
 */
export interface OutlineTool {
  /** The Sub-assembly being drawn round or reshaped, while one is. */
  subAssemblyId: string | null;
  /** The corners so far, in the order they were placed — or of the outline being reshaped. */
  corners: MarkPoint[];
  drawing: boolean;
  reshaping: boolean;
  start: (subAssemblyId: string) => void;
  /** A tap on the drawing: a corner there, or the outline closed if it was on the first one. */
  add: (at: MarkPoint, on: Element | null) => void;
  /** Takes back the last corner placed. */
  undo: () => void;
  /** Closes and saves it, once it has enough corners to enclose anything. */
  close: () => void;
  abandon: () => void;
  remove: (subAssemblyId: string) => void;
  /** Picks up an outline already drawn, to move, add and take off its corners. */
  reshape: (subAssemblyId: string, corners: MarkPoint[]) => void;
  /** The corner chosen to be taken off, while reshaping. */
  selectedCorner: number | null;
  selectCorner: (index: number | null) => void;
  moveCorner: (index: number, to: MarkPoint) => void;
  /** A tap on the drawing while reshaping: a corner added if it was on a side. */
  tapWhileReshaping: (at: MarkPoint, on: Element | null) => void;
  /** Takes the selected corner off, unless that would leave fewer than three. */
  removeCorner: () => void;
  finish: () => void;
  busy: boolean;
  refusal: string | null;
}

/** What is said when the last corner but two is asked to go. */
export const TOO_FEW_CORNERS = `An outline keeps at least ${CORNERS_TO_CLOSE} corners.`;

interface Drawing {
  tavolaId: string;
  subAssemblyId: string;
  corners: MarkPoint[];
}

interface Reshaping extends Drawing {
  selected: number | null;
}

/** The side of an outline a press went down on, by the corner it starts at. */
function sideAt(on: Element | null): number | null {
  const side = on?.closest('[data-outline-side]')?.getAttribute('data-outline-side');
  return side == null ? null : Number(side);
}

export function useOutlineTool(tavolaId: string): OutlineTool {
  const record = useRecordSheet(tavolaId);
  const [held, setDrawing] = useState<Drawing | null>(null);
  const [heldShape, setShape] = useState<Reshaping | null>(null);
  const [refused, setRefused] = useState<string | null>(null);
  // This screen is not remounted between drawings, so an outline half drawn on one sheet is
  // simply not being drawn on the next.
  const drawing = held?.tavolaId === tavolaId ? held : null;
  const shape = heldShape?.tavolaId === tavolaId ? heldShape : null;

  const save = useMutation({
    mutationFn: (outline: Drawing) =>
      api.outlineSubAssembly(outline.subAssemblyId, { corners: outline.corners }),
    onSuccess: (sheet) => {
      record(sheet);
      setDrawing(null);
    },
  });
  const removal = useMutation({
    mutationFn: (subAssemblyId: string) => api.removeSubAssemblyOutline(subAssemblyId),
    onSuccess: record,
  });
  /**
   * One change to an outline being reshaped. It is shown at once, and put back the way it was
   * if the archive refuses it — which is the truth, as a Mark that could not be moved snaps back.
   */
  const reshaped = useMutation({
    mutationFn: ({ next }: { next: Reshaping; before: Reshaping }) =>
      api.outlineSubAssembly(next.subAssemblyId, { corners: next.corners }),
    onSuccess: record,
    onError: (_error, { before }) => setShape(before),
  });

  const change = useCallback(
    (next: Reshaping) => {
      if (!shape) {
        return;
      }
      setRefused(null);
      setShape(next);
      reshaped.mutate({ next, before: shape });
    },
    [shape, reshaped],
  );

  const close = useCallback(() => {
    if (drawing && drawing.corners.length >= CORNERS_TO_CLOSE && !save.isPending) {
      save.mutate(drawing);
    }
  }, [drawing, save]);

  const abandon = useCallback(() => {
    setDrawing(null);
    save.reset();
  }, [save]);

  const undo = useCallback(() => {
    if (drawing && !save.isPending) {
      setDrawing({ ...drawing, corners: drawing.corners.slice(0, -1) });
    }
  }, [drawing, save.isPending]);

  const removeCorner = useCallback(() => {
    if (!shape || shape.selected === null) {
      return;
    }
    if (shape.corners.length <= CORNERS_TO_CLOSE) {
      setRefused(TOO_FEW_CORNERS);
      return;
    }
    change({
      ...shape,
      corners: shape.corners.filter((_, index) => index !== shape.selected),
      selected: null,
    });
  }, [shape, change]);

  const finish = useCallback(() => {
    setShape(null);
    setRefused(null);
    reshaped.reset();
  }, [reshaped]);

  /**
   * The keys, wherever focus is on the page — except in a field or on a control, where Enter
   * already means that control and Backspace a letter.
   */
  useEffect(() => {
    if (!drawing && !shape) {
      return;
    }
    function onKey(event: KeyboardEvent) {
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest('input, textarea, select, button, a, [contenteditable="true"]')
      ) {
        return;
      }
      if (drawing) {
        if (event.key === 'Enter') {
          event.preventDefault();
          close();
        } else if (event.key === 'Escape') {
          event.preventDefault();
          abandon();
        } else if (event.key === 'Backspace') {
          event.preventDefault();
          undo();
        }
      } else if (event.key === 'Backspace' || event.key === 'Delete') {
        event.preventDefault();
        removeCorner();
      } else if (event.key === 'Escape' || event.key === 'Enter') {
        event.preventDefault();
        finish();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawing, shape, close, abandon, undo, removeCorner, finish]);

  return {
    subAssemblyId: drawing?.subAssemblyId ?? shape?.subAssemblyId ?? null,
    corners: drawing?.corners ?? shape?.corners ?? [],
    drawing: drawing !== null,
    reshaping: shape !== null,
    start: useCallback(
      (subAssemblyId: string) => {
        save.reset();
        removal.reset();
        setShape(null);
        setDrawing({ tavolaId, subAssemblyId, corners: [] });
      },
      [save, removal, tavolaId],
    ),
    add: (at, on) => {
      if (!drawing || save.isPending) {
        return;
      }
      if (closesTheOutline(on)) {
        close();
        return;
      }
      setDrawing({ ...drawing, corners: [...drawing.corners, at] });
    },
    undo,
    close,
    abandon,
    remove: (subAssemblyId) => removal.mutate(subAssemblyId),
    reshape: useCallback(
      (subAssemblyId: string, corners: MarkPoint[]) => {
        removal.reset();
        reshaped.reset();
        setRefused(null);
        setDrawing(null);
        setShape({ tavolaId, subAssemblyId, corners, selected: null });
      },
      [removal, reshaped, tavolaId],
    ),
    selectedCorner: shape?.selected ?? null,
    selectCorner: (index) => {
      if (shape) {
        setRefused(null);
        setShape({ ...shape, selected: index });
      }
    },
    moveCorner: (index, to) => {
      if (shape) {
        change({
          ...shape,
          corners: shape.corners.map((corner, at) => (at === index ? to : corner)),
          selected: index,
        });
      }
    },
    tapWhileReshaping: (at, on) => {
      if (!shape) {
        return;
      }
      const side = sideAt(on);
      const from = side === null ? undefined : shape.corners[side];
      const to = side === null ? undefined : shape.corners[(side + 1) % shape.corners.length];
      if (side === null || !from || !to) {
        setShape({ ...shape, selected: null });
        return;
      }
      const corners = [...shape.corners];
      corners.splice(side + 1, 0, nearestOnSide(at, from, to));
      change({ ...shape, corners, selected: side + 1 });
    },
    removeCorner,
    finish,
    busy: save.isPending || removal.isPending || reshaped.isPending,
    refusal: refused ?? (save.error ?? removal.error ?? reshaped.error)?.message ?? null,
  };
}
