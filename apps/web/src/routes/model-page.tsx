import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { NewTavolaForm } from '@/components/editor/new-tavola-form';
import { Plate } from '@/components/plate';
import { ModelProgress } from '@/components/progress/model-progress';
import { api, type TavolaSummary } from '@/lib/api';

/**
 * One car, and every drawing the factory made of it.
 *
 * Laid out as a **contact sheet** rather than as a list of numbers, because that is how anyone
 * with a box of plates finds the one they want: by looking. The drawing is the hero here as
 * much as it is on the Tavola page — the chrome around each one does nothing but hold it and
 * say what it is called.
 */
export function ModelPage() {
  const { modelId } = useParams({ from: '/models/$modelId' });

  const { data, isPending, isError, error } = useQuery({
    queryKey: ['model', modelId],
    queryFn: () => api.model(modelId),
  });

  if (isPending) {
    return <p className="text-lg text-muted">Reading the catalog…</p>;
  }

  if (isError) {
    return (
      <div className="animate-rise">
        <h1 className="text-3xl font-semibold">That car is not in the archive.</h1>
        <p className="mt-6 max-w-measure text-pretty text-muted">{error.message}</p>
        <Link to="/" className="mt-8 inline-block text-accent-ink underline underline-offset-4">
          Back to the catalog
        </Link>
      </div>
    );
  }

  const { model, tavole } = data;

  return (
    <div className="animate-rise">
      {/* The way back is the brand's own line: where this car sits in the catalog, said once. */}
      <p className="flex flex-wrap items-baseline gap-x-4 text-lg text-muted">
        <Link to="/" className="-my-2 flex min-h-control items-center hover:text-text">
          The archive
        </Link>
        <span aria-hidden className="text-line-strong">
          /
        </span>
        <span>{model.brand}</span>
        {model.series && <span className="tabular">{model.series}</span>}
        {model.modelYears && <span className="tabular text-text">{model.modelYears}</span>}
      </p>

      {/* The car's name at poster size, as on the catalog's own band for it. */}
      <h1 className="display mt-4 text-display text-balance">
        <span className="sr-only">{model.brand} </span>
        {model.name}
      </h1>

      <p className="mt-6 max-w-measure text-lg text-pretty text-muted">
        {tavole.length === 0
          ? 'No drawing has been recorded for this car yet.'
          : 'Open a drawing, then click the numbered position to read the part.'}
      </p>

      <NewTavolaForm modelId={modelId} className="mt-12" />

      {tavole.length > 0 && (
        <ul
          data-testid="tavola-sheet"
          className="mt-16 grid grid-cols-1 gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3"
        >
          {tavole.map((tavola) => (
            <li key={tavola.id}>
              <TavolaPlate tavola={tavola} />
            </li>
          ))}
        </ul>
      )}

      {/* Under the contact sheet, because looking is how a member finds the drawing they want
          and counting is how an Editor decides which evening to spend. The drawings stay the
          hero of this page; the tally is what is left of them. */}
      {tavole.length > 0 && (
        <div className="mt-20">
          <ModelProgress modelId={modelId} tavole={tavole} />
        </div>
      )}
    </div>
  );
}

/**
 * One plate on the sheet: the drawing, its number, and the two names the factory gave it.
 *
 * The Italian name is set first and largest because it is the name printed on the sheet the
 * member is holding; the English one is underneath, for the member who is not. The number is
 * mono, like every number in this archive — it is an identifier to be compared, not read.
 */
function TavolaPlate({ tavola }: { tavola: TavolaSummary }) {
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
        className="aspect-[4/3] transition-opacity duration-150 ease-[var(--ease-out-quick)] group-hover:opacity-85"
      />

      <div className="mt-4 flex items-baseline gap-4">
        <span className="tabular text-xl text-muted">{tavola.number}</span>
        <span className="min-w-0 flex-1 text-xl text-pretty">{tavola.nameIt}</span>
      </div>
      <div className="mt-1 flex items-baseline justify-between gap-4">
        <span className="text-sm text-muted">{tavola.nameEn}</span>
        <span className="text-2xs text-faint uppercase">{tavola.category.name}</span>
      </div>
    </Link>
  );
}
