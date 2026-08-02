/**
 * How a scan is addressed, written down once so the route that serves it and the response that
 * advertises it cannot drift apart.
 *
 * The scan's id is in the address, and a re-upload makes a new Scan. That is what lets these
 * be cached immutably: an address in this archive never changes what it points at.
 */
export const SCAN_VARIANTS = ['display', 'preview'] as const;

export type ScanVariant = (typeof SCAN_VARIANTS)[number];

export function scanImageUrl(scanId: string, variant: ScanVariant): string {
  return `/api/scans/${scanId}/${variant}`;
}
