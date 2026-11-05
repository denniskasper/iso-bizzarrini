import { lazy, Suspense } from 'react';
import { environmentMode } from '@/lib/environment';

/**
 * **The guided tour, for practice systems only.** Temporary: delete this folder, `lib/tour.ts`
 * and its two lines in the app shell once the tours have been walked.
 *
 * Loaded on its own, and never on Production, so the archive's members download none of it.
 */
const Panel = lazy(() =>
  import('./guided-tour').then((module) => ({ default: module.GuidedTour })),
);
const Links = lazy(() => import('./guided-tour').then((module) => ({ default: module.TourLink })));

export function GuidedTour() {
  if (environmentMode() === 'production') {
    return null;
  }
  return (
    <Suspense fallback={null}>
      <Panel />
    </Suspense>
  );
}

export function TourLink({ className }: { className: string }) {
  if (environmentMode() === 'production') {
    return null;
  }
  return (
    <Suspense fallback={null}>
      <Links className={className} />
    </Suspense>
  );
}
