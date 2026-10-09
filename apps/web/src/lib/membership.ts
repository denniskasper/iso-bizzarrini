import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

/** A member's own Membership: how far it runs, whether it renews itself, what they have paid. */
export const MEMBERSHIP_QUERY_KEY = ['membership'] as const;

export function useMembership(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: MEMBERSHIP_QUERY_KEY,
    queryFn: api.membership,
    enabled: options.enabled ?? true,
  });
}

/**
 * Off to the payment provider's own page. **Nothing is invalidated, because nothing has
 * changed**: the browser leaves, and what the member comes back to is whatever the provider has
 * told the archive by then.
 */
export function useStartSubscription() {
  return useMutation({
    mutationFn: api.startSubscription,
    onSuccess: ({ paymentPageUrl }) => window.location.assign(paymentPageUrl),
  });
}

/** Cancelling auto-renewal, or turning it back on. The answer is the Membership as it now stands. */
export function useSetAutoRenewal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: api.setAutoRenewal,
    onSuccess: (standing) => queryClient.setQueryData(MEMBERSHIP_QUERY_KEY, standing),
  });
}
