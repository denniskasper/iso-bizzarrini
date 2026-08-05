import { AdministratorsOnly } from '@/components/roster/administrators-only';
import { RosterImport } from '@/components/roster/roster-import';

/**
 * **The Club's membership list, loaded instead of typed** (story 122) — a screen of its own rather
 * than a panel on the roster.
 *
 * The roster's own dominant action is adding one person, and this is the once-a-year act of
 * loading a hundred; a screen carrying both would have two, and the plan this one puts on the page
 * is a table the roster has no room for. It is reached from the roster, which is where an
 * Administrator is standing when they think of it.
 */
export function RosterImportPage() {
  return (
    <AdministratorsOnly what="The roster">
      <RosterImport />
    </AdministratorsOnly>
  );
}
