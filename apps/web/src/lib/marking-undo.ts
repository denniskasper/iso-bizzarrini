import { api, type Mark, type MarkPoint, type Position, type Sheet } from '@/lib/api';

/**
 * **Taking back what the marking tool just did** (issue #236).
 *
 * Every write the tool makes already has an inverse the archive accepts, so undoing is a short
 * list of steps kept in the browser — this Editor's own, for this sitting at the tool on this
 * Tavola, and nothing the archive has to remember. Each step carries what the Editor left behind,
 * so an undo can tell whether somebody else has changed it since, and refuses rather than
 * overwriting their work.
 *
 * Removing a Position is not a step: it takes the number's links and Sub-assembly place with it,
 * which nothing here could put back, so it asks first instead.
 */
export type Step =
  /** A circle placed, on a number the click may have created. */
  | {
      kind: 'placed';
      markId: string;
      positionId: string;
      number: string;
      at: MarkPoint;
      created: boolean;
    }
  /** A number listed without a circle, which the press created. */
  | { kind: 'listed'; positionId: string; number: string }
  | { kind: 'moved'; markId: string; from: MarkPoint; to: MarkPoint }
  /** `illegible` is what it was set to; undoing sets the opposite. */
  | { kind: 'legibility'; markId: string; illegible: boolean }
  /** A circle taken off, with everything needed to put one back as it was. */
  | { kind: 'removed'; positionId: string; number: string; at: MarkPoint; illegible: boolean };

/** Enough to undo a working evening's last few slips, and short enough to mean "just now". */
export const UNDO_DEPTH = 20;

/**
 * An undo that cannot be tried again: the sheet is not as this Editor left it, or it was done
 * only in part. Either way the step is spent, and the words say what happened.
 */
export class Spent extends Error {}

function changedSince(): Spent {
  return new Spent('That Mark has changed since. Nothing was undone.');
}

function marksOf(positions: Position[]): { mark: Mark; position: Position }[] {
  return positions.flatMap((position) => position.marks.map((mark) => ({ mark, position })));
}

export function findMark(positions: Position[], markId: string) {
  return marksOf(positions).find((found) => found.mark.id === markId) ?? null;
}

export function pointOf(mark: Mark): MarkPoint {
  return { x: mark.x, y: mark.y };
}

/** At that point on the sheet, as the archive stored it: it sends back what it was sent. */
function sitsAt(mark: Mark, point: MarkPoint): boolean {
  return Math.abs(mark.x - point.x) < 1e-9 && Math.abs(mark.y - point.y) < 1e-9;
}

/**
 * The circle a write just put on `number` at `point`, picked out by where it is rather than by
 * what is new: with two clicks in flight, the second answer carries both new circles.
 */
export function placedAt(sheet: Sheet, number: string, point: MarkPoint) {
  const position = sheet.positions.find((one) => one.number === number.trim());
  const mark = position?.marks.findLast((one) => sitsAt(one, point));
  return position && mark ? { position, mark } : null;
}

/** Whether a step still has anything on the sheet to undo — removing a number takes its own. */
export function stillOn(step: Step, positions: Position[]): boolean {
  switch (step.kind) {
    case 'placed':
    case 'moved':
    case 'legibility':
      return findMark(positions, step.markId) !== null;
    case 'listed':
    case 'removed':
      return positions.some((position) => position.id === step.positionId);
  }
}

/**
 * Whether a number is still nothing but what this Editor's click made of it — no other circle,
 * no Sub-assembly, no link and nothing listed at it — so taking the number away loses nothing
 * anybody else recorded.
 */
async function onlyWhatTheClickMade(position: Position, marks: number): Promise<boolean> {
  if (
    position.marks.length !== marks ||
    position.subAssemblyId !== null ||
    position.related.length > 0
  ) {
    return false;
  }
  const { listings } = await api.positionListings(position.id);
  return listings.length === 0;
}

/**
 * The opposite of one step, **against the sheet as the archive has it now** rather than as this
 * screen last saw it: another Editor may have moved or removed the same circle in the meantime.
 */
export async function undoStep(tavolaId: string, step: Step): Promise<Sheet> {
  const { positions } = await api.tavola(tavolaId);

  switch (step.kind) {
    case 'placed': {
      const found = findMark(positions, step.markId);
      if (!found || !sitsAt(found.mark, step.at)) {
        throw changedSince();
      }
      // A number the click created goes with its circle — unless something has been recorded at
      // it since, in which case the number stays and only the circle comes off.
      return step.created && (await onlyWhatTheClickMade(found.position, 1))
        ? api.removePosition(step.positionId)
        : api.removeMark(step.markId);
    }
    case 'listed': {
      const position = positions.find((one) => one.id === step.positionId);
      if (!position || !(await onlyWhatTheClickMade(position, 0))) {
        throw changedSince();
      }
      return api.removePosition(step.positionId);
    }
    case 'moved': {
      const found = findMark(positions, step.markId);
      if (!found || !sitsAt(found.mark, step.to)) {
        throw changedSince();
      }
      return api.moveMark(step.markId, step.from);
    }
    case 'legibility': {
      const found = findMark(positions, step.markId);
      if (found?.mark.illegible !== step.illegible) {
        throw changedSince();
      }
      return api.markLegibility(step.markId, { illegible: !step.illegible });
    }
    case 'removed': {
      // Back on the number it came off, which must still be there: one somebody removed since is
      // theirs to have removed, and placing the circle would quietly bring it back.
      if (!positions.some((position) => position.id === step.positionId)) {
        throw changedSince();
      }
      const sheet = await api.placeMark(tavolaId, { number: step.number, ...step.at });
      const back = placedAt(sheet, step.number, step.at);
      if (!step.illegible || !back) {
        return sheet;
      }
      try {
        return await api.markLegibility(back.mark.id, { illegible: true });
      } catch {
        throw new Spent('The circle is back, but its print is no longer marked unreadable.');
      }
    }
  }
}
