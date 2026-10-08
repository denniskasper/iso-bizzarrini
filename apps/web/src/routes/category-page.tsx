import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { TavolaSheet } from '@/components/tavola-plate';
import { api, type CategoryOnModel } from '@/lib/api';
import { drawings } from '@/lib/categories';

/**
 * One system, on every car — so the same system can be compared between cars (story 36).
 *
 * Each car is a running head and a contact sheet, exactly as a brand is a running head and a
 * list on the catalog index. The drawings are the page; everything else here only says whose
 * they are.
 */
export function CategoryPage() {
  const { slug } = useParams({ from: '/categories/$slug' });

  const { data, isPending, isError, error } = useQuery({
    queryKey: ['category', slug],
    queryFn: () => api.category(slug),
  });

  if (isPending) {
    return <p className="text-lg text-muted">Reading the catalog…</p>;
  }

  if (isError) {
    return (
      <div className="animate-rise">
        <h1 className="text-3xl font-semibold">That Category is not on the list.</h1>
        <p className="mt-6 max-w-measure text-pretty text-muted">
          It may have been renamed since the link was made. {error.message}
        </p>
        <Link
          to="/categories"
          className="mt-8 inline-block text-accent-ink underline underline-offset-4"
        >
          See the list of Categories
        </Link>
      </div>
    );
  }

  const { category, models } = data;
  const total = models.reduce((sum, { tavole }) => sum + tavole.length, 0);

  return (
    <div className="animate-rise">
      <p className="text-lg text-muted">
        <Link
          to="/categories"
          className="-my-2 inline-flex min-h-control items-center hover:text-text"
        >
          Categories
        </Link>
      </p>
      <h1 className="display mt-4 text-display text-balance">{category.name}</h1>

      {models.length === 0 ? (
        <div className="registration-mark mt-16 border border-line px-8 py-16 text-center sm:py-24">
          <p className="text-xl">No drawing is filed under {category.name} yet.</p>
          <p className="mx-auto mt-3 max-w-measure text-pretty text-muted">
            An Editor files a drawing under a Category when recording it, or afterwards from the
            drawing’s own page.
          </p>
        </div>
      ) : (
        <>
          <p
            className="mt-6 max-w-measure text-lg text-pretty text-muted"
            data-testid="category-tally"
          >
            {drawings(total)} on {models.length === 1 ? '1 car' : `${models.length} cars`}.
          </p>

          <div className="mt-16 space-y-20" data-testid="category-models">
            {models.map((onModel) => (
              <ModelShare key={onModel.model.id} slug={category.slug} onModel={onModel} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** One car's drawings of the system, under the car's own name. */
function ModelShare({ slug, onModel }: { slug: string; onModel: CategoryOnModel }) {
  const { model, tavole } = onModel;
  const headingId = `model-${model.id}`;

  return (
    <section aria-labelledby={headingId} data-testid="category-model">
      <div className="flex items-baseline gap-4">
        <h2 id={headingId} className="text-xl">
          {/* To the car, already narrowed to this system: a member who came here to compare
              brakes and picks a car wants that car's brakes, not all sixty of its drawings. */}
          <Link
            to="/models/$modelId"
            params={{ modelId: model.id }}
            search={{ category: slug }}
            className="underline-offset-4 hover:underline"
          >
            <span className="text-muted">{model.brand}</span> {model.name}
          </Link>
        </h2>
        <span className="h-px flex-1 bg-line" />
        <span className="tabular text-xs text-faint">{tavole.length}</span>
      </div>

      <div className="mt-8">
        <TavolaSheet tavole={tavole} nameCategory={false} />
      </div>
    </section>
  );
}
