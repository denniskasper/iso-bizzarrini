import type { RosterStanding } from '@ricambi/contracts';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { AddMember } from '@/components/roster/add-member';
import { AdministratorsOnly } from '@/components/roster/administrators-only';
import { MemberRow } from '@/components/roster/member-row';
import { Button } from '@/components/ui/button';
import { tallyOf, useRoster, useToday } from '@/lib/roster';

/**
 * The roster — the Club's membership, and the screen that answers **"I paid, why can't I get
 * in"** (story 124).
 *
 * The question has three ordinary answers and none of them is a fault: they are not on the
 * roster; they are on it and never chose a password; or their Membership has run out. So the
 * screen is built to make those three tellable apart at a glance, in a list of a hundred, and to
 * put the fix for each within one press.
 *
 * Set as a printed membership list rather than as a table with controls in it: the actions live
 * under the row they belong to and the forms open in place, because a dialogue floating over a
 * list is exactly the chrome this interface stays out of the way of.
 */
export function RosterPage() {
  return (
    <AdministratorsOnly what="The roster">
      <Roster />
    </AdministratorsOnly>
  );
}

function Roster() {
  const [adding, setAdding] = useState(false);
  const roster = useRoster();
  const today = useToday();

  if (roster.isPending) {
    return null;
  }

  if (roster.isError) {
    return <p className="text-lg text-pretty text-muted">The roster could not be read just now.</p>;
  }

  const members = roster.data.members;
  const tally = tallyOf(members);

  return (
    <div className="animate-rise">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <h1 className="display text-4xl tracking-display sm:text-5xl">The roster</h1>
          <p className="mt-4 text-lg text-pretty text-muted">
            {members.length === 0
              ? 'Nobody has been added yet.'
              : howItStands(members.length, tally)}
          </p>
        </div>

        {/*
         * One dominant action on the screen, and this is it. The way to the annual list stands
         * beside it as an outline and never competes with it: adding one person is what an
         * Administrator opens this screen to do, and loading a hundred happens once a year.
         */}
        {!adding && (
          <div className="flex flex-wrap items-center gap-3">
            <Button asChild variant="outline" size="lg">
              <Link to="/roster/import">Load a spreadsheet</Link>
            </Button>
            <Button variant="primary" size="lg" onClick={() => setAdding(true)}>
              Add somebody
            </Button>
          </div>
        )}
      </div>

      {adding && (
        <div className="mt-10">
          <AddMember today={today} onDone={() => setAdding(false)} />
        </div>
      )}

      {members.length > 0 && (
        <ul className="mt-12 border-b border-line">
          {members.map((member) => (
            <MemberRow key={member.id} member={member} today={today} />
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * What the list adds up to, in a sentence rather than in three counters.
 *
 * An Administrator opening this is nearly always here about one person, so the numbers that earn
 * their place are the two that mean somebody is waiting on the Club: a Membership that has run
 * out, and an invitation nobody has redeemed.
 */
function howItStands(total: number, tally: Record<RosterStanding, number>): string {
  const parts = [
    tally.lapsed > 0 ? `${tally.lapsed} lapsed` : null,
    tally.invited > 0 ? `${tally.invited} still to activate` : null,
  ].filter((part) => part !== null);

  const people = total === 1 ? '1 member' : `${total} members`;
  return parts.length === 0
    ? `${people}, all paid up and signing in.`
    : `${people} — ${parts.join(', ')}.`;
}
