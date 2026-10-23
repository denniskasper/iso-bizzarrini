import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export const READING_SETUP_QUERY_KEY = ['reading-method'] as const;

/** What this server reads the factory catalog with (issue #55). Fixed for the life of the server. */
export function useReadingSetup() {
  return useQuery({
    queryKey: READING_SETUP_QUERY_KEY,
    queryFn: api.readingSetup,
    staleTime: Infinity,
  });
}

/**
 * A catalog uploaded, and its run being estimated on the server (issues #57, #65). Nothing is
 * read. The answer is the run as it was stored; `useCatalogRun` follows its estimate.
 */
export function useEstimateCatalogRun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      catalog,
      ...run
    }: {
      catalog: File;
      modelId: string;
      firstPage: number;
      lastPage: number;
    }) => api.estimateCatalogRun(catalog, run),
    onSuccess: (data) => {
      queryClient.setQueryData(catalogRunQueryKey(data.run.id), data);
    },
  });
}

/**
 * Every Catalog run, the latest first, each opening its record (issue #62). Asked afresh on every
 * visit: a run moves on the server while nobody is looking, so a list kept from before it started
 * would leave it out.
 */
export function useCatalogRuns() {
  return useQuery({ queryKey: ['catalog-runs'], queryFn: api.catalogRuns, staleTime: 0 });
}

export const catalogRunQueryKey = (runId: string) => ['catalog-runs', runId] as const;

/**
 * One Catalog run, asked again every few seconds while it reads (issue #58), so its running total
 * and its Tavole arrive without anybody reloading the page, and every second while it is being
 * estimated (issue #65), which is quicker and is waited for.
 */
export function useCatalogRun(runId: string) {
  return useQuery({
    queryKey: catalogRunQueryKey(runId),
    queryFn: () => api.catalogRun(runId),
    refetchInterval: (query) => {
      const state = query.state.data?.run.state;
      return state === 'estimating' ? 1_000 : state === 'running' ? 2_000 : false;
    },
  });
}

/** An estimated run started, held to the limit given. It reads on the server from then on. */
export function useStartCatalogRun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ runId, limit }: { runId: string; limit: number }) =>
      api.startCatalogRun(runId, { limit }),
    onSuccess: (data) => {
      queryClient.setQueryData(catalogRunQueryKey(data.run.id), data);
    },
  });
}

/** A stopped run read on, its limit raised first where one is given (issue #59). */
export function useContinueCatalogRun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ runId, limit }: { runId: string; limit?: number }) =>
      api.continueCatalogRun(runId, limit === undefined ? {} : { limit }),
    onSuccess: (data) => {
      queryClient.setQueryData(catalogRunQueryKey(data.run.id), data);
    },
  });
}

/** A running run asked to stop before its next request. It says so once it has. */
export function useStopCatalogRun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (runId: string) => api.stopCatalogRun(runId),
    onSuccess: (data) => {
      queryClient.setQueryData(catalogRunQueryKey(data.run.id), data);
    },
  });
}

/**
 * The run an Unchecked Tavola would be read again from (issue #61). Asked only for an
 * Administrator, who alone may read it again; `null` where no Catalog run read it.
 */
export function useReadAgainFrom(tavolaId: string) {
  return useQuery({
    queryKey: ['read-again-from', tavolaId],
    queryFn: () => api.readAgainFrom(tavolaId),
  });
}

/** One Tavola's own run estimated, to be started on its run page. Nothing is read yet. */
export function useReadAgain() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (tavolaId: string) => api.readAgain({ tavolaId }),
    onSuccess: (data) => {
      queryClient.setQueryData(catalogRunQueryKey(data.run.id), data);
    },
  });
}

/**
 * An Unchecked Tavola removed (issue #83). Its Model is asked again, so the Model page it leads
 * to, and its Left to check, are without it.
 */
export function useRemoveTavola() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (tavolaId: string) => api.removeTavola(tavolaId),
    onSuccess: (data) => queryClient.invalidateQueries({ queryKey: ['model', data.modelId] }),
  });
}

/** Dollars to the cent, as every figure of a Catalog run is shown. */
export function dollars(amount: number): string {
  return `$${amount.toFixed(2)}`;
}
