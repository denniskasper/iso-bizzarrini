import type { MarkPoint, Position, Sheet } from '@/lib/api';

/**
 * **Whether a point is inside an outline** (issue #115), by the even–odd rule: a line from the
 * point out to the right crosses the outline's sides an odd number of times when it starts inside.
 * Corners and Marks are both fractions of the drawing, so the two compare as they are.
 */
export function isInside(point: MarkPoint, outline: readonly MarkPoint[]): boolean {
  let inside = false;
  for (let index = 0, previous = outline.length - 1; index < outline.length; previous = index++) {
    const a = outline[index];
    const b = outline[previous];
    if (!a || !b) {
      continue;
    }
    if (a.y > point.y !== b.y > point.y) {
      const crossing = a.x + ((point.y - a.y) * (b.x - a.x)) / (b.y - a.y);
      if (point.x < crossing) {
        inside = !inside;
      }
    }
  }
  return inside;
}

/** The point on the side from `a` to `b` nearest `point` — where a corner added there goes. */
export function nearestOnSide(point: MarkPoint, a: MarkPoint, b: MarkPoint): MarkPoint {
  const across = b.x - a.x;
  const down = b.y - a.y;
  const length = across * across + down * down;
  if (length === 0) {
    return a;
  }
  const along = Math.min(
    1,
    Math.max(0, ((point.x - a.x) * across + (point.y - a.y) * down) / length),
  );
  return { x: a.x + along * across, y: a.y + along * down };
}

/**
 * **The Positions with a Mark outside their Sub-assembly's outline**, by Sub-assembly — what an
 * Editor is warned about. Computed from the sheet as it stands and never stored: it is only ever
 * a hint that an outline, or a Mark, is in the wrong place, and nothing is refused for it.
 *
 * A Sub-assembly with no outline has nothing to be outside of, and is not in the map.
 */
export function outsideTheirOutlines(sheet: Sheet): Map<string, Position[]> {
  const outlines = new Map(
    sheet.subAssemblies.flatMap((subAssembly) =>
      subAssembly.outline ? [[subAssembly.id, subAssembly.outline] as const] : [],
    ),
  );
  const outside = new Map<string, Position[]>();
  for (const position of sheet.positions) {
    const outline = position.subAssemblyId ? outlines.get(position.subAssemblyId) : undefined;
    if (!position.subAssemblyId || !outline) {
      continue;
    }
    if (position.marks.some((mark) => !isInside(mark, outline))) {
      outside.set(position.subAssemblyId, [
        ...(outside.get(position.subAssemblyId) ?? []),
        position,
      ]);
    }
  }
  return outside;
}
