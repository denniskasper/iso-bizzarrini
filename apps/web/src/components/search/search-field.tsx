import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';

/**
 * **A tool, not a feature** — the spec names this field and the position-number entry as the two
 * clearest cases of that. So it is a labelled box, one button, and nothing else: no icon inside
 * the input, no dropdown of guesses under it, no chrome that would have to be understood before
 * it could be used.
 *
 * It **navigates** rather than holding what was typed in itself. That is the same argument the
 * Position in a Tavola's address makes (story 52): a member who has found the bracket they were
 * looking for can send the address bar to somebody else, reload it, or reach it from their
 * history — and a screen holding its query in a variable can do none of those.
 */
export function SearchField({
  /** What is already being searched for, so the field says what produced what is below it. */
  query = '',
  autoFocus = false,
}: {
  query?: string;
  autoFocus?: boolean;
}) {
  const navigate = useNavigate();
  const [typed, setTyped] = useState(query);

  return (
    <form
      role="search"
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const asked = typed.trim();
        if (asked !== '') {
          void navigate({ to: '/search', search: { q: asked } });
        }
      }}
    >
      <Field
        label="Search the archive"
        data-testid="search-field"
        value={typed}
        onChange={(event) => setTyped(event.target.value)}
        // Whoever arrives at this field is replacing what is in it, never editing it: the number
        // in their hand is not the number they last looked for.
        onFocus={(event) => event.target.select()}
        autoFocus={autoFocus}
        autoComplete="off"
        spellCheck={false}
        type="search"
        placeholder="260 03 150"
        hint="A catalog number, a Disegno Origine, a supplier’s number, or the beginning of a name. Spacing does not matter."
      />
      <div>
        <Button type="submit" variant="primary" disabled={typed.trim() === ''}>
          Search
        </Button>
      </div>
    </form>
  );
}
