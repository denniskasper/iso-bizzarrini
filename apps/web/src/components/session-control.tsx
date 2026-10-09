import { Link, useRouterState } from '@tanstack/react-router';
import { SignInLink } from '@/components/sign-in-link';
import { Button } from '@/components/ui/button';
import { useSession, useSignOut } from '@/lib/session';

/**
 * Sign in, or sign out. In the chrome, at the smallest size that is still 44px to touch.
 *
 * Signing in carries where the member already was, so following a link into the archive and
 * being asked for a password does not cost them the thing they were sent (story 53).
 *
 * **Signing out says whose session it is ending**, on anything wider than a phone. That is the
 * whole point of an explicit sign-out (story 15): it is for a shared computer in a workshop, and
 * on a shared computer the useful question is not "is somebody signed in" but "who".
 */
export function SessionControl() {
  const { signedIn, account, isPending } = useSession();
  const signOut = useSignOut();
  const here = useRouterState({ select: (state) => state.location.href });

  const atTheGate = here.startsWith('/sign-in');

  // Nothing until the answer is known, and nothing on the gate itself: a "Sign in" in the
  // chrome of the sign-in screen is a second, quieter copy of the one thing that screen is for.
  if (isPending || (!signedIn && atTheGate)) {
    return null;
  }

  if (!signedIn) {
    return (
      <Button asChild variant="ghost">
        <SignInLink>Sign in</SignInLink>
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      {/*
        Whose session this is — and, since the name is the one thing in the chrome that is
        about the person, the way to their own Membership (ADR 0004). A phone's chrome has no
        room for a name; there the way in is the foot of the page, where it is on every screen.
      */}
      {account !== null && (
        <Button asChild variant="ghost" className="hidden sm:inline-flex">
          <Link to="/membership">
            <span className="max-w-40 truncate">{account.name}</span>
          </Link>
        </Button>
      )}
      <Button variant="ghost" disabled={signOut.isPending} onClick={() => signOut.mutate()}>
        Sign out
      </Button>
    </div>
  );
}
