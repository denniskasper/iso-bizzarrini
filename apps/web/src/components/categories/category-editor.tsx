import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { EditorPanel, Field, Refusal } from '@/components/ui/field';
import { api, refusalText, type Category } from '@/lib/api';

/**
 * Keeping the list (issue #8) — an Administrator's, and the only two things that can be done to
 * it: an entry is added, or an entry is renamed.
 *
 * **A Category is a name and nothing else**, so each form is one field. There is no code to
 * assign and no order to arrange; the list is alphabetical because that is how anybody looks a
 * system up.
 *
 * There is no removing an entry here, on purpose. Drawings are filed under these, on every car,
 * and an entry nobody uses costs a line on a list.
 */

/** What every screen showing a Category has to forget once the list changes. */
function useListChanged() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['categories'] }),
      queryClient.invalidateQueries({ queryKey: ['category'] }),
      // A renamed Category is renamed on every plate and every drawing that carries it.
      queryClient.invalidateQueries({ queryKey: ['model'] }),
      queryClient.invalidateQueries({ queryKey: ['tavola'] }),
    ]);
}

export function AddCategory({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('');
  const listChanged = useListChanged();

  const add = useMutation({
    mutationFn: () => api.addCategory({ name }),
    onSuccess: async () => {
      await listChanged();
      onDone();
    },
  });

  return (
    <EditorPanel
      title="Add a Category"
      note="A system of the car, by name. Editors can file drawings under it as soon as it is on the list."
      onSubmit={(event) => {
        event.preventDefault();
        add.mutate();
      }}
    >
      <Field
        label="Name"
        autoFocus
        required
        value={name}
        onChange={(event) => setName(event.target.value)}
        hint="As members should read it — “Gearbox”, “Heating and Ventilation”."
      />

      {add.isError && <Refusal>{refusalText(add.error)}</Refusal>}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" variant="primary" disabled={add.isPending}>
          {add.isPending ? 'Adding…' : 'Add to the list'}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </EditorPanel>
  );
}

export function RenameCategory({ category, onDone }: { category: Category; onDone: () => void }) {
  const [name, setName] = useState(category.name);
  const listChanged = useListChanged();

  const rename = useMutation({
    mutationFn: () => api.renameCategory(category.id, { name }),
    onSuccess: async () => {
      await listChanged();
      onDone();
    },
  });

  return (
    <EditorPanel
      title={`Rename ${category.name}`}
      note="Every drawing filed under it follows, on every car. Its address changes with its name, so a link somebody saved to the old one stops working."
      onSubmit={(event) => {
        event.preventDefault();
        rename.mutate();
      }}
    >
      <Field
        label="Name"
        autoFocus
        required
        value={name}
        onChange={(event) => setName(event.target.value)}
      />

      {rename.isError && <Refusal>{refusalText(rename.error)}</Refusal>}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="submit"
          variant="primary"
          disabled={rename.isPending || name.trim() === category.name}
        >
          {rename.isPending ? 'Renaming…' : 'Rename'}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </EditorPanel>
  );
}
