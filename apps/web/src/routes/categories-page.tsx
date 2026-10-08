import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { AddCategory, RenameCategory } from '@/components/categories/category-editor';
import { Button } from '@/components/ui/button';
import { api, type CategoryListing } from '@/lib/api';
import { drawings } from '@/lib/categories';
import { useSession } from '@/lib/session';

/**
 * The systems of a car — the way into the archive for somebody who knows *what* they are
 * working on before they care which car's drawing shows it best (story 36).
 *
 * Set as the catalog index is: a ruled list of plain names, each with the one number worth
 * comparing beside it. It is also where an Administrator keeps the list, and for the same
 * reason the roster is edited on the roster — the place a thing is read is the place somebody
 * notices it is wrong.
 */
export function CategoriesPage() {
  const { isAdministrator } = useSession();
  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);

  const { data, isPending, isError, error } = useQuery({
    queryKey: ['categories'],
    queryFn: api.categories,
  });

  return (
    <div className="animate-rise">
      <p className="text-lg text-muted">
        <Link to="/" className="-my-2 inline-flex min-h-control items-center hover:text-text">
          The archive
        </Link>
      </p>
      <h1 className="display mt-4 text-4xl tracking-display sm:text-5xl">Categories</h1>
      <p className="mt-6 max-w-measure text-lg text-pretty text-muted">
        The systems of a car. Choose one to see its drawings on every car in the archive, side by
        side.
      </p>

      {/* An Administrator's, and only an Administrator's. The archive enforces the role;
          leaving the button off for everybody else is so nobody is offered a refusal. */}
      {isAdministrator && (
        <div className="mt-12 max-w-2xl">
          {adding ? (
            <AddCategory onDone={() => setAdding(false)} />
          ) : (
            <Button
              onClick={() => {
                setRenaming(null);
                setAdding(true);
              }}
            >
              Add a Category
            </Button>
          )}
        </div>
      )}

      <div className="mt-16">
        {isPending && (
          <p className="text-lg text-muted" role="status">
            Reading the list…
          </p>
        )}
        {isError && (
          <p className="text-lg text-alarm" role="status">
            The archive could not be reached. {error.message}
          </p>
        )}

        {data && data.categories.length === 0 && (
          <div className="registration-mark border border-line px-8 py-16 text-center sm:py-24">
            <p className="text-xl">There are no Categories on the list yet.</p>
            <p className="mx-auto mt-3 max-w-measure text-pretty text-muted">
              An Administrator adds them. Until then every drawing is on its own car’s page.
            </p>
          </div>
        )}

        {data && data.categories.length > 0 && (
          <ul className="border-b border-line" data-testid="category-index">
            {data.categories.map((category) => (
              <li key={category.id} data-testid="category-row">
                {renaming === category.id ? (
                  <div className="max-w-2xl border-t border-line py-6">
                    <RenameCategory category={category} onDone={() => setRenaming(null)} />
                  </div>
                ) : (
                  <CategoryRow
                    category={category}
                    onRename={
                      isAdministrator
                        ? () => {
                            setAdding(false);
                            setRenaming(category.id);
                          }
                        : undefined
                    }
                  />
                )}
              </li>
            ))}
          </ul>
        )}

        {/* Said rather than listed. These drawings are not lost and are not a system; they are
            on their car's page, under a choice of their own on its filter. */}
        {data && data.uncategorised > 0 && (
          <p className="mt-6 max-w-measure text-pretty text-muted" data-testid="uncategorised">
            {drawings(data.uncategorised)} in the archive {data.uncategorised === 1 ? 'is' : 'are'}{' '}
            not filed under a Category yet. Each is still on its own car’s page, under
            “Uncategorised”.
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * One entry: the name, and how much is filed under it.
 *
 * An entry with nothing under it still leads somewhere — to a page that says so — because a
 * name on a list that cannot be pressed reads as broken, and an Administrator who has just
 * added one will press it to see.
 */
function CategoryRow({ category, onRename }: { category: CategoryListing; onRename?: () => void }) {
  return (
    <div className="category-row">
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-6 gap-y-1">
        <Link
          to="/categories/$slug"
          params={{ slug: category.slug }}
          className="category-row-link text-xl"
        >
          {category.name}
        </Link>
        <span
          className={category.tavole === 0 ? 'text-sm text-faint' : 'tabular text-sm text-muted'}
        >
          {category.tavole === 0 ? 'Nothing filed yet' : drawings(category.tavole)}
        </span>
      </div>

      {onRename && (
        <Button
          variant="ghost"
          className="category-row-action"
          onClick={onRename}
          aria-label={`Rename ${category.name}`}
        >
          Rename
        </Button>
      )}
    </div>
  );
}
