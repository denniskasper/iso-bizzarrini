import { Link, useRouterState } from '@tanstack/react-router';
import type { ReactNode } from 'react';

/**
 * A link to the gate that remembers where the member already was.
 *
 * There is more than one way to be sent to the sign-in screen — the control in the chrome, and
 * the plate that cannot show a drawing — and **every one of them has to carry the destination**.
 * A link to a Position sent between two members has to survive being opened by someone who is
 * signed out (story 53), and it survives only if it survives on the route they actually took.
 * That is why this is one component rather than a `to="/sign-in"` written twice.
 */
export function SignInLink({ children, className }: { children: ReactNode; className?: string }) {
  const here = useRouterState({ select: (state) => state.location.href });

  return (
    <Link
      to="/sign-in"
      search={here.startsWith('/sign-in') ? {} : { next: here }}
      className={className}
    >
      {children}
    </Link>
  );
}
