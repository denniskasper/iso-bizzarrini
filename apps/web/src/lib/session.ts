import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

/**
 * Whether whoever is holding this browser has been through the gate.
 *
 * Everything hangs off it, including the drawings: the images are served only to a signed-in
 * request (ADR 0006), so a page that rendered an `<img>` at a scan's address while signed out
 * would draw a broken picture rather than say what is actually true. Screens ask this first
 * and say plainly what is behind the gate.
 *
 * One shared passphrase is M1's stand-in. Accounts, Memberships and a live-membership check on
 * every request arrive with tickets 14 and 15 and replace it; this hook is the shape the rest
 * of the application talks to either way.
 */
export const SESSION_QUERY_KEY = ['session'] as const;

export function useSession(): { signedIn: boolean; isPending: boolean } {
  const { data, isPending } = useQuery({
    queryKey: SESSION_QUERY_KEY,
    queryFn: api.session,
    staleTime: 0,
  });

  return { signedIn: data?.signedIn ?? false, isPending };
}

export function useSignIn() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (passphrase: string) => api.signIn(passphrase),
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
