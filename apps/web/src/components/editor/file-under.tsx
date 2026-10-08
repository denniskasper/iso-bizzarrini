import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Refusal, Select } from '@/components/ui/field';
import { api, refusalText, type Category } from '@/lib/api';

/**
 * Filing a drawing under a system of the car, after it has been recorded (issue #8).
 *
 * A Category is the one thing about a Tavola that is not copied off the sheet, so it is the one
 * thing that can be decided later — and has to be changeable, since the list it is chosen from
 * is an Administrator's and gains entries over time.
 *
 * **Choosing is the whole action.** There is no button, because there is nothing to compose: the
 * list is the list, and a second press to confirm one of thirteen names would be a press that
 * exists only to be pressed. What was chosen is what the heading above the drawing then says.
 */
export function FileUnder({
  tavolaId,
  modelId,
  category,
}: {
  tavolaId: string;
  modelId: string;
  category: Category | null;
}) {
  const queryClient = useQueryClient();

  const { data } = useQuery({ queryKey: ['categories'], queryFn: api.categories });

  const file = useMutation({
    mutationFn: (slug: string) => api.categoriseTavola(tavolaId, { category: slug }),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['tavola', tavolaId] }),
        queryClient.invalidateQueries({ queryKey: ['model', modelId] }),
        // The counts on the list, and both systems' pages, have just changed.
        queryClient.invalidateQueries({ queryKey: ['categories'] }),
        queryClient.invalidateQueries({ queryKey: ['category'] }),
      ]),
  });

  return (
    <section aria-labelledby="file-under">
      <h2 id="file-under" className="text-2xs text-muted uppercase">
        File this drawing
      </h2>
      <p className="mt-4 max-w-measure text-pretty text-muted">
        The system of the car it shows. It is how a member finds this drawing beside the same system
        on other cars.
      </p>

      <Select
        label="Category"
        className="mt-6 max-w-sm"
        value={category?.slug ?? ''}
        disabled={file.isPending || !data}
        onChange={(event) => file.mutate(event.target.value)}
        hint="From the Club’s list, which an Administrator keeps."
      >
        <option value="">No Category yet</option>
        {data?.categories.map((listed) => (
          <option key={listed.id} value={listed.slug}>
            {listed.name}
          </option>
        ))}
      </Select>

      {file.isError && (
        <div className="mt-4">
          <Refusal>{refusalText(file.error)}</Refusal>
        </div>
      )}
    </section>
  );
}
