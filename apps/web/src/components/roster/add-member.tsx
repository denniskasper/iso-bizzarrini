import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { EditorPanel, Field, Refusal } from '@/components/ui/field';
import { refusalText } from '@/lib/api';
import { aYearOn, useAddMember } from '@/lib/roster';

/**
 * Adding somebody to the roster (story 121) — three facts, and the invitation goes with them.
 *
 * There is no password field here and there never will be: the member chooses their own and
 * nobody at the Club ever knows it (story 3). What this form does instead is send them a link.
 */
export function AddMember({ today, onDone }: { today: string; onDone: () => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [paidThrough, setPaidThrough] = useState(aYearOn(null, today));
  const add = useAddMember();

  return (
    <EditorPanel
      title="Add somebody to the roster"
      note="They will be sent an invitation straight away, with a link that lets them choose their own password. Nobody at the Club ever sees it."
      onSubmit={(event) => {
        event.preventDefault();
        add.mutate({ name, email, paidThrough }, { onSuccess: onDone });
      }}
    >
      <Field
        label="Name"
        autoFocus
        required
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <Field
        label="E-mail address"
        type="email"
        required
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        hint="Where the invitation goes, and what they will sign in with."
      />
      <Field
        label="Paid through"
        type="date"
        mono
        required
        value={paidThrough}
        onChange={(event) => setPaidThrough(event.target.value)}
        hint="The last day the Club has already been paid for. A date in the past is fine — they will land on the roster as lapsed."
      />

      {add.isError && <Refusal>{refusalText(add.error)}</Refusal>}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" variant="primary" disabled={add.isPending}>
          {add.isPending ? 'Adding…' : 'Add them and send the invitation'}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </EditorPanel>
  );
}
