import { Link } from '@tanstack/react-router';
import type { FilterChoice } from '@/lib/categories';
import { cn } from '@/lib/utils';

/**
 * Going straight to one system of the car — just the brakes, just the electrics (story 35).
 *
 * **Links, and the choice lives in the address.** A member who has narrowed a sixty-drawing car
 * down to its brakes can send that address to somebody, reload it in a garage with one bar of
 * signal, or come back to it from their history; a filter held in a variable does none of that.
 *
 * Set as the thumb index of a parts book: plain names in a row, the one in use ruled underneath
 * in ink. Nothing here wears the accent, because nothing here is the page's one action — that is
 * still opening a drawing. Every choice is a full touch height, and the row wraps rather than
 * scrolls, so no system is ever off the edge of a phone.
 */
export function CategoryFilter({
  modelId,
  choices,
  total,
  chosen,
}: {
  modelId: string;
  choices: FilterChoice[];
  /** Every drawing of this Model, which is what "All" holds. */
  total: number;
  /** The slug in the address, or nothing when every drawing is shown. */
  chosen: string | undefined;
}) {
  return (
    <nav aria-label="Filter by Category" data-testid="category-filter">
      <ul className="filter-index">
        <li>
          <FilterLink modelId={modelId} slug={undefined} current={chosen === undefined}>
            All <Count>{total}</Count>
          </FilterLink>
        </li>
        {choices.map((choice) => (
          <li key={choice.slug}>
            <FilterLink modelId={modelId} slug={choice.slug} current={chosen === choice.slug}>
              {choice.name} <Count>{choice.tavole}</Count>
            </FilterLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function FilterLink({
  modelId,
  slug,
  current,
  children,
}: {
  modelId: string;
  slug: string | undefined;
  current: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      to="/models/$modelId"
      params={{ modelId }}
      search={slug === undefined ? {} : { category: slug }}
      // Narrowing a sheet is not going somewhere: the back button should leave the car, not
      // walk back through every system that was looked at on the way.
      replace
      resetScroll={false}
      // The router marks a link current when it leads where the reader already is, and here
      // that has to mean the search as well as the path — every entry is the same page, and
      // without this each of them would claim to be the one in use.
      activeOptions={{ exact: true, includeSearch: true }}
      className={cn('filter-index-entry', current && 'filter-index-entry-current')}
    >
      {children}
    </Link>
  );
}

/** How many drawings a choice holds — a number to compare, so it is set like every other one. */
function Count({ children }: { children: number }) {
  return <span className="tabular text-sm text-faint">{children}</span>;
}
