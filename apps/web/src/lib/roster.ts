import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CorrectMemberRequest,
  NewMemberRequest,
  RecordPaymentRequest,
  RosterEntry,
  RosterStanding,
} from '@ricambi/contracts';
import { api } from '@/lib/api';

/** The roster, and the four things an Administrator does to it. */
export const ROSTER_QUERY_KEY = ['roster'] as const;
export const CLUB_QUERY_KEY = ['club'] as const;

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

export function useClub() {
  return useQuery({ queryKey: CLUB_QUERY_KEY, queryFn: api.club });
}

export function useCorrectClub() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: api.correctClub,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CLUB_QUERY_KEY }),
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
 */
export function aYearOn(paidThrough: string | null, today: string): string {
  const from = paidThrough !== null && paidThrough > today ? paidThrough : today;
  const [year, month, day] = from.split('-').map(Number) as [number, number, number];

  return new Date(Date.UTC(year + 1, month - 1, day)).toISOString().slice(0, 10);
}
