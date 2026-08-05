import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { NewModelForm } from '@/components/editor/new-model-form';
import { Roundel } from '@/components/wordmark';
import { api, type CatalogModel } from '@/lib/api';

/**
 * The catalog index — where a member starts, by finding their car.
 *
 * Laid out as the index page of a printed catalog rather than as a table: the brand is a
 * running head, each Model a ruled row, and every number the factory printed is set in mono.
 */
export function CatalogPage() {
  const { data, isPending, isError, error } = useQuery({
    queryKey: ['models'],
    queryFn: api.models,
  });

  return (
    <div className="animate-rise">
      <p className="text-2xs text-faint uppercase">The archive</p>
      <h1 className="mt-3 text-4xl font-semibold text-balance sm:text-5xl">Covered cars</h1>
      <p className="mt-6 max-w-measure text-lg text-pretty text-muted">
        Choose a car, open the factory drawing, click the numbered position, read the part.
      </p>

      {/*
        And the other way in, said on the front door rather than only in the chrome. Half the time
        a restorer does not begin at the car — they begin holding a bracket with a number stamped
        on it — and a screen offering nothing but a list of cars is exactly where that member is
        stuck.

        A link and not a second field. This page has one dominant action, which is choosing a car;
        a search box here would be a second form competing with it, and the field itself is one
        press away and already focused when it gets there.
      */}
      <p className="mt-6 max-w-measure text-lg text-pretty">
        <Link
          to="/search"
          className="text-accent-ink underline-offset-4 hover:underline"
          data-testid="search-from-the-catalog"
        >
          Or start from a number stamped on the part
        </Link>
      </p>

      <NewModelForm className="mt-12" />

      <div className="mt-16">
        {isPending && <Notice>Reading the catalog…</Notice>}
        {isError && <Notice tone="alarm">The archive could not be reached. {error.message}</Notice>}
        {data && <ModelIndex models={data.models} />}
      </div>
    </div>
  );
}

function ModelIndex({ models }: { models: CatalogModel[] }) {
  if (models.length === 0) {
    return (
      <div className="registration-mark border border-line px-8 py-16 text-center sm:py-24">
        <Roundel className="mx-auto size-7 text-line-strong" />
        <p className="mt-6 text-xl">No cars have been recorded yet.</p>
        <p className="mx-auto mt-3 max-w-measure text-pretty text-muted">
          An Editor records a car first, then the drawings the factory made of it.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-16" data-testid="model-index">
      {groupByBrand(models).map(([brand, brandModels]) => (
        <section key={brand} aria-labelledby={`brand-${brand}`}>
          <div className="flex items-baseline gap-4">
            <h2 id={`brand-${brand}`} className="text-2xs text-muted uppercase">
              {brand}
            </h2>
            <span className="h-px flex-1 bg-line" />
            <span className="tabular text-2xs text-faint">{brandModels.length}</span>
          </div>

          {/* Ruled top and bottom, so a brand's list closes the way a printed table does. */}
          <ul className="mt-2 border-b border-line">
            {brandModels.map((model) => (
              <li key={model.id} data-testid="model-row">
                <Link
                  to="/models/$modelId"
                  params={{ modelId: model.id }}
                  className="catalog-row"
                  aria-label={`${model.brand} ${model.name}`}
                >
                  <span className="text-xl">{model.name}</span>
                  <span className="tabular text-sm text-muted">{model.series ?? ''}</span>
                  <span className="tabular text-sm text-faint sm:text-right">
                    {model.modelYears ?? ''}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function Notice({
  children,
  tone = 'plain',
}: {
  children: React.ReactNode;
  tone?: 'plain' | 'alarm';
}) {
  return (
    <p
      className={tone === 'alarm' ? 'text-lg text-accent-ink' : 'text-lg text-muted'}
      role="status"
    >
      {children}
    </p>
  );
}

/** The API already orders by brand, then model, then series; this only cuts it into groups. */
function groupByBrand(models: CatalogModel[]): [string, CatalogModel[]][] {
  const groups = new Map<string, CatalogModel[]>();
  for (const model of models) {
    const existing = groups.get(model.brand);
    if (existing) {
      existing.push(model);
    } else {
      groups.set(model.brand, [model]);
    }
  }
  return [...groups.entries()];
}
