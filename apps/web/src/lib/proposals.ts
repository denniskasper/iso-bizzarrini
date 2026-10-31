import type {
  Proposal,
  ProposalKind,
  ProposalTurn,
  StartProposalRequest,
} from '@ricambi/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouterState } from '@tanstack/react-router';
import { useState } from 'react';
import { api } from '@/lib/api';

/**
 * **Proposing a Fix or an Idea** (issue #152), on a practice system, for those an Administrator
 * has let propose.
 */
export const PROPOSALS_QUERY_KEY = ['proposals'] as const;

export function useDrafts() {
  return useQuery({ queryKey: PROPOSALS_QUERY_KEY, queryFn: api.proposals });
}

export function useProposal(proposalId: string) {
  return useQuery({
    queryKey: [...PROPOSALS_QUERY_KEY, proposalId],
    queryFn: () => api.proposal(proposalId),
  });
}

/**
 * **What is on screen**, as a Draft is started with it: the page's own address, and the Model or
 * Tavola the address names. The server looks both up and adds the Version; nothing here is typed.
 */
export function useOnScreen(): Omit<StartProposalRequest, 'kind'> {
  const location = useRouterState({ select: (state) => state.location });
  const params = useParams({ strict: false }) as { modelId?: string; tavolaId?: string };
  return {
    pageAddress: `${location.pathname}${location.searchStr}`,
    modelId: params.modelId ?? null,
    tavolaId: params.tavolaId ?? null,
  };
}

export function useStartProposal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (start: StartProposalRequest) => api.startProposal(start),
    onSuccess: ({ proposal }) => {
      queryClient.setQueryData([...PROPOSALS_QUERY_KEY, proposal.id], { proposal });
      return queryClient.invalidateQueries({ queryKey: PROPOSALS_QUERY_KEY, exact: true });
    },
  });
}

/** The single plain question a conversation opens with (story 5). Said, not kept. */
export const OPENING_QUESTION: Record<ProposalKind, string> = {
  fix: 'What went wrong?',
  idea: 'What should Ricambi do?',
};

export const KIND_NAME: Record<ProposalKind, string> = { fix: 'Fix', idea: 'Idea' };

/**
 * One turn sent and its answer **as it is written**. `answering` is the answer so far, while it
 * is; once whole, both turns join the Proposal as kept and the Drafts are read again.
 */
export function useConverse(proposalId: string) {
  const queryClient = useQueryClient();
  const [asked, setAsked] = useState<string | null>(null);
  const [answering, setAnswering] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async (text: string) => {
      setAsked(text);
      setAnswering('');
      let failure: string | null = null;
      let kept: ProposalTurn[] = [];
      await api.converse(proposalId, text, (event) => {
        if (event.type === 'text') {
          setAnswering((sofar) => (sofar ?? '') + event.text);
        } else if (event.type === 'answered') {
          kept = event.turns;
        } else {
          failure = event.message;
        }
      });
      queryClient.setQueryData<{ proposal: Proposal }>(
        [...PROPOSALS_QUERY_KEY, proposalId],
        (current) =>
          current && {
            proposal: { ...current.proposal, turns: [...current.proposal.turns, ...kept] },
          },
      );
      if (failure !== null) {
        throw new Error(failure);
      }
    },
    onSettled: async () => {
      setAsked(null);
      setAnswering(null);
      await queryClient.invalidateQueries({ queryKey: PROPOSALS_QUERY_KEY });
    },
  });

  return { ...mutation, asked, answering };
}
