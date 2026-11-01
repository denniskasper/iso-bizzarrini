import type { ProcessorRecord } from '@ricambi/contracts';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field, Refusal } from '@/components/ui/field';
import { refusalText } from '@/lib/api';
import { PROCESSOR_WORK, useNameProcessor, useProcessors, useRemoveProcessor } from '@/lib/legal';

/**
 * **Who handles members' data on the association's behalf**, and whether the agreement with each
 * of them is signed (issue #9).
 *
 * Two jobs on one list, because they are the same list. What is written here is what the privacy
 * statement names — so changing the e-mail provider is an afternoon on this screen — and it is
 * also the association's own record of its processor agreements, which the statement does not
 * show. None may be outstanding when real members' data arrives, and "outstanding" is said here
 * in words rather than left to be remembered.
 *
 * One form per kind and not one form for all five: each is a separate fact with a separate
 * contract behind it, and saving the host must not depend on having decided about payments.
 */
export function Processors() {
  const processors = useProcessors();

  if (processors.isPending) {
    return null;
  }

  if (processors.isError) {
    return <p className="text-pretty text-muted">The processors could not be read just now.</p>;
  }

  const named = processors.data.processors;
  const outstanding = named.filter((processor) => processor.agreementSignedOn === null);
  // Signed agreements with everybody named is not the finish line while nobody is written down
  // for something Ricambi cannot run without.
  const missing = PROCESSOR_WORK.filter(
    (work) => work.needed && !named.some((processor) => processor.role === work.role),
  ).map((work) => work.title.toLowerCase());

  return (
    <section className="mt-16 border-t border-line pt-8" data-testid="processors">
      <h2 className="text-2xl text-balance">Who handles members’ data</h2>
      <p className="mt-4 text-pretty text-muted">
        The companies that run part of Ricambi for the Club. The privacy statement names each one
        written here; whether its agreement is signed is the Club’s own record and is not published.
      </p>
      <p className="mt-4 text-pretty text-text" role="status" data-testid="agreements-standing">
        {standing(named.length, outstanding.length)}
        {missing.length > 0 && <> Still to be named: {missing.join(', ')}.</>}
      </p>

      <div className="mt-8 flex flex-col">
        {PROCESSOR_WORK.map((work) => {
          const processor = named.find((candidate) => candidate.role === work.role) ?? null;

          return (
            <ProcessorForm
              // Kept mounted when somebody is named for the first time: remounting it then threw
              // the save away with the form, and "Saved." never appeared after the first save.
              key={work.role}
              work={work}
              processor={processor}
            />
          );
        })}
      </div>
    </section>
  );
}

/** Where the paperwork stands, in a sentence somebody can read out at a board meeting. */
function standing(named: number, outstanding: number): string {
  if (named === 0) {
    return 'Nobody is named yet.';
  }
  if (outstanding === 0) {
    return named === 1
      ? 'One processor is named, and its agreement is signed.'
      : `${named} processors are named, and every agreement is signed.`;
  }
  return outstanding === 1
    ? `One agreement is outstanding, of ${named} named.`
    : `${outstanding} agreements are outstanding, of ${named} named.`;
}

function ProcessorForm({
  work,
  processor,
}: {
  work: (typeof PROCESSOR_WORK)[number];
  processor: ProcessorRecord | null;
}) {
  const [name, setName] = useState(processor?.name ?? '');
  const [location, setLocation] = useState(processor?.location ?? '');
  const [signedOn, setSignedOn] = useState(processor?.agreementSignedOn ?? '');
  const save = useNameProcessor();
  const remove = useRemoveProcessor();
  const failure = save.error ?? remove.error;

  return (
    <form
      aria-label={work.title}
      className="flex flex-col gap-5 border-t border-line py-8 first:border-t-0 first:pt-0"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate({ role: work.role, name, location, agreementSignedOn: signedOn || null });
      }}
    >
      <div>
        <h3 className="label">{work.title}</h3>
        <p className="mt-1 text-sm text-pretty text-faint">{work.does}</p>
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Company" value={name} onChange={(event) => setName(event.target.value)} />
        <Field
          label="Where the data is handled"
          value={location}
          onChange={(event) => setLocation(event.target.value)}
          hint="A country is enough."
        />
      </div>
      <Field
        label="Agreement signed on"
        type="date"
        mono
        className="sm:max-w-xs"
        value={signedOn}
        onChange={(event) => setSignedOn(event.target.value)}
        hint="Leave it empty while the processor agreement is outstanding."
      />

      {failure && <Refusal>{refusalText(failure)}</Refusal>}

      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? 'Saving…' : `Save ${work.title.toLowerCase()}`}
        </Button>
        {processor && (
          <Button
            type="button"
            variant="ghost"
            disabled={remove.isPending}
            onClick={() =>
              remove.mutate(work.role, {
                // A row that was just removed comes back empty rather than still showing what
                // was typed, and without the "Saved." of the save before it.
                onSuccess: () => {
                  setName('');
                  setLocation('');
                  setSignedOn('');
                  save.reset();
                },
              })
            }
          >
            Remove
          </Button>
        )}
        {save.isSuccess && !save.isPending && <span className="text-sm text-faint">Saved.</span>}
      </div>
    </form>
  );
}
