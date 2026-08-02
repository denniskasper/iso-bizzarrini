import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { ScanUpload } from '@/components/editor/scan-upload';
import { Plate } from '@/components/plate';
import { api, type CatalogProvenance } from '@/lib/api';

/**
 * One drawing, as large as the screen will allow.
 *
 * This is the surface the whole product is for, and it is deliberately almost empty: the sheet,
 * what it is called, and what the factory printed at the top of it. Zooming, panning and the
 * numbered circles arrive with tickets 04 and 05 — on this same plate, which is why the scan's
 * own dimensions are already carried through so nothing reflows when they do.
 */
export function TavolaPage() {
  const { tavolaId } = useParams({ from: '/tavole/$tavolaId' });

  const { data, isPending, isError, error } = useQuery({
    queryKey: ['tavola', tavolaId],
    queryFn: () => api.tavola(tavolaId),
  });

  if (isPending) {
    return <p className="text-lg text-muted">Reading the drawing…</p>;
  }

  if (isError) {
    return (
      <div className="animate-rise">
        <h1 className="text-3xl font-semibold">That drawing is not in the archive.</h1>
        <p className="mt-6 max-w-measure text-pretty text-muted">{error.message}</p>
        <Link to="/" className="mt-8 inline-block text-accent-ink underline underline-offset-4">
          Back to the catalog
        </Link>
      </div>
    );
  }

  const { tavola } = data;

  return (
    <div className="animate-rise">
      <Link
        to="/models/$modelId"
        params={{ modelId: tavola.model.id }}
        className="text-2xs text-faint uppercase hover:text-muted"
      >
        {tavola.model.brand} {tavola.model.name}
      </Link>

      <div className="mt-3 flex flex-wrap items-baseline gap-x-6 gap-y-1">
        <span className="tabular text-3xl text-muted sm:text-4xl">{tavola.number}</span>
        <h1 className="text-3xl font-semibold text-balance sm:text-4xl">{tavola.nameIt}</h1>
      </div>
      <p className="mt-2 text-lg text-muted">
        {tavola.nameEn}
        <span className="ml-4 text-2xs text-faint uppercase">{tavola.category.name}</span>
      </p>

      {/* The drawing, and nothing beside it. It gets the full measure of the page. */}
      <Plate
        scan={tavola.scan}
        size="display"
        alt={`Tavola ${tavola.number} — ${tavola.nameEn}`}
        className="mt-10 min-h-64"
      />

      <div className="mt-16 grid gap-12 sm:grid-cols-2">
        <Provenance provenance={tavola.provenance} />
        <ScanUpload tavolaId={tavola.id} hasScan={tavola.scan !== null} />
      </div>
    </div>
  );
}

/**
 * What the factory printed at the head of the sheet, in the factory's own words.
 *
 * **Evidence, and nothing navigates by it.** It is here so a member can match this screen
 * against a paper catalog, which is why the labels are the Italian words as printed rather than
 * translations of them, and why nothing here is a link. The Category above is what navigation
 * uses.
 */
function Provenance({ provenance }: { provenance: CatalogProvenance }) {
  const entries: [string, string | null][] = [
    ['Sezione', provenance.section],
    ['Gruppo', provenance.group],
    ['Sottogruppo', provenance.subgroup],
  ];

  const recorded = entries.filter(([, value]) => value !== null);

  return (
    <section aria-labelledby="provenance">
      <h2 id="provenance" className="text-2xs text-muted uppercase">
        On the sheet
      </h2>

      {recorded.length === 0 ? (
        <p className="mt-4 max-w-measure text-pretty text-faint">
          The factory's own classification has not been transcribed for this Tavola.
        </p>
      ) : (
        <dl className="mt-4 border-t border-line">
          {recorded.map(([label, value]) => (
            <div
              key={label}
              className="flex items-baseline justify-between gap-6 border-b border-line py-3"
            >
              <dt className="text-sm text-muted">{label}</dt>
              <dd className="tabular text-base">{value}</dd>
            </div>
          ))}
        </dl>
      )}

      <p className="mt-4 max-w-measure text-xs text-pretty text-faint">
        Recorded as the factory wrote it, so this screen can be matched against a paper catalog.
      </p>
    </section>
  );
}
