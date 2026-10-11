import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CorrectMemberRequest,
  NewMemberRequest,
  RecordPaymentRequest,
  RosterEntry,
  RosterStanding,
} from '@ricambi/contracts';
import { api } from '@/lib/api';
import { LEGAL_QUERY_KEY, usePrivacy } from '@/lib/legal';

/** The roster, and the four things an Administrator does to it. */
export const ROSTER_QUERY_KEY = ['roster'] as const;
export const CLUB_QUERY_KEY = ['club'] as const;
export const REMINDERS_QUERY_KEY = ['reminders'] as const;

export function useRoster() {
  return useQuery({ queryKey: ROSTER_QUERY_KEY, queryFn: api.roster });
}

/**
 * Every one of these answers with the row it changed, and every one of them throws that away and
 * re-reads the roster.
 *
 * That looks wasteful and is not: recording a payment changes a standing, adding somebody changes
 * where every other row sits in an alphabetical list, and the screen is a hundred rows read by
 * one person a few times a month. Patching a row into a cached list correctly is more code than
 * the request it saves.
 */
function useRosterMutation<TArguments>(mutationFn: (argument: TArguments) => Promise<unknown>) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ROSTER_QUERY_KEY }),
  });
}

export function useAddMember() {
  return useRosterMutation((member: NewMemberRequest) => api.addMember(member));
}

export function useInviteAgain() {
  return useRosterMutation((accountId: string) => api.inviteAgain(accountId));
}

export function useCorrectMember() {
  return useRosterMutation((correction: { accountId: string; fields: CorrectMemberRequest }) =>
    api.correctMember(correction.accountId, correction.fields),
  );
}

export function useRecordPayment() {
  return useRosterMutation((payment: { accountId: string; payment: RecordPaymentRequest }) =>
    api.recordPayment(payment.accountId, payment.payment),
  );
}

/**
 * Who the next retention sweep would delete (ADR 0007). Keyed under the roster, so anything
 * that changes the roster — a payment recorded for somebody on this list, above all — re-reads
 * it without being told to.
 */
export function useRetentionReport() {
  return useQuery({
    queryKey: [...ROSTER_QUERY_KEY, 'retention'],
    queryFn: api.retentionReport,
  });
}

/**
 * Erasing one person on request (story 131). **What it answers with is kept**, unlike every
 * other mutation here: it is the only account there will ever be of what stayed behind.
 */
export function useEraseMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (accountId: string) => api.eraseMember(accountId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ROSTER_QUERY_KEY }),
  });
}

/**
 * How long things are kept, from the system that applies the rule — so no screen ever has a
 * retention figure typed into it.
 */
export function useRetentionTerms() {
  const privacy = usePrivacy();
  return { ...privacy, data: privacy.data?.retention };
}

/** Who a renewal reminder would be written to, and what the treasurer would be told. */
export function useReminderPlan() {
  return useQuery({ queryKey: REMINDERS_QUERY_KEY, queryFn: api.reminderPlan });
}

/** Running the nightly job now. Whoever it wrote to is no longer due, so the plan is re-read. */
export function useRunReminders() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: api.runReminders,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: REMINDERS_QUERY_KEY }),
  });
}

/** `3` reads "3 years" and `1` reads "1 year", wherever a retention period is put in words. */
export function years(count: number): string {
  return count === 1 ? '1 year' : `${count} years`;
}

/**
 * Loading the Club's list — the preview, which is a question, and the import, which is an answer.
 *
 * The preview is a **mutation** rather than a query, and that is not a slip. It writes nothing,
 * but it is an act the Administrator performs on a file they have just chosen: nothing about it is
 * cacheable by address, nothing should re-run it on a window regaining focus, and the one thing a
 * query would offer — being repeated for free — is the thing this must not do.
 */
export function usePreviewRosterImport() {
  return useMutation({ mutationFn: (text: string) => api.previewRosterImport({ text }) });
}

/**
 * Written out rather than through `useRosterMutation`, because it breaks that helper's promise in
 * the one way that matters: what it answers with is not a roster row to be thrown away and re-read
 * but the plan the screen then shows. The roster is still invalidated, because a hundred people
 * may have arrived on it.
 */
export function useImportRoster() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (text: string) => api.importRoster({ text }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ROSTER_QUERY_KEY }),
  });
}

export function useClub() {
  return useQuery({ queryKey: CLUB_QUERY_KEY, queryFn: api.club });
}

export function useCorrectClub() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: api.correctClub,
    // The legal notice and the privacy statement are read out of this record too.
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: CLUB_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: LEGAL_QUERY_KEY }),
        // The reminder's wording, its switch and the treasurer's address are on this record.
        queryClient.invalidateQueries({ queryKey: REMINDERS_QUERY_KEY }),
      ]),
  });
}

/**
 * What a standing means, in the words an Administrator would use on the telephone.
 *
 * **The three states are the whole point of this screen** (story 124), so they are spelled out
 * here once rather than described slightly differently by each thing that shows one.
 *
 * Lapsed wins over invited, which loses a distinction the person on the telephone needs: somebody
 * whose term ran out *and* who never chose a password cannot get in for two reasons, and
 * recording their payment fixes only one of them. So the sentence says both.
 */
export function standingReads(member: RosterEntry): string {
  if (member.standing !== 'lapsed' && member.graceUntil !== null) {
    return 'Renewal payment not yet confirmed. Reads on grace until the bank confirms it.';
  }
  switch (member.standing) {
    case 'lapsed':
      return member.activatedAt === null
        ? 'Membership has run out, and they never chose a password — both need fixing.'
        : 'Membership has run out — they cannot reach the archive.';
    case 'invited':
      return 'Invited, and has not yet chosen a password.';
    case 'active':
      return 'Paid up, and signs in.';
  }
}

/**
 * How many of the roster are in each state, for the line above the table.
 *
 * An Administrator opening this screen is nearly always answering one question about one person,
 * but the count is what tells them whether *this* is the afternoon to chase the lapsed ones.
 */
export function tallyOf(members: readonly RosterEntry[]): Record<RosterStanding, number> {
  const tally: Record<RosterStanding, number> = { lapsed: 0, invited: 0, active: 0 };
  for (const member of members) {
    tally[member.standing] += 1;
  }
  return tally;
}

/**
 * **Today, as the archive reckons it** — not as this browser does.
 *
 * The API's clock is injected and its own, and it is what refuses a payment dated tomorrow. A
 * form whose `max=` came from a laptop running a few hours ahead would offer a date the archive
 * then refuses, and the Administrator would be reading a validation error about a field they were
 * invited to fill in that way. The status the footer already asks for carries that instant, so
 * this costs no extra request.
 */
export function useToday(): string {
  const status = useQuery({ queryKey: ['service-status'], queryFn: api.status });
  return (status.data?.time ?? new Date().toISOString()).slice(0, 10);
}

/**
 * A year on from where a Membership currently runs to, or from today where it has already run
 * out — which is what a renewal almost always is, and the only figure on the payment form the
 * screen has any business guessing at.
 *
 * **Real date arithmetic and not string arithmetic**, because the one day of the year where the
 * two differ is the one that matters: a term running to 29 February has no anniversary, and
 * `2028-02-29` incremented as text is `2029-02-29`, which is not a day at all — the field would
 * simply refuse to show it. `Date.UTC` rolls it to the 1st of March, which is a day.
 *
 * Somebody reading on grace has not run out (issue #17), so their year runs on from the
 * Paid-through — the answer the archive gives a payment the provider confirms in grace.
 */
export function aYearOn(paidThrough: string | null, today: string, inGrace = false): string {
  const from = paidThrough !== null && (inGrace || paidThrough > today) ? paidThrough : today;
  const [year, month, day] = from.split('-').map(Number) as [number, number, number];

  return new Date(Date.UTC(year + 1, month - 1, day)).toISOString().slice(0, 10);
}
