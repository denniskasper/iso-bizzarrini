import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { EditorPanel, Field, Refusal } from '@/components/ui/field';
import { api, type NewModelRequest } from '@/lib/api';
import { cn } from '@/lib/utils';

const EMPTY: NewModelRequest = { brand: '', name: '', series: '', modelYears: '' };

/**
 * Recording a car, so that its Tavole have somewhere to live (story 92).
 *
 * Closed until an Editor asks for it. A member reading the archive should not be looking at a
 * form, and there is one dominant action on the catalog page — opening a car.
 */
export function NewModelForm({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [model, setModel] = useState(EMPTY);
  const queryClient = useQueryClient();

  const create = useMutation({
    mutationFn: () => api.createModel(model),
    onSuccess: async () => {
      setModel(EMPTY);
      setOpen(false);
      await queryClient.invalidateQueries({ queryKey: ['models'] });
    },
  });

  if (!open) {
    return (
      <div className={className}>
        <Button onClick={() => setOpen(true)}>Add a car</Button>
      </div>
    );
  }

  return (
    <div className={cn('max-w-2xl', className)}>
      <EditorPanel
        title="A new car"
        note="As the factory catalogs distinguish them. Leave series or years empty where the catalog does not go that far."
        onSubmit={(event) => {
          event.preventDefault();
          create.mutate();
        }}
      >
        <div className="grid gap-6 sm:grid-cols-2">
          <Field
            label="Brand"
            required
            value={model.brand}
            onChange={(event) => setModel({ ...model, brand: event.target.value })}
          />
          <Field
            label="Model"
            required
            value={model.name}
            onChange={(event) => setModel({ ...model, name: event.target.value })}
          />
          <Field
            label="Series"
            mono
            value={model.series}
            onChange={(event) => setModel({ ...model, series: event.target.value })}
          />
          <Field
            label="Model years"
            mono
            hint="As the catalog writes them — 1965–68, from 1965."
            value={model.modelYears}
            onChange={(event) => setModel({ ...model, modelYears: event.target.value })}
          />
        </div>

        {create.isError && <Refusal>{create.error.message}</Refusal>}

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="primary" disabled={create.isPending}>
            {create.isPending ? 'Recording…' : 'Record this car'}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
      </EditorPanel>
    </div>
  );
}
