import type { ReactNode } from 'react';
import { Roundel } from '@/components/wordmark';
import type { TavolaScan } from '@/lib/api';
import { cn } from '@/lib/utils';

/**
 * A drawing on the sheet it was printed on.
 *
 * Nothing here asks whether the member may see it: a plate is only ever rendered behind
 * `ArchiveGate`, and the images are refused at the API besides. What it does distinguish is a
 * drawing from a **Tavola nobody has scanned yet**, which is a legitimate state and has to
 * look like one rather than like something broken.
 */
export function Plate({
  scan,
  alt,
  className,
}: {
  scan: TavolaScan | null;
  alt: string;
  className?: string;
}) {
  if (!scan) {
    return (
      <EmptyPlate className={className}>
        <Roundel className="size-6 text-line-strong" />
        <span>Not scanned yet</span>
      </EmptyPlate>
    );
  }

  return (
    <div className={cn('plate', className)}>
      <img
        src={scan.previewUrl}
        alt={alt}
        width={scan.width}
        height={scan.height}
        // A contact sheet is a page of drawings a member is scrolling past; only the ones that
        // reach the screen are worth a request.
        loading="lazy"
        decoding="async"
      />
    </div>
  );
}

/**
 * A plate with nothing on it — and **not white paper**.
 *
 * That was the first attempt and it was wrong: on a dark screen a sheet with no drawing on it
 * was the loudest thing on the page, so a car with three unscanned Tavole shouted at a member
 * about the three things that were not there. Paper means there is a sheet. Nothing yet means
 * the surface stays where the chrome is, recessed, and says why in plain words.
 */
function EmptyPlate({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'grid place-items-center overflow-hidden border border-line bg-surface-sunken',
        className,
      )}
    >
      <div className="flex flex-col items-center gap-3 px-6 py-10 text-center text-sm text-muted">
        {children}
      </div>
    </div>
  );
}
