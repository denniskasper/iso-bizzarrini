import { useMutation, useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState, type ReactNode } from 'react';
import {
  AddSpecificationName,
  AddUnit,
  CorrectSpecificationName,
  RenameUnit,
  useSpecificationListsChanged,
} from '@/components/specifications/specification-editor';
import { Button } from '@/components/ui/button';
import { Refusal } from '@/components/ui/field';
import { api, refusalText, type SpecificationNameListing, type UnitListing } from '@/lib/api';
import { useSession } from '@/lib/session';

/**
 * The Units and the Specification names (issue #109): what a Part's material, colour, dimensions
 * and weight are recorded under, and what they are counted in. Next to the Categories and kept
 * the same way, by an Administrator, on the screen where the list is read.
 *
 * **The names are numbered because they are a sequence**: the order here is the order a Part's
 * Specifications read in. Reordering is two buttons per row rather than dragging, because a
 * drag is the one gesture a cold hand on a phone gets wrong.
 */
export function SpecificationsPage() {
  const { isAdministrator } = useSession();
  const [editing, setEditing] = useState<string | null>(null);

  const names = useQuery({ queryKey: ['specification-names'], queryFn: api.specificationNames });
  const units = useQuery({ queryKey: ['units'], queryFn: api.units });
  const listsChanged = useSpecificationListsChanged();

  const order = useMutation({
    mutationFn: (nameIds: string[]) => api.orderSpecificationNames({ nameIds }),
    onSettled: listsChanged,
  });
  const removeName = useMutation({
    mutationFn: (nameId: string) => api.removeSpecificationName(nameId),
    onSettled: listsChanged,
  });
  const removeUnit = useMutation({
    mutationFn: (unitId: string) => api.removeUnit(unitId),
    onSettled: listsChanged,
  });
  const refused = [order, removeName, removeUnit].find((mutation) => mutation.isError)?.error;

  /** One form open at a time, so the screen never holds two half-finished changes. */
  const edit = (what: string | null) => {
    for (const mutation of [order, removeName, removeUnit]) {
      mutation.reset();
    }
    setEditing(what);
  };

  function move(index: number, by: -1 | 1) {
    const ids = (names.data?.specificationNames ?? []).map((entry) => entry.id);
    const [moved] = ids.splice(index, 1);
    if (moved === undefined) {
      return;
    }
    ids.splice(index + by, 0, moved);
    edit(null);
    order.mutate(ids);
  }

  const unitList = units.data?.units ?? [];
  const nameList = names.data?.specificationNames ?? [];

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
      <h1 className="display mt-4 text-4xl tracking-display sm:text-5xl">Specifications</h1>
      <p className="mt-6 max-w-measure text-lg text-pretty text-muted">
        What a Part’s material, colour, dimensions and weight are recorded under, and the Units they
        are counted in. Each is written one way only, so two Parts can always be compared.
      </p>

      {(names.isError || units.isError) && (
        <p className="mt-12 text-lg text-alarm" role="status">
          The archive could not be reached. {(names.error ?? units.error)?.message}
        </p>
      )}
      {refused && (
        <div className="mt-12 max-w-2xl">
          <Refusal>{refusalText(refused)}</Refusal>
        </div>
      )}

      <section className="mt-16" aria-labelledby="names-heading">
        <h2 id="names-heading" className="text-2xl">
          Names
        </h2>
        <p className="mt-2 max-w-measure text-pretty text-muted">
          A Part’s Specifications read in this order.
        </p>

        {isAdministrator && (
          <div className="mt-8 max-w-2xl">
            {editing === 'add-name' ? (
              <AddSpecificationName units={unitList} onDone={() => edit(null)} />
            ) : (
              <Button onClick={() => edit('add-name')}>Add a name</Button>
            )}
          </div>
        )}

        {names.isPending && (
          <p className="mt-8 text-lg text-muted" role="status">
            Reading the list…
          </p>
        )}
        {names.data && nameList.length === 0 && (
          <p className="mt-8 max-w-measure text-pretty text-muted">
            There are no names on the list yet. An Administrator adds them.
          </p>
        )}
        {nameList.length > 0 && (
          <ol className="mt-8 border-b border-line" data-testid="specification-names">
            {nameList.map((entry, index) => (
              <li key={entry.id} data-testid="specification-name">
                {editing === entry.id ? (
                  <div className="max-w-2xl border-t border-line py-6">
                    <CorrectSpecificationName
                      entry={entry}
                      units={unitList}
                      onDone={() => edit(null)}
                    />
                  </div>
                ) : (
                  <NameRow
                    entry={entry}
                    place={index + 1}
                    actions={
                      isAdministrator && (
                        <>
                          <Button
                            variant="ghost"
                            disabled={index === 0 || order.isPending}
                            onClick={() => move(index, -1)}
                            aria-label={`Move ${entry.name} up`}
                          >
                            Up
                          </Button>
                          <Button
                            variant="ghost"
                            disabled={index === nameList.length - 1 || order.isPending}
                            onClick={() => move(index, 1)}
                            aria-label={`Move ${entry.name} down`}
                          >
                            Down
                          </Button>
                          <Button
                            variant="ghost"
                            onClick={() => edit(entry.id)}
                            aria-label={`Change ${entry.name}`}
                          >
                            Change
                          </Button>
                          {/* Offered only while nothing is recorded under it; the archive
                              refuses it otherwise, and nobody should be offered a refusal. */}
                          {entry.parts === 0 && (
                            <Button
                              variant="ghost"
                              disabled={removeName.isPending}
                              onClick={() => {
                                edit(null);
                                removeName.mutate(entry.id);
                              }}
                              aria-label={`Remove ${entry.name}`}
                            >
                              Remove
                            </Button>
                          )}
                        </>
                      )
                    }
                  />
                )}
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="mt-20" aria-labelledby="units-heading">
        <h2 id="units-heading" className="text-2xl">
          Units
        </h2>
        <p className="mt-2 max-w-measure text-pretty text-muted">
          A name fixes the Unit its values are counted in, so an Editor never types one.
        </p>

        {isAdministrator && (
          <div className="mt-8 max-w-2xl">
            {editing === 'add-unit' ? (
              <AddUnit onDone={() => edit(null)} />
            ) : (
              <Button onClick={() => edit('add-unit')}>Add a Unit</Button>
            )}
          </div>
        )}

        {units.isPending && (
          <p className="mt-8 text-lg text-muted" role="status">
            Reading the list…
          </p>
        )}
        {units.data && unitList.length === 0 && (
          <p className="mt-8 max-w-measure text-pretty text-muted">
            There are no Units on the list yet. An Administrator adds them.
          </p>
        )}
        {unitList.length > 0 && (
          <ul className="mt-8 border-b border-line" data-testid="units">
            {unitList.map((unit) => (
              <li key={unit.id} data-testid="unit">
                {editing === unit.id ? (
                  <div className="max-w-2xl border-t border-line py-6">
                    <RenameUnit unit={unit} onDone={() => edit(null)} />
                  </div>
                ) : (
                  <UnitRow
                    unit={unit}
                    actions={
                      isAdministrator && (
                        <>
                          <Button
                            variant="ghost"
                            onClick={() => edit(unit.id)}
                            aria-label={`Rename ${unit.symbol}`}
                          >
                            Rename
                          </Button>
                          {unit.names === 0 && (
                            <Button
                              variant="ghost"
                              disabled={removeUnit.isPending}
                              onClick={() => {
                                edit(null);
                                removeUnit.mutate(unit.id);
                              }}
                              aria-label={`Remove ${unit.symbol}`}
                            >
                              Remove
                            </Button>
                          )}
                        </>
                      )
                    }
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** One name: its place, the name, and what its value is counted in. */
function NameRow({
  entry,
  place,
  actions,
}: {
  entry: SpecificationNameListing;
  place: number;
  actions: ReactNode;
}) {
  return (
    <div className="specification-row">
      <span className="tabular w-8 shrink-0 text-sm text-faint" aria-hidden="true">
        {place}
      </span>
      <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-6 gap-y-1">
        <span className="text-xl" data-testid="specification-name-text">
          {entry.name}
        </span>
        <span className="text-sm text-muted">
          {entry.unit ? (
            <>
              in <span className="text-text">{entry.unit.symbol}</span>
            </>
          ) : (
            'words'
          )}
        </span>
        {entry.parts > 0 && (
          <span className="tag tabular">
            {entry.parts === 1 ? 'Recorded on 1 Part' : `Recorded on ${entry.parts} Parts`}
          </span>
        )}
      </div>
      {actions && <div className="flex flex-wrap justify-end gap-1">{actions}</div>}
    </div>
  );
}

/** One Unit: the symbol at the size it matters at, and how many names count in it. */
function UnitRow({ unit, actions }: { unit: UnitListing; actions: ReactNode }) {
  return (
    <div className="specification-row">
      <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-6 gap-y-1">
        <span className="min-w-16 text-xl" data-testid="unit-symbol">
          {unit.symbol}
        </span>
        <span className="tag tabular">
          {unit.names === 0
            ? 'No name counted in it'
            : unit.names === 1
              ? '1 name counted in it'
              : `${unit.names} names counted in it`}
        </span>
      </div>
      {actions && <div className="flex flex-wrap justify-end gap-1">{actions}</div>}
    </div>
  );
}
