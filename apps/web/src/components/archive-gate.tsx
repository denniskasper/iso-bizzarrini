import type { ReactNode } from 'react';
import { RenewalScreen } from '@/components/renewal';
import { VisitorLanding } from '@/components/visitor-landing';
import { useSession } from '@/lib/session';

/**
 * Nothing in the archive is shown to a browser that may not read it.
 *
 * **Two ways of not being allowed in, and they are not the same thing.** Somebody who has not
 * signed in is a Visitor, shown the landing (issue #128): what Ricambi is and how deep it goes,
 * and nothing of the archive itself (ADR 0019). A member whose Membership has run out has *proved who they are*, so they get the
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
    return <VisitorLanding />;
  }

  if (!mayRead) {
    return <RenewalScreen />;
  }

  return children;
}
