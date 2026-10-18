import type { Spending } from './cost.js';
import { cropsOf, findNumbers, type NumberCrop } from './find-numbers.js';
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
  identity?: SheetIdentity,
): Promise<{ sheet: SheetEstimate; cost: number }> {
  const sheet = await method.estimate(page);
  // A page not yet asked about is found numbers on the way it was scanned; once turned upright
  // it may group a few differently, and each request is counted again before it is sent.
  const numbers = identity?.kind === 'table' ? [] : await estimateNumbers(method, page.image);
  const cost = !identity
    ? spending.estimateOf(sheet, numbers)
    : identity.kind === 'drawing'
      ? spending.numbersOf(numbers)
      : spending.readingOf(sheet);
  return { sheet, cost };
}

/** The requests a drawing's numbers would take to read, each counted as it would be sent. */
async function estimateNumbers(method: ReadingMethod, image: Buffer): Promise<RequestEstimate[]> {
  const crops = await cropsOf(image, await findNumbers(image));
  const requests: RequestEstimate[] = [];
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
