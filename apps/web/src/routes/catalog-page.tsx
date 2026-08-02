import { useQuery } from '@tanstack/react-query';
import { Roundel } from '@/components/wordmark';
import { api, type CatalogModel } from '@/lib/api';

/**
 * The catalog index — the skeleton's one route that travels the whole path, browser to API to
 * database and back.
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
        <p className="mt-6 text-xl">No Models have been recorded yet.</p>
        <p className="mx-auto mt-3 max-w-measure text-pretty text-muted">
          Every layer is wired together — this page reached the API, and the API reached the
          database to ask. Models, Tavole and their scans arrive with the next ticket.
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
                <div className="catalog-row">
                  <span className="text-xl">{model.name}</span>
                  <span className="tabular text-sm text-muted">{model.series ?? ''}</span>
                  <span className="tabular text-sm text-faint sm:text-right">
                    {model.modelYears ?? ''}
                  </span>
                </div>
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
