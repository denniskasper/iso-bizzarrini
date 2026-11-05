import type { ReactNode } from 'react';

/**
 * **What a tour is made of**: steps, each waiting for something on the page, grouped into a few
 * named parts shown as a progress bar. A tour is content only; `guided-tour.tsx` walks any of
 * them, and its browser test walks `tours/example.tsx`, so a tour of its own has no test and is
 * checked by walking it on a practice system before it is handed to a tester.
 */

/** What the panel knows about the page, for a step to decide by. */
export interface Where {
  path: string;
  signedIn: boolean;
  /** Whether who this is has been answered yet: signed out is not known until it has. */
  known: boolean;
  /** Whether an Administrator has let this Account propose. */
  mayPropose: boolean;
  isEditor: boolean;
  isAdministrator: boolean;
}

export interface Step {
  /** Which of the tour's parts this step belongs to; none for its first and last. */
  part: string | null;
  title: string;
  body: ReactNode | ((where: Where) => ReactNode);
  /** Somewhere to go for this step, unless already there. */
  go?: { to: string; label: string; unless: (where: Where) => boolean };
  /** The screen showing this step was done. Without one, the tester says so. */
  done?: (where: Where) => boolean;
  /** What the tester presses to say they are done, where nothing can tell. */
  next?: string;
  /** A way on to the next part, for when the archive is not as the step expects. */
  skip?: string;
}

export interface Tour {
  /** What the footer offers it as; none for a tour nobody is meant to take from there. */
  footer: string | null;
  parts: { part: string; name: string }[];
  steps: Step[];
}

export const onTavola = (where: Where) => where.path.startsWith('/tavole/');
export const onProposals = (where: Where) => where.path.startsWith('/proposals');
