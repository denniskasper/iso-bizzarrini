import { Link } from '@tanstack/react-router';
import { EnglishName } from '@/components/machine-translation';
import type { TavolaSummary } from '@/lib/api';
import { cn } from '@/lib/utils';

/**
 * **Which of a car's drawings are still Unchecked** (issue #56), so an Editor knows what is left
 * to compare with the factory's sheets before members can see it.
 *
 * It asks nobody's role: only an Editor is ever sent an Unchecked Tavola, so for a Member the
 * list is empty and nothing is drawn. It wears the dashed edge every Unchecked thing wears.
 */
export function LeftToCheck({
  tavole,
  className,
}: {
  tavole: TavolaSummary[];
  className?: string;
}) {
  const unchecked = tavole.filter((tavola) => tavola.state === 'unchecked');
  if (unchecked.length === 0) {
    return null;
  }

  return (
    <section
      aria-labelledby="left-to-check"
      className={cn('tavola-unchecked', className)}
      data-testid="left-to-check"
    >
      <h2 id="left-to-check" className="text-lg font-semibold">
        Left to check
      </h2>
      <p className="mt-1 max-w-measure text-pretty text-muted">
        {unchecked.length === 1
          ? '1 drawing of this car is still Unchecked. Members can’t see it until it is published.'
          : `${unchecked.length} drawings of this car are still Unchecked. Members can’t see them until they are published.`}
      </p>
      <ul className="mt-3 border-t border-line">
        {unchecked.map((tavola) => (
          <li key={tavola.id} className="border-b border-line" data-testid="left-to-check-tavola">
            <Link
              to="/tavole/$tavolaId"
              params={{ tavolaId: tavola.id }}
              className="flex min-h-control flex-wrap items-baseline gap-x-4 gap-y-1 py-2 hover:text-accent-ink"
            >
              <span className="tabular text-base whitespace-nowrap">{tavola.number}</span>
              <span className="min-w-0 text-sm text-pretty text-muted">
                <EnglishName
                  nameEn={tavola.nameEn}
                  nameIt={tavola.nameIt}
                  machineTranslated={tavola.nameEnMachineTranslated}
                />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
