import { useQuery } from '@tanstack/react-query';
import { Link, useParams, useSearch } from '@tanstack/react-router';
import { CategoryFilter } from '@/components/categories/category-filter';
import { NewTavolaForm } from '@/components/editor/new-tavola-form';
import { ModelProgress } from '@/components/progress/model-progress';
import { TavolaSheet } from '@/components/tavola-plate';
import { api } from '@/lib/api';
import { drawings, filedUnder, filterChoices, UNCATEGORISED } from '@/lib/categories';

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
  const { category: asked } = useSearch({ from: '/models/$modelId' });

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

  // A filter is only offered when it would divide the sheet. One system, or none recorded, and
  // the row would be a single choice that changes nothing.
  const choices = filterChoices(tavole);
  const chosen = choices.find((choice) => choice.slug === asked);
  const shown = chosen ? tavole.filter((tavola) => filedUnder(tavola, chosen.slug)) : tavole;

  return (
    <div className="animate-rise">
      <Link to="/" className="text-2xs text-faint uppercase hover:text-muted">
        The archive
      </Link>

      <div className="mt-3 flex flex-wrap items-baseline gap-x-6 gap-y-2">
        <h1 className="text-4xl font-semibold text-balance sm:text-5xl">
          <span className="text-muted">{model.brand}</span> {model.name}
        </h1>
        {model.series && <span className="tabular text-lg text-muted">{model.series}</span>}
        {model.modelYears && <span className="tabular text-lg text-faint">{model.modelYears}</span>}
      </div>

      <p className="mt-6 max-w-measure text-lg text-pretty text-muted">
        {tavole.length === 0
          ? 'No drawing has been recorded for this car yet.'
          : 'Open a drawing, then click the numbered position to read the part.'}
      </p>

      <NewTavolaForm modelId={modelId} className="mt-12" />

      {tavole.length > 0 && (
        <div className="mt-16">
          {choices.length > 1 && (
            <CategoryFilter
              modelId={modelId}
              choices={choices}
              total={tavole.length}
              chosen={chosen?.slug}
            />
          )}

          {/*
            What the address asked for and this car does not have — a link from another car, or
            a Category renamed since it was sent. Said plainly, with every drawing still shown
            underneath: an empty sheet would read as a car with no drawings at all.
          */}
          {asked !== undefined && !chosen && (
            <p className="mt-6 max-w-measure text-pretty text-muted" role="status">
              This car has no drawings filed under “{asked}”. Showing all {tavole.length}.
            </p>
          )}

          {/*
            The same system on every other car (story 36), offered at the moment a member has
            said which system they mean. Drawings filed under none have no such page: they are
            reached from their own car, which is here.
          */}
          {chosen && chosen.slug !== UNCATEGORISED && (
            <p className="mt-6 text-muted">
              {drawings(chosen.tavole)} on this car.{' '}
              <Link
                to="/categories/$slug"
                params={{ slug: chosen.slug }}
                className="text-accent-ink underline-offset-4 hover:underline"
                data-testid="category-across-cars"
              >
                See {chosen.name} on every car
              </Link>
            </p>
          )}
          {chosen?.slug === UNCATEGORISED && (
            <p className="mt-6 max-w-measure text-pretty text-muted">
              {drawings(chosen.tavole)} on this car not filed under a Category yet. An Editor can
              file each one from its own page.
            </p>
          )}

          <div className={choices.length > 1 ? 'mt-10' : undefined}>
            <TavolaSheet tavole={shown} />
          </div>
        </div>
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
