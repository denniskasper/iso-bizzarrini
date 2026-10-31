/**
 * How an image in this archive is addressed, written down once so the routes that serve them and
 * the responses that advertise them cannot drift apart.
 *
 * The record's id is in the address, and re-uploading makes a new record. That is what lets these
 * be cached immutably: an address in this archive never changes what it points at.
 *
 * **The two kinds of image are addressed alike and served alike**, and the variants are one list
 * rather than two. A factory drawing and a photograph of a part are different things to a member
 * and the same thing to ADR 0006 — private, authenticated, on no public path — so the shape of
 * the address is a property of the archive rather than of what is in the picture.
 */
export const IMAGE_VARIANTS = ['display', 'preview'] as const;

export type ImageVariant = (typeof IMAGE_VARIANTS)[number];

export function scanImageUrl(scanId: string, variant: ImageVariant): string {
  return `/api/scans/${scanId}/${variant}`;
}

/**
 * A photograph a member attached to a Contribution. **An address of its own**, because who it
 * is served to is a different question from a Part's: until an Editor has looked, the answer is
 * its author and nobody else.
 */
export function contributionPhotographImageUrl(
  photographId: string,
  variant: ImageVariant,
): string {
  return `/api/contribution-photographs/${photographId}/${variant}`;
}

/**
 * A screenshot shown with a Proposal (issue #154). An address of its own, because it is served
 * to those with the permission to propose, and a Draft's only to its author.
 */
export function proposalScreenshotImageUrl(screenshotId: string, variant: ImageVariant): string {
  return `/api/proposal-screenshots/${screenshotId}/${variant}`;
}

export function photographImageUrl(photographId: string, variant: ImageVariant): string {
  return `/api/photographs/${photographId}/${variant}`;
}

/**
 * One of a Tavola's Table sheets (ADR 0017). Under the Tavola, so the guard that keeps an
 * Unchecked Tavola from a Member keeps its sheets from them too; loading a Tavola again makes a
 * new Tavola, so this address never changes what it points at either.
 */
export function tableSheetImageUrl(tavolaId: string, sheet: number): string {
  return `/api/tavole/${tavolaId}/table-sheets/${sheet}`;
}

/**
 * A Sample's public copy of its drawing (ADR 0019) — **the one image address anybody may be
 * served**, signed in or not. It names the copy rather than the Tavola or the Scan, so it says
 * nothing about where the archive's own image is, and a new copy is a new address.
 */
export function sampleDrawingUrl(drawingId: string): string {
  return `/api/sample-drawings/${drawingId}`;
}
