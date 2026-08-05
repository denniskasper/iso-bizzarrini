import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { SignInLink } from '@/components/sign-in-link';
import { Button } from '@/components/ui/button';
import { Roundel } from '@/components/wordmark';
import { useSession } from '@/lib/session';

/**
 * Nothing in the archive is shown to a browser that may not read it.
 *
 * **Two ways of not being allowed in, and they are not the same thing.** Somebody who has not
 * signed in is told nothing at all, because the sign-in screen must not disclose who is on the
 * roster. A member whose Membership has run out has *proved who they are*, so they can be told
 * exactly what has happened and on what date — which is a sentence somebody acts on, where a
 * refusal is a sentence they telephone the Club about (story 8).
 *
 * Where this is applied — once, around every route but the four outside the gate — is in
 * `router.tsx`. Ticket 15 gives the lapsed member a proper renewal screen carrying the amount,
 * the Club's bank details and the payment reference; this is the plain statement it replaces.
 */
export function ArchiveGate({ children }: { children: ReactNode }) {
  const { signedIn, account, mayRead, isAdministrator, isPending } = useSession();

  // Nothing at all until the answer is known. A flash of "sign in" at every page load, for
  // somebody who is signed in, is worse than a moment of empty chrome.
  if (isPending) {
    return null;
  }

  if (!signedIn) {
    return (
      <div className="mx-auto max-w-measure animate-rise">
        <Roundel className="size-7 text-accent-ink" />
        <h1 className="mt-8 text-4xl font-semibold text-balance">The archive is members-only.</h1>
        <p className="mt-6 text-lg text-pretty text-muted">
          The scanned drawings, and everything the Club has worked out about the parts on them, are
          the Club's. Members contribute what they know on the understanding that only the Club can
          see it — so none of it is served to a browser that has not signed in.
        </p>
        <Button asChild variant="primary" size="lg" className="mt-10">
          <SignInLink>Sign in</SignInLink>
        </Button>
      </div>
    );
  }

  if (!mayRead) {
    const paidThrough = account?.paidThrough ?? null;

    return (
      <div className="mx-auto max-w-measure animate-rise">
        <Roundel className="size-7 text-accent-ink" />
        <h1 className="mt-8 text-4xl font-semibold text-balance">
          {paidThrough === null
            ? 'The Club has no Membership recorded for you.'
            : 'Your Membership has run out.'}
        </h1>
        <p className="mt-6 text-lg text-pretty text-muted">
          {paidThrough === null ? (
            'You are signed in, so your account itself is fine — there is simply no paid-up term against it yet.'
          ) : (
            <>
              You are signed in, and everything is where you left it. The Club has you paid up to{' '}
              <span className="tabular">{paidThrough}</span>, and access comes back by itself the
              moment a payment is recorded — nobody has to repair anything.
            </>
          )}
        </p>
        <p className="mt-6 text-lg text-pretty text-muted">Contact the Club office to renew.</p>

        {/* An Administrator can lapse too, and when they do they are one press from the screen
            that records their own payment. Nobody else is shown this. */}
        {isAdministrator && (
          <Button asChild variant="outline" size="lg" className="mt-10">
            <Link to="/roster">Go to the roster</Link>
          </Button>
        )}
      </div>
    );
  }

  return children;
}
