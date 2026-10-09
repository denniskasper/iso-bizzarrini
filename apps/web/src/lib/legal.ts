import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NameProcessorRequest, ProcessorRole } from '@ricambi/contracts';
import { api } from '@/lib/api';

/**
 * The platform's own legal pages (issue #9), and the association's record of its processors.
 *
 * `LEGAL_QUERY_KEY` is the root of everything the two public pages read, so that whatever an
 * Administrator changes on the Club's screen — the association's name, its address, who hosts
 * the server — is thrown away here in one go. Both pages quote the same record, and neither may
 * go on showing yesterday's.
 */
export const LEGAL_QUERY_KEY = ['legal'] as const;
const PROCESSORS_QUERY_KEY = ['processors'] as const;

export function useLegalNotice() {
  return useQuery({ queryKey: [...LEGAL_QUERY_KEY, 'notice'], queryFn: api.legalNotice });
}

export function usePrivacy() {
  return useQuery({ queryKey: [...LEGAL_QUERY_KEY, 'privacy'], queryFn: api.privacy });
}

export function useProcessors() {
  return useQuery({ queryKey: PROCESSORS_QUERY_KEY, queryFn: api.processors });
}

function useProcessorMutation<TArguments>(mutationFn: (argument: TArguments) => Promise<unknown>) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn,
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: PROCESSORS_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: LEGAL_QUERY_KEY }),
      ]),
  });
}

export function useNameProcessor() {
  return useProcessorMutation(
    ({ role, ...fields }: NameProcessorRequest & { role: ProcessorRole }) =>
      api.nameProcessor(role, fields),
  );
}

export function useRemoveProcessor() {
  return useProcessorMutation((role: ProcessorRole) => api.removeProcessor(role));
}

/**
 * **What each kind of processor does**, in the words the privacy statement uses — and the same
 * words on the screen where an Administrator names one, so what they are told they are filling
 * in is what a member will then read.
 *
 * In the order the statement lists them: where the data sits, then where it travels. `unnamed`
 * is what the statement says where the association has named nobody, and it is only present
 * where "nobody" is a true and complete answer today — Ricambi runs on a server and sends
 * e-mail whoever is or is not written down here, so those say nothing rather than something
 * false.
 */
export const PROCESSOR_WORK: readonly {
  role: ProcessorRole;
  title: string;
  does: string;
  /**
   * Whether Ricambi cannot run for real members without somebody doing this. Those are the ones
   * that have to be named, and their agreements signed, before any real data arrives.
   */
  needed: boolean;
  unnamed?: string;
}[] = [
  {
    role: 'hosting',
    title: 'Hosting',
    needed: true,
    does: 'Runs the server Ricambi and its database are on, so everything described here is held there.',
  },
  {
    role: 'storage',
    title: 'Backup storage',
    needed: true,
    does: 'Holds the backups of the archive.',
  },
  {
    role: 'email',
    title: 'E-mail',
    needed: true,
    does: 'Delivers the e-mails Ricambi sends — invitations and password links — so it handles your e-mail address and what the message says.',
  },
  {
    role: 'payment',
    title: 'Payments',
    needed: false,
    does: 'Takes membership payments made through Ricambi.',
    unnamed:
      'Nobody. Ricambi takes no payments itself: you pay the Club by bank transfer, and an Administrator records that it arrived.',
  },
  {
    role: 'error-tracking',
    title: 'Error tracking',
    needed: false,
    does: 'Receives a report when something in Ricambi fails.',
    unnamed:
      'Nobody. When something fails it is written to a log on the server and sent nowhere else.',
  },
];
