import type { Tour } from '../tour-steps';
import { exampleTour } from './example';
import { markingTour } from './marking';
import { proposalsTour } from './proposals';
import { readingTour } from './reading';
import { spendingTour } from './spending';

/**
 * **Every tour, newest first**, which is also the order the footer offers them in. A bare
 * `?tour` link starts the first; `?tour=<name>` any of them. Retiring one is deleting its file and
 * its line here.
 */
export const TOURS = {
  marking: markingTour,
  spending: spendingTour,
  proposals: proposalsTour,
  reading: readingTour,
  example: exampleTour,
} satisfies Record<string, Tour>;

export type TourName = keyof typeof TOURS;

const NAMES = Object.keys(TOURS) as TourName[];

/** The tour a name stands for: none, or an unknown one, is the newest. */
export function tourNamed(name: string | null): TourName {
  return NAMES.find((tour) => tour === name) ?? NAMES[0]!;
}

/** The tour a stored name stands for, or none, for a tour that has since been retired. */
export function tourOrNone(name: string): Tour | undefined {
  return NAMES.includes(name as TourName) ? TOURS[name as TourName] : undefined;
}

export const FOOTER_TOURS = NAMES.flatMap((name) => {
  const footer = TOURS[name].footer;
  return footer ? [{ name, footer }] : [];
});
