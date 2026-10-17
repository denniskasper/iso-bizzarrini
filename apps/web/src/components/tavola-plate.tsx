import { Link } from '@tanstack/react-router';
import { Plate } from '@/components/plate';
import type { TavolaSummary } from '@/lib/api';
import { cn } from '@/lib/utils';

/**
 * A page of drawings, laid out as a **contact sheet** — the way anyone with a box of plates
 * finds the one they want, by looking. One car's drawings are a sheet, and so is one system's
 * share of a car, which is why this is not the Model page's own.
 */
export function TavolaSheet({
  tavole,
  nameCategory = true,
}: {
  tavole: TavolaSummary[];
  /** Off on a page that is already one Category's, where every plate would repeat its title. */
  nameCategory?: boolean;
}) {
  return (
    <ul
      data-testid="tavola-sheet"
      className="grid grid-cols-1 gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3"
    >
      {tavole.map((tavola) => (
        <li key={tavola.id}>
          <TavolaPlate tavola={tavola} nameCategory={nameCategory} />
        </li>
      ))}
    </ul>
  );
}

/**
 * One plate on the sheet: the drawing, its number, and the two names the factory gave it.
 *
 * The Italian name is set first and largest because it is the name printed on the sheet the
 * member is holding; the English one is underneath, for the member who is not. The number is
 * mono, like every number in this archive — it is an identifier to be compared, not read.
 *
 * An Unchecked plate — one only an Editor is shown — is framed by a broken line and says so where
 * its Category would be: what it is filed under matters less, until it is checked, than that no
 * Member can open it yet.
 *
 * The Category is named and not linked: the whole plate is already one link, to the drawing,
 * and a second target inside it is a target a gloved thumb hits by accident. The way to a
 * system is the filter above the sheet.
 */
export function TavolaPlate({
  tavola,
  nameCategory = true,
}: {
  tavola: TavolaSummary;
  nameCategory?: boolean;
}) {
  const unchecked = tavola.state === 'unchecked';

  return (
    <Link
      to="/tavole/$tavolaId"
      params={{ tavolaId: tavola.id }}
      data-testid="tavola-plate"
      className="group block"
    >
      <Plate
        scan={tavola.scan}
        alt={`Tavola ${tavola.number} — ${tavola.nameEn}`}
        className={cn(
          'aspect-[4/3] transition-opacity duration-150 ease-[var(--ease-out-quick)] group-hover:opacity-85',
          unchecked && 'plate-unchecked',
        )}
      />

      <div className="mt-4 flex items-baseline gap-4">
        <span className="tabular text-xl text-muted">{tavola.number}</span>
        <span className="min-w-0 flex-1 text-xl text-pretty">{tavola.nameIt}</span>
      </div>
      <div className="mt-1 flex items-baseline justify-between gap-4">
        <span className="text-sm text-muted">{tavola.nameEn}</span>
        {/* Said in words as well as drawn, because a dashed line is not something a screen
            reader announces. Only an Editor is ever sent an Unchecked plate. */}
        {unchecked ? (
          <span className="text-sm text-text" data-testid="tavola-unchecked">
            Unchecked
          </span>
        ) : (
          nameCategory && tavola.category && <span className="tag">{tavola.category.name}</span>
        )}
      </div>
    </Link>
  );
}
