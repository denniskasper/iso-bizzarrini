import type { ReactNode } from 'react';
import { SignInLink } from '@/components/sign-in-link';
import { Button } from '@/components/ui/button';
import { Roundel } from '@/components/wordmark';
import { useSession } from '@/lib/session';

/**
 * What stands in front of the roster and the Club.
 *
 * These two screens sit **outside** `ArchiveGate`, deliberately: they are behind a *role* rather
 * than behind a Membership, so an Administrator whose own Membership has run out can still reach
 * the screen that records their payment. That is right, and it left a hole worth naming — a
 * signed-*out* visitor to `/roster` got "the roster is the Club's to keep" and no way to sign in,
 * because not being an Administrator and not being anybody look identical from inside the page.
 *
 * So there are three answers here and not two, exactly as there are at the archive's own gate:
 * nobody is signed in, somebody is signed in and may not, or the screen.
 */
export function AdministratorsOnly({
  what,
  children,
}: {
  /** What is being kept — "The roster" or "The Club's details". Used in the refusal. */
  what: string;
  children: ReactNode;
}) {
  const { signedIn, isAdministrator, isPending } = useSession();

  // Nothing at all until the answer is known. A flash of a refusal at every page load, for
  // somebody who is entitled to the screen, is worse than a moment of empty chrome.
  if (isPending) {
    return null;
  }

  if (!signedIn) {
    return (
      <div className="mx-auto max-w-measure animate-rise">
        <Roundel className="size-7 text-muted" />
        <h1 className="mt-8 text-4xl font-semibold text-balance">Sign in first.</h1>
        <p className="mt-6 text-lg text-pretty text-muted">
          {what} is kept by the Club's Administrators. Signing in is where that starts.
        </p>
        <Button asChild variant="primary" size="lg" className="mt-10">
          <SignInLink>Sign in</SignInLink>
        </Button>
      </div>
    );
  }

  if (!isAdministrator) {
    return (
      <div className="mx-auto max-w-measure animate-rise">
        <Roundel className="size-7 text-muted" />
        <h1 className="mt-8 text-4xl font-semibold text-balance">{what} is the Club's to keep.</h1>
        <p className="mt-6 text-lg text-pretty text-muted">
          Only an Administrator can see it. If something about your own Membership is wrong, the
          Club office can put it right.
        </p>
      </div>
    );
  }

  return children;
}
