import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { EditorPanel, Field, Refusal, Select } from '@/components/ui/field';
import {
  api,
  refusalText,
  type SpecificationNameListing,
  type Unit,
  type UnitListing,
} from '@/lib/api';

/**
 * Keeping the Units and the Specification names (issue #109) — an Administrator's. Each form is
 * the fewest fields the entry has: a Unit is its symbol, a name is its name and its Unit.
 */

/** What every screen showing either list has to forget once one of them changes. */
export function useSpecificationListsChanged() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['units'] }),
      queryClient.invalidateQueries({ queryKey: ['specification-names'] }),
    ]);
}

/** `""` in the form is no Unit at all, which is what a name that takes words has. */
const NO_UNIT = '';

function UnitChoice({
  units,
  value,
  onChange,
  disabled,
  hint,
}: {
  units: Unit[];
  value: string;
  onChange: (unitId: string) => void;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <Select
      label="Unit"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
      hint={hint}
    >
      <option value={NO_UNIT}>None, the value is words</option>
      {units.map((unit) => (
        <option key={unit.id} value={unit.id}>
          {unit.symbol}
        </option>
      ))}
    </Select>
  );
}

export function AddSpecificationName({ units, onDone }: { units: Unit[]; onDone: () => void }) {
  const [name, setName] = useState('');
  const [unitId, setUnitId] = useState(NO_UNIT);
  const listsChanged = useSpecificationListsChanged();

  const add = useMutation({
    mutationFn: () =>
      api.addSpecificationName({ name, unitId: unitId === NO_UNIT ? null : unitId }),
    onSuccess: async () => {
      await listsChanged();
      onDone();
    },
  });

  return (
    <EditorPanel
      title="Add a name"
      note="It goes at the end of the list. A name with a Unit takes a number; one without takes words, such as a material."
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
        hint="As members should read it — “Weight”, “Colour/finish”."
      />
      <UnitChoice units={units} value={unitId} onChange={setUnitId} />

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

export function CorrectSpecificationName({
  entry,
  units,
  onDone,
}: {
  entry: SpecificationNameListing;
  units: Unit[];
  onDone: () => void;
}) {
  const [name, setName] = useState(entry.name);
  const [unitId, setUnitId] = useState(entry.unit?.id ?? NO_UNIT);
  const listsChanged = useSpecificationListsChanged();
  // Values are already counted in it, so its Unit is fixed; the archive refuses it either way.
  const unitFixed = entry.parts > 0;
  const unchanged = name.trim() === entry.name && unitId === (entry.unit?.id ?? NO_UNIT);

  const correct = useMutation({
    mutationFn: () =>
      api.correctSpecificationName(entry.id, {
        name,
        ...(unitFixed ? {} : { unitId: unitId === NO_UNIT ? null : unitId }),
      }),
    onSuccess: async () => {
      await listsChanged();
      onDone();
    },
  });

  return (
    <EditorPanel
      title={`Change ${entry.name}`}
      note="A Part’s Specifications follow the new spelling everywhere at once."
      onSubmit={(event) => {
        event.preventDefault();
        correct.mutate();
      }}
    >
      <Field
        label="Name"
        autoFocus
        required
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <UnitChoice
        units={units}
        value={unitId}
        onChange={setUnitId}
        disabled={unitFixed}
        hint={
          unitFixed
            ? 'Parts already have values for this name, so its Unit stays: changing it would change what every one of those numbers means.'
            : undefined
        }
      />

      {correct.isError && <Refusal>{refusalText(correct.error)}</Refusal>}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" variant="primary" disabled={correct.isPending || unchanged}>
          {correct.isPending ? 'Saving…' : 'Save'}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </EditorPanel>
  );
}

export function AddUnit({ onDone }: { onDone: () => void }) {
  const [symbol, setSymbol] = useState('');
  const listsChanged = useSpecificationListsChanged();

  const add = useMutation({
    mutationFn: () => api.addUnit({ symbol }),
    onSuccess: async () => {
      await listsChanged();
      onDone();
    },
  });

  return (
    <EditorPanel
      title="Add a Unit"
      note="Written exactly as it should be printed beside a value. Case matters: mm and Mm are different Units."
      onSubmit={(event) => {
        event.preventDefault();
        add.mutate();
      }}
    >
      <Field
        label="Symbol"
        autoFocus
        required
        value={symbol}
        onChange={(event) => setSymbol(event.target.value)}
        hint="“psi”, “µm”, “km/h”."
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

export function RenameUnit({ unit, onDone }: { unit: UnitListing; onDone: () => void }) {
  const [symbol, setSymbol] = useState(unit.symbol);
  const listsChanged = useSpecificationListsChanged();

  const rename = useMutation({
    mutationFn: () => api.renameUnit(unit.id, { symbol }),
    onSuccess: async () => {
      await listsChanged();
      onDone();
    },
  });

  return (
    <EditorPanel
      title={`Rename ${unit.symbol}`}
      note="Every name counted in it, and every value recorded under those names, follows."
      onSubmit={(event) => {
        event.preventDefault();
        rename.mutate();
      }}
    >
      <Field
        label="Symbol"
        autoFocus
        required
        value={symbol}
        onChange={(event) => setSymbol(event.target.value)}
      />

      {rename.isError && <Refusal>{refusalText(rename.error)}</Refusal>}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="submit"
          variant="primary"
          disabled={rename.isPending || symbol.trim() === unit.symbol}
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
