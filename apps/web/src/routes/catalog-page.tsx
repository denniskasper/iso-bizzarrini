import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { NewModelForm } from '@/components/editor/new-model-form';
import { Roundel } from '@/components/wordmark';
import { api, type CatalogModel } from '@/lib/api';

/**
 * The catalog index — where a member starts, by finding their car.
 *
 * One car per band, its name in the display face at poster size, the way a showroom hangs one
 * car per wall. The brand heads its cars; every number the factory printed is set in mono.
 */
export function CatalogPage() {
  const { data, isPending, isError, error } = useQuery({
    queryKey: ['models'],
    queryFn: api.models,
  });

  return (
    // On a desk the words that open the archive sit beside its list of cars rather than above
    // it, so every car is on the first screen of a laptop; on a phone they are the next thing down.
    <div className="animate-rise lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start lg:gap-x-16">
      <div>
        <h1 className="display text-4xl tracking-display sm:text-5xl">Covered cars</h1>
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
        {/* And the third way in: by the system being worked on, whichever car it is on. */}
        <p className="mt-2 max-w-measure text-lg text-pretty">
          <Link
            to="/categories"
            className="text-accent-ink underline-offset-4 hover:underline"
            data-testid="categories-from-the-catalog"
          >
            Or compare one system across every car
          </Link>
        </p>

        <NewModelForm className="mt-12" />
      </div>

      <div className="mt-16 lg:mt-0">
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
    <div className="space-y-20 lg:space-y-10" data-testid="model-index">
      {groupByBrand(models).map(([brand, brandModels]) => (
        <section key={brand} aria-labelledby={`brand-${brand}`}>
          <h2 id={`brand-${brand}`} className="text-lg text-muted">
            {brand}
          </h2>

          {/* Ruled top and bottom, so a brand's cars close the way a printed table does. */}
          <ul className="mt-3 border-b border-line">
            {brandModels.map((model) => (
              <li key={model.id} data-testid="model-row">
                <Link
                  to="/models/$modelId"
                  params={{ modelId: model.id }}
                  className="catalog-row"
                  aria-label={`${model.brand} ${model.name}`}
                >
                  <span className="catalog-name display text-display text-balance">
                    {model.name}
                  </span>
                  <span className="sm:pb-2 sm:text-right">
                    <span className="tabular block text-muted">{model.series ?? ''}</span>
                    <span className="tabular block">{model.modelYears ?? ''}</span>
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
    <p className={tone === 'alarm' ? 'text-lg text-alarm' : 'text-lg text-muted'} role="status">
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
