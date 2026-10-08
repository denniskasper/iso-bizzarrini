import type { ReactNode } from 'react';
import { RenewalScreen } from '@/components/renewal';
import { SignInLink } from '@/components/sign-in-link';
import { Button } from '@/components/ui/button';
import { Roundel } from '@/components/wordmark';
import { useSession } from '@/lib/session';

/**
 * Nothing in the archive is shown to a browser that may not read it.
 *
 * **Two ways of not being allowed in, and they are not the same thing.** Somebody who has not
 * signed in is told nothing at all, because the sign-in screen must not disclose who is on the
 * roster. A member whose Membership has run out has *proved who they are*, so they get the
 * renewal screen — the date, the amount, the Club's bank details and the words to write on the
 * transfer — which is something somebody acts on, where a refusal is something they telephone
 * the Club about (story 8).
 *
 * Where this is applied — once, around every route but the four outside the gate — is in
 * `router.tsx`.
 */
export function ArchiveGate({ children }: { children: ReactNode }) {
  const { signedIn, mayRead, isPending } = useSession();

  // Nothing at all until the answer is known. A flash of "sign in" at every page load, for
  // somebody who is signed in, is worse than a moment of empty chrome.
  if (isPending) {
    return null;
  }

  if (!signedIn) {
    return (
      <div className="mx-auto max-w-measure animate-rise">
        <Roundel className="size-7 text-muted" />
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
    return <RenewalScreen />;
  }

  return children;
}
