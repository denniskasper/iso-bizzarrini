import { useNavigate, useSearch } from '@tanstack/react-router';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field, Refusal } from '@/components/ui/field';
import { Roundel } from '@/components/wordmark';
import { ApiError } from '@/lib/api';
import { useSession, useSignIn } from '@/lib/session';

/**
 * The gate. One field and one action, and nothing else on the screen — the plainest instance of
 * the direction there is.
 *
 * It keeps where the member was going and goes back there afterwards, so a link to a Position
 * sent between two members survives being opened by someone who was signed out (story 53). That
 * is worth building now rather than at ticket 14: the sign-in screen is replaced there, but the
 * habit of losing the destination is what gets kept if it is not built in from the start.
 */
export function SignInPage() {
  const [passphrase, setPassphrase] = useState('');
  const { next } = useSearch({ from: '/sign-in' });
  const navigate = useNavigate();
  const { signedIn } = useSession();
  const signIn = useSignIn();

  const goOn = () => navigate({ to: next ?? '/' });

  if (signedIn && !signIn.isPending) {
    return (
      <div className="mx-auto max-w-measure animate-rise text-center">
        <Roundel className="mx-auto size-7 text-accent-ink" />
        <h1 className="mt-8 text-3xl font-semibold">You are signed in.</h1>
        <Button variant="primary" size="lg" className="mt-10" onClick={goOn}>
          Go to the archive
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-measure animate-rise">
      <Roundel className="size-7 text-accent-ink" />
      <h1 className="mt-8 text-4xl font-semibold text-balance">Sign in</h1>
      <p className="mt-6 text-lg text-pretty text-muted">
        The scanned drawings are the Club's, and members contribute what they know on the
        understanding that only the Club can see them. So nothing here is served to a browser that
        has not signed in.
      </p>

      <form
        className="mt-12 flex flex-col gap-6"
        onSubmit={(event) => {
          event.preventDefault();
          signIn.mutate(passphrase, { onSuccess: goOn });
        }}
      >
        <Field
          label="Passphrase"
          type="password"
          autoComplete="current-password"
          autoFocus
          required
          value={passphrase}
          onChange={(event) => setPassphrase(event.target.value)}
        />

        {signIn.isError && (
          <Refusal>
            {signIn.error instanceof ApiError
              ? signIn.error.message
              : 'The archive could not be reached.'}
          </Refusal>
        )}

        <div>
          <Button type="submit" variant="primary" size="lg" disabled={signIn.isPending}>
            {signIn.isPending ? 'Signing in…' : 'Sign in'}
          </Button>
        </div>
      </form>

      <p className="mt-16 text-sm text-pretty text-faint">
        If you are a member of the Club and do not have the passphrase, contact the Club office.
      </p>
    </div>
  );
}
