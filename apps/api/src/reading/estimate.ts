import sharp from 'sharp';
import type { Spending } from './cost.js';
import { bothWays, cropsOf, findNumbers, type NumberCrop } from './find-numbers.js';
import {
  NUMBERS_PER_REQUEST,
  type ReadingMethod,
  type RequestEstimate,
  type SheetEstimate,
  type SheetIdentity,
  type SheetImage,
} from './reading-method.js';

/**
 * **What reading one page would cost, worked out before anything is sent** (ADR 0017, issue #37).
 * The read command adds these up before it reads, and Ricambi does the same when an
 * Administrator uploads a catalog (issue #57), so the two estimates are one sum.
 *
 * A page nobody has asked about yet is counted as whichever it would cost more as: a Table sheet
 * asked what it is, read twice and translated, or a drawing asked what it is and its numbers
 * read. A page already known to be one or the other is counted as that, without being asked.
 */
export async function estimatePage(
  method: ReadingMethod,
  spending: Spending,
  page: SheetImage,
  known?: SheetIdentity,
): Promise<{ sheet: SheetEstimate; cost: number }> {
  const identity = known && needsAsking(known) ? undefined : known;
  const sheet = await method.estimate(page);
  const numbers = identity?.kind === 'table' ? [] : await estimateNumbers(method, page, identity);
  const cost = !identity
    ? spending.estimateOf(sheet, numbers)
    : identity.kind === 'drawing'
      ? spending.numbersOf(numbers)
      : spending.readingOf(sheet);
  return { sheet, cost };
}

/**
 * A drawing identified before it was asked which way its numbers read (issue #72) is asked again,
 * and counted as a page not yet asked about.
 */
export function needsAsking(identity: SheetIdentity): boolean {
  return identity.kind === 'drawing' && identity.numbersTurn === undefined;
}

/**
 * The requests a drawing's numbers would take to read, each counted as it would be sent. Before
 * the page is asked which way its numbers read, and after, they are found both on the axis it said
 * and a quarter from it, and counted the way that finds more; turned half round, a page finds the
 * same. Unless
 * they are known to read the way the headings do, asking which way up they are is counted too.
 */
async function estimateNumbers(
  method: ReadingMethod,
  page: SheetImage,
  identity: SheetIdentity | undefined,
): Promise<RequestEstimate[]> {
  // The reading finds them a quarter further round where that finds far more, whatever the
  // identification said, so both axes are counted either way.
  const known = identity?.numbersTurn;
  const turns = known !== undefined ? [known, (known + 90) % 360] : [0, 90];
  let crops: NumberCrop[] = [];
  for (const turn of turns) {
    const image = turn === 0 ? page.image : await sharp(page.image).rotate(turn).png().toBuffer();
    const found = await cropsOf(image, await findNumbers(image));
    if (found.length >= crops.length) {
      crops = found;
    }
  }
  const requests: RequestEstimate[] = [];
  const turnedFromHeadings = !identity || identity.numbersTurn !== identity.turn;
  if (turnedFromHeadings && crops.length > 0) {
    requests.push(
      await method.estimateOrientation({ page: page.page, ...(await bothWays(crops)) }),
    );
  }
  for (const batch of batchesOf(crops)) {
    requests.push(await method.estimateNumbers(batch));
  }
  return requests;
}

/** A drawing's crops, as many to a request as one request is shown. */
export function batchesOf(crops: NumberCrop[]): NumberCrop[][] {
  const batches: NumberCrop[][] = [];
  for (let start = 0; start < crops.length; start += NUMBERS_PER_REQUEST) {
    batches.push(crops.slice(start, start + NUMBERS_PER_REQUEST));
  }
  return batches;
}
