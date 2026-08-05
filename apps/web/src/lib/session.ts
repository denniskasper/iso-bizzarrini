import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PasswordSetupRequest, SignedInAccount, SignInRequest } from '@ricambi/contracts';
import { api } from '@/lib/api';

/**
 * Who is holding this browser, and what the archive will let them do about it.
 *
 * Everything hangs off it, including the drawings: the images are served only to a signed-in
 * request with a live Membership (ADR 0006), so a page that rendered an `<img>` at a scan's
 * address while signed out would draw a broken picture rather than say what is actually true.
 * Screens ask this first and say plainly what is behind the gate.
 *
 * **Three states, not two.** Signed out; signed in and able to read; and signed in with a
 * Membership that has run out — which is a member who has proved who they are and is owed a
 * plain sentence rather than a refusal (story 8).
 */
export const SESSION_QUERY_KEY = ['session'] as const;

export interface Session {
  signedIn: boolean;
  /** Null for the stand-in Editor gate, which is a passphrase rather than a person. */
  account: SignedInAccount | null;
  /** Whether the archive itself is readable — signed in *and* paid up. */
  mayRead: boolean;
  isAdministrator: boolean;
  isPending: boolean;
}

export function useSession(): Session {
  const { data, isPending } = useQuery({
    queryKey: SESSION_QUERY_KEY,
    queryFn: api.session,
    staleTime: 0,
  });

  const signedIn = data?.signedIn ?? false;
  const account = data?.account ?? null;

  return {
    signedIn,
    account,
    // The stand-in gate names nobody and reads everything, which is what `account === null` is.
    mayRead: signedIn && (account === null || account.membershipIsLive),
    isAdministrator: signedIn && (account === null || account.role === 'administrator'),
    isPending,
  };
}

export function useSignIn() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (credentials: SignInRequest) => api.signIn(credentials),
    onSuccess: () => queryClient.invalidateQueries(),
  });
}

export function useSignOut() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.signOut(),
    // Everything the archive answered was answered to somebody who is now signed out — the
    // drawings above all. Throw the lot away rather than leave a cached one on the screen.
    onSuccess: () => queryClient.invalidateQueries(),
  });
}

/**
 * "I have forgotten my password."
 *
 * There is nothing in the answer to read, and the screen must not pretend otherwise: whether
 * that address is on the roster is the one thing this must not say, so success here means
 * *the request was accepted* and nothing more.
 */
export function useRequestPasswordReset() {
  return useMutation({
    mutationFn: (email: string) => api.requestPasswordReset(email),
  });
}

/** Choosing a password from a link, which signs the browser in by having chosen it. */
export function useSetPassword() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (setup: PasswordSetupRequest) => api.setPassword(setup),
    onSuccess: () => queryClient.invalidateQueries(),
  });
}
