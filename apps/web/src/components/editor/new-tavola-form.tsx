import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { EditorPanel, Field, Refusal } from '@/components/ui/field';
import { api, type NewTavolaRequest } from '@/lib/api';
import { cn } from '@/lib/utils';

const EMPTY: NewTavolaRequest = {
  number: '',
  nameIt: '',
  nameEn: '',
  category: '',
  catalogSection: '',
  catalogGroup: '',
  catalogSubgroup: '',
};

/**
 * Recording a drawing (story 95). The scan is uploaded on the Tavola's own page afterwards,
 * because **a Tavola with no scan is a legitimate state** — a sheet can be transcribed from a
 * photocopy long before anyone has the original in front of a scanner.
 *
 * The form is laid out in the order the sheet is: the number and the two names as printed, then
 * the Category the archive navigates by, then the factory's own header transcribed verbatim.
 */
export function NewTavolaForm({ modelId, className }: { modelId: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const [tavola, setTavola] = useState(EMPTY);
  const queryClient = useQueryClient();

  // A Category groups tavole across every car, so the one thing that must not happen is
  // "Fuel System" and "Fuel system" becoming two. The slug already prevents that at the API;
  // this is the same rule made visible, so an Editor picks the existing one and never learns
  // about it by being corrected.
  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: api.categories,
    enabled: open,
  });

  const create = useMutation({
    mutationFn: () => api.createTavola(modelId, tavola),
    onSuccess: async () => {
      setTavola(EMPTY);
      setOpen(false);
      await queryClient.invalidateQueries({ queryKey: ['model', modelId] });
    },
  });

  const set = (field: keyof NewTavolaRequest) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setTavola({ ...tavola, [field]: event.target.value });

  if (!open) {
    return (
      <div className={className}>
        <Button onClick={() => setOpen(true)}>Add a drawing</Button>
      </div>
    );
  }

  return (
    <div className={cn('max-w-2xl', className)}>
      <EditorPanel
        title="A new drawing"
        note="The scan is uploaded on the drawing’s own page. Record the sheet first."
        onSubmit={(event) => {
          event.preventDefault();
          create.mutate();
        }}
      >
        <div className="grid gap-6 sm:grid-cols-2">
          <Field
            label="Tavola number"
            mono
            required
            hint="As printed on the sheet."
            value={tavola.number}
            onChange={set('number')}
          />
          <Field
            label="Category"
            required
            hint="The system of the car. Grouped across every car in the archive."
            suggestions={categories?.categories.map((category) => category.name)}
            value={tavola.category}
            onChange={set('category')}
          />
          <Field label="Italian name" required value={tavola.nameIt} onChange={set('nameIt')} />
          <Field label="English name" required value={tavola.nameEn} onChange={set('nameEn')} />
        </div>

        <fieldset className="border-t border-line pt-6">
          <legend className="sr-only">The factory’s own classification</legend>
          <p className="max-w-measure text-sm text-pretty text-muted">
            The factory's own classification, printed at the head of the sheet. Recorded exactly as
            it is written there — nothing navigates by it, so nothing may tidy it up.
          </p>
          <div className="mt-6 grid gap-6 sm:grid-cols-3">
            <Field
              label="Sezione"
              mono
              value={tavola.catalogSection}
              onChange={set('catalogSection')}
            />
            <Field label="Gruppo" mono value={tavola.catalogGroup} onChange={set('catalogGroup')} />
            <Field
              label="Sottogruppo"
              mono
              value={tavola.catalogSubgroup}
              onChange={set('catalogSubgroup')}
            />
          </div>
        </fieldset>

        {create.isError && <Refusal>{create.error.message}</Refusal>}

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="primary" disabled={create.isPending}>
            {create.isPending ? 'Recording…' : 'Record this drawing'}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
      </EditorPanel>
    </div>
  );
}
