import { Link } from '@tanstack/react-router';
import type { Sheet } from '@/lib/api';
import { positionsIn } from '@/lib/positions';

/**
 * **The sheet's Sub-assemblies, beside the drawing**, each name opening its own page (issue
 * #110). A sheet with none shows nothing, rather than a heading over an empty list.
 *
 * Read off the sheet the drawing arrived with, so it costs no request, and in the archive's own
 * order — by name, since nothing else orders a Sub-assembly.
 */
export function SubAssemblyList({ tavolaId, sheet }: { tavolaId: string; sheet: Sheet }) {
  if (sheet.subAssemblies.length === 0) {
    return null;
  }

  return (
    <section aria-labelledby="sheet-sub-assemblies" data-testid="sheet-sub-assemblies">
      <h2 id="sheet-sub-assemblies" className="label">
        Sub-assemblies on this sheet
      </h2>
      <ul className="mt-4 border-b border-line">
        {sheet.subAssemblies.map((subAssembly) => (
          <li key={subAssembly.id} className="border-t border-line">
            <Link
              to="/tavole/$tavolaId/sub-assemblies/$subAssemblyId"
              params={{ tavolaId, subAssemblyId: subAssembly.id }}
              data-testid="sheet-sub-assembly"
              className="flex min-h-control items-baseline justify-between gap-4 py-2 hover:bg-surface-sunken"
            >
              <span className="text-pretty text-accent-ink underline-offset-4 hover:underline">
                {subAssembly.name}
              </span>
              <span className="tabular text-sm text-faint">
                {positionsIn(sheet, subAssembly.id).length} numbers
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
