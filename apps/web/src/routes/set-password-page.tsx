import { useNavigate, useSearch } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { SignInLink } from '@/components/sign-in-link';
import { Button } from '@/components/ui/button';
import { Field, Refusal } from '@/components/ui/field';
import { Roundel } from '@/components/wordmark';
import { api, refusalText } from '@/lib/api';
import { useSetPassword } from '@/lib/session';

/**
 * Where an invitation and a reset link both land: **the one screen on which a password is
 * chosen**, and the only place in this application where one is ever typed twice.
 *
 * The link is inspected before the form is drawn, so an invitation that expired in somebody's
 * spam folder says so on arrival rather than after they have thought of a password and pressed
 * the button. That is worth a second request: the member on the other end of an expired link has
 * to send a message to the Club office, and finding that out late is finding it out twice.
 */
const MINIMUM = 10;

export function SetPasswordPage() {
  const { token } = useSearch({ from: '/set-password' });

  if (token === undefined) {
    return (
      <Dead>
        That link is incomplete. Open the one in the e-mail rather than typing the address by hand,
        or ask the Club office to send another.
      </Dead>
    );
  }

  return <FromLink token={token} />;
}

function FromLink({ token }: { token: string }) {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const setIt = useSetPassword();

  const link = useQuery({
    queryKey: ['password-setup', token],
    queryFn: () => api.inspectPasswordSetup(token),
    retry: false,
  });

  if (link.isPending) {
    return null;
  }

  if (link.isError) {
    return <Dead>{refusalText(link.error)}</Dead>;
  }

  const invitation = link.data.purpose === 'invitation';
  // Checked here as well as at the archive, because the two are answering different questions:
  // this one is "you have not finished typing", which is not a refusal and should not read as one.
  const tooShort = password.length > 0 && password.length < MINIMUM;
  const mismatched = again.length > 0 && again !== password;
  const ready = password.length >= MINIMUM && again === password;

  return (
    <div className="mx-auto max-w-measure animate-rise">
      <Roundel className="size-7 text-muted" />
      <h1 className="mt-8 text-4xl text-balance">
        {invitation ? `Welcome, ${link.data.name}.` : 'Choose a new password.'}
      </h1>
      <p className="mt-6 text-lg text-pretty text-muted">
        {invitation
          ? 'The Club has added you to Ricambi, its parts reference for Iso and Bizzarrini cars. Choose a password and you are in.'
          : 'Choosing one here signs you out everywhere else, which is what you want if you are here because of a shared computer.'}
      </p>
      <p className="mt-4 text-sm text-muted">
        For <span className="tabular">{link.data.email}</span>. Nobody at the Club can see what you
        choose.
      </p>

      <form
        className="mt-12 flex flex-col gap-6"
        onSubmit={(event) => {
          event.preventDefault();
          setIt.mutate({ token, password }, { onSuccess: () => navigate({ to: '/' }) });
        }}
      >
        <Field
          label="Password"
          type="password"
          autoComplete="new-password"
          autoFocus
          required
          minLength={MINIMUM}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          /*
            The whole rule, stated once, as encouragement rather than as a list of prohibitions —
            because it *is* the whole rule (ADR 0003). No capital, no digit, no symbol, and never
            an instruction to change it again in a year.
          */
          hint={
            tooShort
              ? `${MINIMUM - password.length} more to go.`
              : 'At least ten characters. There are no other rules — four ordinary words make a good one, and you will never be asked to change it.'
          }
        />
        <Field
          label="Type it again"
          type="password"
          autoComplete="new-password"
          required
          value={again}
          onChange={(event) => setAgain(event.target.value)}
          hint={mismatched ? 'These two do not match yet.' : undefined}
        />

        {setIt.isError && <Refusal>{refusalText(setIt.error)}</Refusal>}

        <div>
          <Button type="submit" variant="primary" size="lg" disabled={!ready || setIt.isPending}>
            {setIt.isPending
              ? 'Saving…'
              : invitation
                ? 'Set my password and go in'
                : 'Set my password'}
          </Button>
        </div>
      </form>
    </div>
  );
}

/**
 * A link that will not work again, whatever the reason. The archive refuses all three cases in
 * the same words on purpose — expired, already used, and never issued — so this screen has one
 * thing to say and one way out of it.
 */
function Dead({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-measure animate-rise">
      <Roundel className="size-7 text-muted" />
      <h1 className="mt-8 text-4xl text-balance">That link has stopped working.</h1>
      <p className="mt-6 text-lg text-pretty text-muted">{children}</p>
      <Button asChild variant="outline" size="lg" className="mt-10">
        <SignInLink>Go to signing in</SignInLink>
      </Button>
    </div>
  );
}
