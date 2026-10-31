import { useRouterState } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { RenewalScreen } from '@/components/renewal';
import { VisitorLanding } from '@/components/visitor-landing';
import { VisitorTavola } from '@/components/visitor-sample';
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
 * **A Tavola's own address is the one exception for a Visitor** (issue #132): a Sample is shown
 * there, so a link shared in a forum works signed out and signed in alike. Any other Tavola is the
 * members-only page, with nothing of it.
 *
 * Where this is applied — once, around every route but the four outside the gate — is in
 * `router.tsx`.
 */
export function ArchiveGate({ children }: { children: ReactNode }) {
  const { signedIn, mayRead, isPending } = useSession();
  const tavolaId = useRouterState({
    select: (state) => /^\/tavole\/([^/]+)\/?$/.exec(state.location.pathname)?.[1] ?? null,
  });

  // Nothing at all until the answer is known. A flash of "sign in" at every page load, for
  // somebody who is signed in, is worse than a moment of empty chrome.
  if (isPending) {
    return null;
  }

  if (!signedIn) {
    return tavolaId === null ? <VisitorLanding /> : <VisitorTavola tavolaId={tavolaId} />;
  }

  if (!mayRead) {
    return <RenewalScreen />;
  }

  return children;
}
