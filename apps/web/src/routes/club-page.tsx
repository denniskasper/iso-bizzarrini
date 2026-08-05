import type { ClubRecord, Currency } from '@ricambi/contracts';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field, Refusal, Select, TextArea } from '@/components/ui/field';
import { AdministratorsOnly } from '@/components/roster/administrators-only';
import { refusalText } from '@/lib/api';
import { CURRENCIES } from '@/lib/money';
import { useClub, useCorrectClub } from '@/lib/roster';

/**
 * The Club's own record — what membership costs, where the money goes, how a member should label
 * their transfer, and what a renewal reminder will say.
 *
 * **The whole reason this screen exists is that a change of bank must not need a developer**
 * (story 130). Nothing on it is a rule the software enforces: it is what the association says
 * about itself, and this application's job is to hold it and hand it back unaltered.
 */
export function ClubPage() {
  return (
    <AdministratorsOnly what="The Club's own record">
      <TheClub />
    </AdministratorsOnly>
  );
}

function TheClub() {
  const club = useClub();

  if (club.isPending) {
    return null;
  }

  if (club.isError) {
    return <p className="text-lg text-pretty text-muted">The Club could not be read just now.</p>;
  }

  return <ClubForm club={club.data.club} />;
}

function ClubForm({ club }: { club: ClubRecord }) {
  // Keyed by nothing and seeded once: this is a form somebody sits and fills in, not a live view,
  // and a re-render that threw away half-typed bank details would be its own small disaster.
  const [draft, setDraft] = useState<ClubRecord>(club);
  const save = useCorrectClub();

  const set = <K extends keyof ClubRecord>(key: K, value: ClubRecord[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  return (
    <div className="mx-auto max-w-measure animate-rise">
      <h1 className="text-4xl font-semibold text-balance">The Club</h1>
      <p className="mt-6 text-lg text-pretty text-muted">
        What membership costs, where the money goes, and what a member is asked to write on their
        transfer. All of it changes here rather than in a deployment.
      </p>

      <form
        className="mt-12 flex flex-col gap-8"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate(draft);
        }}
      >
        <section className="flex flex-col gap-6">
          <h2 className="text-2xs text-muted uppercase">Membership</h2>
          <div className="grid gap-6 sm:grid-cols-2">
            <Field
              label="Fee"
              mono
              inputMode="decimal"
              value={draft.fee}
              onChange={(event) => set('fee', event.target.value)}
              hint="What a year of membership costs. Write 0 if the Club does not charge one."
            />
            <Select
              label="Currency"
              mono
              value={draft.currency}
              onChange={(event) => set('currency', event.target.value as Currency)}
            >
              {CURRENCIES.map((currency) => (
                <option key={currency} value={currency}>
                  {currency}
                </option>
              ))}
            </Select>
          </div>
        </section>

        <section className="flex flex-col gap-6 border-t border-line pt-8">
          <h2 className="text-2xs text-muted uppercase">Where a transfer goes</h2>
          <Field
            label="Account holder"
            value={draft.bankAccountHolder ?? ''}
            onChange={(event) => set('bankAccountHolder', event.target.value)}
          />
          <Field
            label="Bank"
            value={draft.bankName ?? ''}
            onChange={(event) => set('bankName', event.target.value)}
          />
          <div className="grid gap-6 sm:grid-cols-2">
            {/* An IBAN and a BIC are identifiers copied character by character into a banking
                app, so they are set in the mono face like every other number in this archive. */}
            <Field
              label="IBAN"
              mono
              value={draft.iban ?? ''}
              onChange={(event) => set('iban', event.target.value)}
            />
            <Field
              label="BIC"
              mono
              value={draft.bic ?? ''}
              onChange={(event) => set('bic', event.target.value)}
            />
          </div>
        </section>

        <section className="flex flex-col gap-6 border-t border-line pt-8">
          <h2 className="text-2xs text-muted uppercase">What a member is told</h2>
          <Field
            label="Payment reference"
            value={draft.paymentReference}
            onChange={(event) => set('paymentReference', event.target.value)}
            /*
              Nothing parses what a member actually typed on their transfer, and saying so here is
              the point: matching a payment to a person is a human reading a statement. A machine
              deciding somebody had not paid because their reference did not fit a template would
              be worse than no template at all.
            */
            hint="How the treasurer would like to read it on a statement. Write {name} and {year} where those should go — nothing checks what a member actually types."
          />
          <TextArea
            label="Reminder text"
            rows={4}
            value={draft.reminderText}
            onChange={(event) => set('reminderText', event.target.value)}
            hint="What a renewal reminder says. Nothing sends one yet."
          />
          {/*
            The one field on this screen that a member ever sees. Everything else here is the
            association's own record; this is on the renewal screen, because "contact the Club
            office" is advice nobody can act on without somewhere to act on it.
          */}
          <Field
            label="Club office e-mail"
            type="email"
            value={draft.officeEmail ?? ''}
            onChange={(event) => set('officeEmail', event.target.value)}
            hint="Shown to a member whose Membership has run out, so they can write to somebody. Leave it empty and they are told to contact the Club office without being told how."
          />
        </section>

        {save.isError && <Refusal>{refusalText(save.error)}</Refusal>}

        <div className="flex flex-wrap items-center gap-4">
          <Button type="submit" variant="primary" size="lg" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : 'Save'}
          </Button>
          {save.isSuccess && !save.isPending && <span className="text-sm text-faint">Saved.</span>}
        </div>
      </form>
    </div>
  );
}
