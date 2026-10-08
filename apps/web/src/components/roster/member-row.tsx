import type { RosterEntry } from '@ricambi/contracts';
import { useState } from 'react';
import { RecordPayment } from '@/components/roster/record-payment';
import { Button } from '@/components/ui/button';
import { Refusal } from '@/components/ui/field';
import { refusalText } from '@/lib/api';
import { standingReads, useCorrectMember, useInviteAgain } from '@/lib/roster';

/**
 * One person, and what an Administrator can do about them.
 *
 * The row itself is four facts and nothing else. What can be *done* opens underneath it rather
 * than over it — no dialogue, for the same reason the Editor's panels are not dialogues: this
 * archive is a printed index, and a box floating over a list is chrome that has stopped getting
 * out of the way.
 */
export function MemberRow({ member, today }: { member: RosterEntry; today: string }) {
  const [recording, setRecording] = useState(false);
  const inviteAgain = useInviteAgain();
  const correct = useCorrectMember();

  const activated = member.activatedAt !== null;

  return (
    <li>
      <div className="roster-row" data-standing={member.standing}>
        <div className="min-w-0">
          <p className="font-medium text-text">{member.name}</p>
          <p className="tabular truncate text-sm text-muted">{member.email}</p>
        </div>

        <div>
          <p className="label capitalize">{member.standing}</p>
          <p className="mt-1 text-xs text-pretty text-faint">{standingReads(member)}</p>
        </div>

        <div>
          {/* A date is an identifier to be compared, so it is set in the mono face like every
              other number in this archive. */}
          <p className="tabular text-sm text-text">{member.paidThrough ?? '—'}</p>
          <p className="tag mt-1">paid through</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1 pb-4">
        {/* Gone while its own panel is open, rather than turned into a second Cancel beside the
            one the panel already has. Two ways out of one form is one more than there is. */}
        {!recording && (
          <Button variant="ghost" onClick={() => setRecording(true)}>
            Record a payment
          </Button>
        )}

        {/*
          Only for somebody who has not activated. Sending an invitation to a member who has been
          signing in for two years would replace nothing and confuse them, and the button that
          does it should not be sitting there inviting the mistake.
        */}
        {!activated && (
          <Button
            variant="ghost"
            disabled={inviteAgain.isPending}
            onClick={() => inviteAgain.mutate(member.id)}
          >
            {inviteAgain.isPending ? 'Sending…' : 'Send the invitation again'}
          </Button>
        )}

        {/* Appointing and standing down an Editor (story 129). An Administrator is never made
            or unmade here — that is a decision with no undo on this screen. */}
        {member.role !== 'administrator' && (
          <Button
            variant="ghost"
            disabled={correct.isPending}
            onClick={() =>
              correct.mutate({
                accountId: member.id,
                fields: { role: member.role === 'editor' ? 'member' : 'editor' },
              })
            }
          >
            {member.role === 'editor' ? 'Stand down as Editor' : 'Make an Editor'}
          </Button>
        )}

        {member.role !== 'member' && <span className="tag ml-1">{member.role}</span>}

        {inviteAgain.isSuccess && !inviteAgain.isPending && (
          <span className="ml-1 text-xs text-faint">A fresh link is on its way.</span>
        )}
      </div>

      {(inviteAgain.isError || correct.isError) && (
        <div className="pb-4">
          <Refusal>{refusalText(inviteAgain.error ?? correct.error)}</Refusal>
        </div>
      )}

      {recording && (
        <RecordPayment member={member} today={today} onDone={() => setRecording(false)} />
      )}
    </li>
  );
}
