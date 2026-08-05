import { useNavigate, useSearch } from '@tanstack/react-router';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field, Refusal } from '@/components/ui/field';
import { Roundel } from '@/components/wordmark';
import { refusalText } from '@/lib/api';
import { useRequestPasswordReset, useSession, useSignIn } from '@/lib/session';

/**
 * The gate. Two fields and one action, and nothing else on the screen — the plainest instance of
 * the direction there is.
 *
 * It keeps where the member was going and goes back there afterwards, so a link to a Position
 * sent between two members survives being opened by someone who was signed out (story 53).
 *
 * **Everything this screen refuses, it refuses in the same words.** An address nobody has heard
 * of, a wrong password and a member who never chose one all produce one sentence, because a form
 * that told them apart would hand over the Club's roster to anybody who can type (story 7). What
 * replaces the diagnosis is the standing guidance underneath: the Club office is a person, and
 * they can look.
 */
export function SignInPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [forgotten, setForgotten] = useState(false);

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

  if (forgotten) {
    return <ForgottenPassword email={email} onBack={() => setForgotten(false)} />;
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
          signIn.mutate({ email, password }, { onSuccess: goOn });
        }}
      >
        <Field
          label="E-mail address"
          type="email"
          autoComplete="username"
          autoFocus
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <Field
          label="Password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />

        {signIn.isError && <Refusal>{refusalText(signIn.error)}</Refusal>}

        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" variant="primary" size="lg" disabled={signIn.isPending}>
            {signIn.isPending ? 'Signing in…' : 'Sign in'}
          </Button>
          {/*
            A plain piece of text that happens to be clickable, at the full touch height. It sits
            beside the action rather than under the password field because forgetting a password
            is the uncommon case, and a screen that offers the way round before the way in reads
            as though the way in were expected to fail.
          */}
          <Button type="button" variant="ghost" onClick={() => setForgotten(true)}>
            I have forgotten my password
          </Button>
        </div>
      </form>

      <p className="mt-16 text-sm text-pretty text-faint">
        If you are a member of the Club and cannot get in, contact the Club office and they will
        sort it out.
      </p>
    </div>
  );
}

/**
 * "Send me a link."
 *
 * **The confirmation says nothing about the outcome, deliberately.** Whether that address is on
 * the roster is exactly what must not be disclosed, so this screen cannot say "we have sent you a
 * message" — it says what is true either way, which is that *if* the Club has that address, a
 * link is on its way to it.
 */
function ForgottenPassword({ email: known, onBack }: { email: string; onBack: () => void }) {
  const [email, setEmail] = useState(known);
  const request = useRequestPasswordReset();

  if (request.isSuccess) {
    return (
      <div className="mx-auto max-w-measure animate-rise">
        <Roundel className="size-7 text-accent-ink" />
        <h1 className="mt-8 text-4xl font-semibold text-balance">Check your e-mail.</h1>
        <p className="mt-6 text-lg text-pretty text-muted">
          If <span className="tabular">{email}</span> is on the Club's roster, a link to choose a
          new password is on its way to it. The link works once, and stops working after a couple of
          hours.
        </p>
        <p className="mt-6 text-sm text-pretty text-faint">
          Nothing has changed yet — your current password still works until you use the link.
        </p>
        <Button variant="outline" size="lg" className="mt-10" onClick={onBack}>
          Back to signing in
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-measure animate-rise">
      <Roundel className="size-7 text-accent-ink" />
      <h1 className="mt-8 text-4xl font-semibold text-balance">Forgotten your password?</h1>
      <p className="mt-6 text-lg text-pretty text-muted">
        Give the address the Club has for you and we will send a link that lets you choose a new
        one. Nobody at the Club ever sees what you choose.
      </p>

      <form
        className="mt-12 flex flex-col gap-6"
        onSubmit={(event) => {
          event.preventDefault();
          request.mutate(email);
        }}
      >
        <Field
          label="E-mail address"
          type="email"
          autoComplete="username"
          autoFocus
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />

        {request.isError && <Refusal>The archive could not be reached.</Refusal>}

        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" variant="primary" size="lg" disabled={request.isPending}>
            {request.isPending ? 'Sending…' : 'Send me a link'}
          </Button>
          <Button type="button" variant="ghost" onClick={onBack}>
            Back
          </Button>
        </div>
      </form>
    </div>
  );
}
