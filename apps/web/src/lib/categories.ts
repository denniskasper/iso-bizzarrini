import type { Uncategorised } from '@ricambi/contracts';
import type { Category, TavolaSummary } from '@/lib/api';

/**
 * What a filter and an address call a Tavola with no Category. The archive reserves the word,
 * so no Category can be named it and `?category=uncategorised` only ever means one thing.
 */
export const UNCATEGORISED: Uncategorised = 'uncategorised';

/** One choice on a Model's filter: a system, or the drawings filed under none. */
export interface FilterChoice {
  /** A Category's slug, or `UNCATEGORISED`. What the address carries. */
  slug: string;
  name: string;
  /** How many of this Model's drawings it holds. Never zero — an empty choice is not offered. */
  tavole: number;
}

/**
 * The choices one Model's own drawings give rise to, in alphabetical order with the unfiled
 * drawings last.
 *
 * **Built from the sheets on the page and not from the archive's whole list**, because a filter
 * that offers "Cooling" on a car with no drawing of its cooling leads to an empty sheet, and an
 * empty sheet reads as a fault. The unfiled drawings get a choice of their own for the opposite
 * reason: they are on this car, and a filter with no way to ask for them would be hiding them.
 */
export function filterChoices(tavole: TavolaSummary[]): FilterChoice[] {
  const systems = new Map<string, FilterChoice>();
  let unfiled = 0;

  for (const { category } of tavole) {
    if (!category) {
      unfiled += 1;
      continue;
    }
    const existing = systems.get(category.slug);
    if (existing) {
      existing.tavole += 1;
    } else {
      systems.set(category.slug, { slug: category.slug, name: category.name, tavole: 1 });
    }
  }

  const choices = [...systems.values()].sort((a, b) => a.name.localeCompare(b.name));
  if (unfiled > 0) {
    choices.push({ slug: UNCATEGORISED, name: 'Uncategorised', tavole: unfiled });
  }
  return choices;
}

/** Whether a drawing is what the filter asked for. No filter asks for everything. */
export function filedUnder(tavola: TavolaSummary, slug: string | undefined): boolean {
  if (slug === undefined) {
    return true;
  }
  return slug === UNCATEGORISED ? tavola.category === null : tavola.category?.slug === slug;
}

/** "1 drawing", "12 drawings" — the one place this archive counts sheets in a sentence. */
export function drawings(count: number): string {
  return count === 1 ? '1 drawing' : `${count} drawings`;
}

/** The list's own order, for a screen that has just changed it and should not wait to be told. */
export function byName<T extends Pick<Category, 'name'>>(categories: T[]): T[] {
  return [...categories].sort((a, b) => a.name.localeCompare(b.name));
}
