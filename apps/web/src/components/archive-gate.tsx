import type { ReactNode } from 'react';
import { SignInLink } from '@/components/sign-in-link';
import { Button } from '@/components/ui/button';
import { Roundel } from '@/components/wordmark';
import { useSession } from '@/lib/session';

/**
 * Nothing in the archive is shown to a browser that has not signed in.
 *
 * A member who is not signed in has exactly one thing to do, and this is the screen that says
 * so. Where it is applied — once, around every route but the gate — is in `router.tsx`.
 *
 * Ticket 15 replaces *who* is admitted — an Account with a live Membership, and a lapsed
 * member routed to renewal rather than turned away. Where the check happens does not move.
 */
export function ArchiveGate({ children }: { children: ReactNode }) {
  const { signedIn, isPending } = useSession();

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

  return children;
}
