import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import type { Position } from '@/lib/api';
import { positionsMatching } from '@/lib/positions';

/** How many candidates are worth offering before the list does more harm than the field. */
const MOST_OFFERED = 8;

/**
 * Typing a number you already know (story 50), for the member who is holding the bracket.
 *
 * **The fastest way through a two-hundred-number sheet is not to look at all.** Somebody with
 * `210` stamped in their hand wants that number, and hunting for its circle on a drawing — or for
 * its row in a list — is work the archive can do for them.
 *
 * What is typed matches by **prefix**, which is the whole of story 51: `210` is a complete number
 * to whoever typed it and the beginning of `210 S` and `211 D` to the factory. Rather than guess,
 * the field shows what it found and lets a hand point at one; pressing Enter takes the first,
 * which is the exact match whenever there is one.
 */
export function PositionJump({
  positions,
  onJump,
}: {
  positions: Position[];
  onJump: (position: Position) => void;
}) {
  const [typed, setTyped] = useState('');

  const matches = positionsMatching(positions, typed);
  const offered = matches.slice(0, MOST_OFFERED);

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const first = matches[0];
        if (first) {
          onJump(first);
        }
      }}
    >
      <Field
        label="Go to a number"
        mono
        data-testid="position-jump"
        value={typed}
        onChange={(event) => setTyped(event.target.value)}
        // Whoever arrives at this field is replacing what is in it, never editing it: the number
        // in their hand is not the number they last typed.
        onFocus={(event) => event.target.select()}
        inputMode="text"
        autoComplete="off"
        spellCheck={false}
        placeholder="210"
        // Announced as it changes, because a member who cannot see the numbers that appeared
        // below would otherwise be typing into silence.
        hint={<span aria-live="polite">{found(typed, matches.length, offered.length)}</span>}
      />

      {/* What was found, offered rather than chosen for them. The first is what Enter takes. */}
      {offered.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {offered.map((position) => (
            <li key={position.id}>
              <Button
                type="button"
                variant="outline"
                data-testid="jump-match"
                data-position={position.number}
                onClick={() => onJump(position)}
                className="tabular min-w-control px-3"
              >
                {position.number}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}

/**
 * What the field says about what was typed.
 *
 * The number itself is set in the mono face wherever it appears, even mid-sentence: a Position
 * number is an identifier compared character by character against a stamped bracket, and the
 * visual language makes no exception for prose.
 */
function found(typed: string, matches: number, offered: number): ReactNode {
  const wanted = <span className="tabular">{typed.trim()}</span>;

  if (typed.trim() === '') {
    return (
      <>
        A number as the factory printed it. Typing <span className="tabular">210</span> finds{' '}
        <span className="tabular">210 S</span>.
      </>
    );
  }
  if (matches === 0) {
    return <>No number on this sheet begins {wanted}.</>;
  }
  if (matches > offered) {
    return (
      <>
        {matches} numbers begin {wanted}. The first {offered} are here.
      </>
    );
  }
  return matches === 1 ? <>One number matches.</> : <>{matches} numbers match.</>;
}
