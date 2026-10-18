import type { ReadingSetup } from '@ricambi/contracts';
import { AdministratorsOnly } from '@/components/roster/administrators-only';
import { useReadingSetup } from '@/lib/readings';

/**
 * **The Readings section** (issue #55, ADR 0018): what this server reads the factory catalog
 * with, whether that is charged, and whether reading can start at all.
 *
 * One statement is the whole of the page for now, said in the words the Club decides by:
 * "Subscription, not charged" or "API key, charged". Never the credential and never whose
 * subscription it is; the API does not know how to say either. Starting a Catalog run arrives
 * here later, and will be the screen's one action.
 */
export function ReadingsPage() {
  return (
    <AdministratorsOnly what="Reading the catalog">
      <Readings />
    </AdministratorsOnly>
  );
}

function Readings() {
  const setup = useReadingSetup();

  if (setup.isPending) {
    return null;
  }

  if (setup.isError) {
    return (
      <p className="text-lg text-pretty text-muted">
        What this server reads with could not be found out just now.
      </p>
    );
  }

  return (
    <div className="mx-auto max-w-measure animate-rise">
      <h1 className="display text-4xl tracking-display sm:text-5xl">Readings</h1>
      <p className="mt-6 text-lg text-pretty text-muted">
        Ricambi reads the factory catalog itself, with the one Reading method this server is given.
        Every Tavola it reads arrives Unchecked, for an Editor to check and publish.
      </p>

      <Method setup={setup.data} />
    </div>
  );
}

function Method({ setup }: { setup: ReadingSetup }) {
  return (
    <section
      className="mt-10 border-l-2 border-line-strong pl-4"
      aria-label="What this server reads with"
    >
      <p className="text-3xl font-semibold text-balance text-text" data-testid="reading-method">
        {named(setup)}
      </p>

      {setup.available ? (
        <p className="mt-4 text-lg text-pretty text-muted" data-testid="reading-available">
          {whatItMeans(setup)}
        </p>
      ) : (
        <div data-testid="reading-unavailable">
          <p className="mt-4 text-lg font-medium text-pretty text-text">Nothing can be read.</p>
          <p className="mt-2 text-pretty text-muted">{setup.unavailable}</p>
        </div>
      )}
    </section>
  );
}

function named({ method, charged }: ReadingSetup): string {
  const charging = charged ? 'charged' : 'not charged';
  switch (method) {
    case 'subscription':
      return `Subscription, ${charging}`;
    case 'api-key':
      return `API key, ${charging}`;
    case 'fake':
      return `Practice method, ${charging}`;
    case null:
      return 'No Reading method';
  }
}

function whatItMeans({ method }: ReadingSetup): string {
  switch (method) {
    case 'subscription':
      return 'A run is priced at list prices and shown as what it would have cost. The plan’s usage limits apply.';
    case 'api-key':
      return 'Every run is billed per use, and held to the spending limit an Administrator sets before it starts.';
    case 'fake':
      return 'It reads nothing and invents what it would have read, so a practice run costs nothing.';
    case null:
      return '';
  }
}
