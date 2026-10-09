import type { Erasure, RosterEntry } from '@ricambi/contracts';
import { Link } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { EditorPanel, Refusal } from '@/components/ui/field';
import { refusalText } from '@/lib/api';
import { useEraseMember, useRetentionTerms, years } from '@/lib/roster';

/**
 * Deleting one person's personal data, because they asked (story 131, ADR 0007).
 *
 * **The panel is the confirmation.** There is no second dialogue asking whether the
 * Administrator is sure, and nothing to type: what stops a slip is that the button is two
 * presses from the list, names the person it will erase, and sits under a plain account of what
 * goes and what stays — which is also what the Administrator has to be able to tell the member
 * on the telephone.
 *
 * It is the one action in the roster that cannot be taken back, and it still does not wear the
 * alarm colour: that is for text reporting something wrong, never for an action. The words on
 * the button and the sentence above it carry the weight.
 */
export function EraseMember({
  member,
  onErased,
  onCancel,
}: {
  member: RosterEntry;
  onErased: (erased: Erasure) => void;
  onCancel: () => void;
}) {
  const erase = useEraseMember();
  const retention = useRetentionTerms();
  const kept = keptFor(retention.data?.paymentRecordYears);

  return (
    <EditorPanel
      title={`Erase ${member.name}`}
      note="For a member who has asked the Club to delete what it holds about them. This cannot be undone."
      onSubmit={(event) => {
        event.preventDefault();
        // The promise and not a callback handed to `mutate`: erasing re-reads the roster, the
        // re-read takes this row off the screen, and a callback belonging to a row that is no
        // longer there is never called — which is how the one account of what stayed behind
        // went unsaid. A refusal is shown from `erase.error` below, so there is nothing to do
        // with it here.
        erase.mutateAsync(member.id).then(
          (response) => onErased(response.erased),
          () => undefined,
        );
      }}
    >
      <dl className="grid max-w-3xl gap-x-10 gap-y-6 sm:grid-cols-2">
        <div>
          <dt className="label">Deleted</dt>
          <dd className="mt-2 text-sm text-pretty text-text">
            Their name, e-mail address, password and Membership history, and anything they wrote
            that no Editor has published.
          </dd>
        </div>
        <div>
          <dt className="label">Kept</dt>
          <dd className="mt-2 text-sm text-pretty text-text">
            What they published, word for word, signed “a former member”. Payments the Club received
            from them, with their name, for {kept}.
          </dd>
        </div>
      </dl>

      <p className="max-w-measure text-sm text-pretty text-muted">
        If something they published names them in its text, an Editor has to edit that text —
        erasing does not rewrite it.
      </p>

      {erase.isError && <Refusal>{refusalText(erase.error)}</Refusal>}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" variant="outline" disabled={erase.isPending}>
          {erase.isPending ? 'Erasing…' : `Erase ${member.name}`}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button asChild variant="link" className="sm:ml-auto">
          <Link to="/privacy">What members are told</Link>
        </Button>
      </div>
    </EditorPanel>
  );
}

/** What an erasure left behind, as the sentence shown once the row is gone. */
export function erasureReads(
  name: string,
  erased: Erasure,
  /** Unknown until the archive has said; the sentence then names the period without a figure. */
  paymentRecordYears: number | undefined,
): string {
  const stays = [
    erased.contributionsKept > 0
      ? `${countOf(erased.contributionsKept, 'published Contribution')} ${
          erased.contributionsKept === 1 ? 'stays' : 'stay'
        }, signed “a former member”`
      : null,
    erased.paymentRecordsKept > 0
      ? `${countOf(erased.paymentRecordsKept, 'payment record')} ${
          erased.paymentRecordsKept === 1 ? 'is' : 'are'
        } kept for ${keptFor(paymentRecordYears)}`
      : null,
  ].filter((part) => part !== null);

  return stays.length === 0
    ? `${name} has been erased. Nothing of theirs is kept.`
    : `${name} has been erased. ${stays.join('; ')}.`;
}

function countOf(count: number, thing: string): string {
  return count === 1 ? `1 ${thing}` : `${count} ${thing}s`;
}

/** The statutory period in words — without a figure until the archive has said what it is. */
function keptFor(paymentRecordYears: number | undefined): string {
  return paymentRecordYears === undefined ? 'the statutory period' : years(paymentRecordYears);
}
