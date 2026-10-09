import type { ClubRecord, CorrectClubRequest, Currency } from '@ricambi/contracts';
import { useState } from 'react';
import { Processors } from '@/components/club/processors';
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
  // What the archive held when this form was last in step with it — so that Save sends what was
  // changed *here* and nothing else. The screen now carries the bank details and the legal notice
  // side by side, and a treasurer correcting the IBAN must not write back a board they loaded
  // before somebody else corrected it.
  const [saved, setSaved] = useState<ClubRecord>(club);
  const save = useCorrectClub();

  const set = <K extends keyof ClubRecord>(key: K, value: ClubRecord[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  return (
    <div className="mx-auto max-w-measure animate-rise">
      <h1 className="display text-4xl tracking-display sm:text-5xl">The Club</h1>
      <p className="mt-6 text-lg text-pretty text-muted">
        What membership costs, where the money goes, what a member is asked to write on their
        transfer, and what the legal notice and the privacy statement say about the association. All
        of it changes here rather than in a deployment.
      </p>

      <form
        className="mt-12 flex flex-col gap-8"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate(changedIn(draft, saved), {
            // The archive's own reading of what was sent — trimmed, and blank read as nothing —
            // so the form and the record are in step again and the next Save starts from here.
            onSuccess: ({ club: written }) => {
              setSaved(written);
              setDraft(written);
            },
          });
        }}
      >
        <section className="flex flex-col gap-6">
          <h2 className="label">Membership</h2>
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
          <h2 className="label">Where a transfer goes</h2>
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
          <h2 className="label">What a member is told</h2>
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

        {/*
          **The platform's own legal pages** (issue #9). Everything from here to the button is
          published once it is written — on the legal notice and in the privacy statement, to
          anybody, signed in or not — which is the opposite of the bank details above and is said
          at the head of each section for that reason.
        */}
        <section className="flex flex-col gap-6 border-t border-line pt-8">
          <div>
            <h2 className="label">Legal notice</h2>
            <p className="mt-1 text-sm text-pretty text-faint">
              Who the association is. Published on the legal notice, which anybody can read. Leave
              out whatever does not apply.
            </p>
          </div>
          <Field
            label="Registered name"
            value={draft.legalName ?? ''}
            onChange={(event) => set('legalName', event.target.value)}
            hint="As in the register, with the legal form. Until this is written the legal notice says the Club has not published its details."
          />
          <TextArea
            label="Postal address"
            rows={3}
            value={draft.postalAddress ?? ''}
            onChange={(event) => set('postalAddress', event.target.value)}
            hint="An address post can be served at, one line per line."
          />
          <Field
            label="Represented by"
            value={draft.representedBy ?? ''}
            onChange={(event) => set('representedBy', event.target.value)}
            hint="The board members entitled to represent the association, by name."
          />
          <div className="grid gap-6 sm:grid-cols-2">
            <Field
              label="Register court"
              value={draft.registerCourt ?? ''}
              onChange={(event) => set('registerCourt', event.target.value)}
            />
            <Field
              label="Register number"
              mono
              value={draft.registerNumber ?? ''}
              onChange={(event) => set('registerNumber', event.target.value)}
            />
            <Field
              label="VAT identification number"
              mono
              value={draft.vatId ?? ''}
              onChange={(event) => set('vatId', event.target.value)}
            />
            <Field
              label="Telephone"
              type="tel"
              mono
              value={draft.phone ?? ''}
              onChange={(event) => set('phone', event.target.value)}
            />
          </div>
          <TextArea
            label="Further legal information"
            rows={4}
            value={draft.legalNoticeFurther ?? ''}
            onChange={(event) => set('legalNoticeFurther', event.target.value)}
            hint="Anything else the association has to state, in its own words. Shown as written; a blank line starts a paragraph. The e-mail address shown is the Club office’s, above."
          />
        </section>

        <section className="flex flex-col gap-6 border-t border-line pt-8">
          <div>
            <h2 className="label">Privacy statement</h2>
            <p className="mt-1 text-sm text-pretty text-faint">
              Published in the privacy statement, beside the association’s name and address from the
              legal notice.
            </p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2">
            <Field
              label="Data-protection contact"
              value={draft.dataProtectionContact ?? ''}
              onChange={(event) => set('dataProtectionContact', event.target.value)}
              hint="Who answers for data protection on the association’s side, by name."
            />
            <Field
              label="Their e-mail address"
              type="email"
              value={draft.dataProtectionEmail ?? ''}
              onChange={(event) => set('dataProtectionEmail', event.target.value)}
            />
          </div>
          <Field
            label="Supervisory authority"
            value={draft.supervisoryAuthority ?? ''}
            onChange={(event) => set('supervisoryAuthority', event.target.value)}
            hint="The data-protection authority responsible for the association, which a member may complain to."
          />
          <TextArea
            label="Further privacy information"
            rows={4}
            value={draft.privacyFurther ?? ''}
            onChange={(event) => set('privacyFurther', event.target.value)}
            hint="Anything the association’s own statement says that this one must not contradict. Shown as written at the foot of the privacy statement."
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

      <Processors />
    </div>
  );
}

/** The fields that differ, and only those: the correction is a patch, and this is what is in it. */
function changedIn(draft: ClubRecord, saved: ClubRecord): CorrectClubRequest {
  const changed: Partial<Record<keyof ClubRecord, string | null>> = {};
  for (const key of Object.keys(draft) as (keyof ClubRecord)[]) {
    // An empty box and a field nobody has written are the same thing, and neither is a change.
    if ((saved[key] ?? '') !== (draft[key] ?? '')) {
      changed[key] = draft[key];
    }
  }
  return changed as CorrectClubRequest;
}
