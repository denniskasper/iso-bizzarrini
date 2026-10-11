import type { Currency, RosterEntry } from '@ricambi/contracts';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { EditorPanel, Field, Refusal, Select } from '@/components/ui/field';
import { refusalText } from '@/lib/api';
import { CURRENCIES } from '@/lib/money';
import { aYearOn, useClub, useRecordPayment } from '@/lib/roster';

/**
 * Money that arrived by bank transfer (story 125) — the path that must always work, because some
 * members will always pay by transfer and must not be locked out for it (ADR 0004).
 *
 * **The new Paid-through is stated rather than calculated.** A treasurer reconciling a statement
 * knows what a transfer was for; a system guessing at term lengths does not. What the screen does
 * is offer the answer that is nearly always right — a year on from wherever the Membership
 * currently runs — and let it be typed over, which is the difference between a default and a rule.
 *
 * The amount is prefilled from the Club's fee for the same reason and with the same freedom: a
 * member who underpaid by five euros is a conversation, not a validation error.
 */
export function RecordPayment({
  member,
  today,
  onDone,
}: {
  member: RosterEntry;
  today: string;
  onDone: () => void;
}) {
  const club = useClub();
  const record = useRecordPayment();

  const [amount, setAmount] = useState<string | null>(null);
  const [currency, setCurrency] = useState<Currency | null>(null);
  const [receivedOn, setReceivedOn] = useState(today);
  const [reference, setReference] = useState('');
  const [paidThrough, setPaidThrough] = useState(
    aYearOn(member.paidThrough, today, member.graceUntil !== null),
  );

  /**
   * The Club's fee, unless the Club has not said what it charges yet — in which case the field
   * starts empty rather than at `0.00`. A zero is not an amount the archive accepts, so
   * prefilling one would hand a first-run Administrator a form that refuses itself until they
   * work out that the answer is to empty a box somebody else filled in.
   */
  const fee = readableFee(club.data?.club.fee);

  return (
    <EditorPanel
      title={`Record a payment from ${member.name}`}
      note="A payment is recorded as a new term rather than as a change to an old one, so what the Club was paid and what it bought stay together."
      onSubmit={(event) => {
        event.preventDefault();
        record.mutate(
          {
            accountId: member.id,
            payment: {
              amount: (amount ?? fee).trim() === '' ? null : (amount ?? fee),
              currency: currency ?? club.data?.club.currency ?? 'EUR',
              receivedOn,
              reference: reference.trim() === '' ? null : reference,
              paidThrough,
            },
          },
          { onSuccess: onDone },
        );
      }}
    >
      <div className="grid gap-6 sm:grid-cols-2">
        <Field
          label="Amount"
          mono
          inputMode="decimal"
          placeholder="0.00"
          value={amount ?? fee}
          onChange={(event) => setAmount(event.target.value)}
          hint={
            fee === ''
              ? 'What arrived. Leave it blank for a term granted for nothing.'
              : "The Club's fee, until it is typed over. Leave it blank for a term granted for nothing."
          }
        />
        <Select
          label="Currency"
          mono
          value={currency ?? club.data?.club.currency ?? 'EUR'}
          onChange={(event) => setCurrency(event.target.value as Currency)}
        >
          {CURRENCIES.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </Select>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <Field
          label="The money arrived on"
          type="date"
          mono
          required
          max={today}
          value={receivedOn}
          onChange={(event) => setReceivedOn(event.target.value)}
        />
        <Field
          label="Paid through"
          type="date"
          mono
          required
          value={paidThrough}
          onChange={(event) => setPaidThrough(event.target.value)}
          hint={
            member.paidThrough === null
              ? 'The last day this term covers.'
              : `Currently ${member.paidThrough}. It has to move forward.`
          }
        />
      </div>

      <Field
        label="Their reference"
        value={reference}
        onChange={(event) => setReference(event.target.value)}
        hint={
          club.data?.club.paymentReference === undefined
            ? 'What they actually wrote on the transfer.'
            : `What they actually wrote on the transfer. The Club asks for “${club.data.club.paymentReference}”.`
        }
      />

      {record.isError && <Refusal>{refusalText(record.error)}</Refusal>}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" variant="primary" disabled={record.isPending}>
          {record.isPending ? 'Recording…' : 'Record the payment'}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </EditorPanel>
  );
}

/** A fee of nothing is a Club that has not said what it charges, so there is nothing to offer. */
function readableFee(fee: string | undefined): string {
  return fee === undefined || Number(fee) === 0 ? '' : fee;
}
