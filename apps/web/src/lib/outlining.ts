import { useMutation } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { CORNERS_TO_CLOSE, closesTheOutline } from '@/components/viewer/outline-layer';
import { api, type MarkPoint } from '@/lib/api';
import { useRecordSheet } from '@/lib/positions';

/**
 * **Drawing a Sub-assembly's outline** (issue #113): the marking tool's other mode, kept out of
 * the screen that draws it.
 *
 * A click on the drawing adds a corner. A click on the first corner, or Enter, closes the outline
 * and saves it — replacing whatever outline the Sub-assembly had, since it has at most one.
 * Escape abandons it, and nothing is written until it is closed: a half-drawn outline is not
 * something the archive has an opinion about.
 */
export interface OutlineTool {
  /** The Sub-assembly being drawn round, while one is. */
  subAssemblyId: string | null;
  /** The corners so far, in the order they were placed. */
  corners: MarkPoint[];
  drawing: boolean;
  start: (subAssemblyId: string) => void;
  /** A tap on the drawing: a corner there, or the outline closed if it was on the first one. */
  add: (at: MarkPoint, on: Element | null) => void;
  /** Closes and saves it, once it has enough corners to enclose anything. */
  close: () => void;
  abandon: () => void;
  remove: (subAssemblyId: string) => void;
  busy: boolean;
  refusal: string | null;
}

interface Drawing {
  tavolaId: string;
  subAssemblyId: string;
  corners: MarkPoint[];
}

export function useOutlineTool(tavolaId: string): OutlineTool {
  const record = useRecordSheet(tavolaId);
  const [held, setDrawing] = useState<Drawing | null>(null);
  // This screen is not remounted between drawings, so an outline half drawn on one sheet is
  // simply not being drawn on the next.
  const drawing = held?.tavolaId === tavolaId ? held : null;

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

  const close = useCallback(() => {
    if (drawing && drawing.corners.length >= CORNERS_TO_CLOSE && !save.isPending) {
      save.mutate(drawing);
    }
  }, [drawing, save]);

  const abandon = useCallback(() => {
    setDrawing(null);
    save.reset();
  }, [save]);

  /**
   * The two keys, wherever focus is on the page — except in a field or on a control, where Enter
   * already means that control.
   */
  useEffect(() => {
    if (!drawing) {
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
      if (event.key === 'Enter') {
        event.preventDefault();
        close();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        abandon();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawing, close, abandon]);

  return {
    subAssemblyId: drawing?.subAssemblyId ?? null,
    corners: drawing?.corners ?? [],
    drawing: drawing !== null,
    start: useCallback(
      (subAssemblyId: string) => {
        save.reset();
        removal.reset();
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
    close,
    abandon,
    remove: (subAssemblyId) => removal.mutate(subAssemblyId),
    busy: save.isPending || removal.isPending,
    refusal: (save.error ?? removal.error)?.message ?? null,
  };
}
