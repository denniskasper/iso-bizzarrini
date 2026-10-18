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

/** A catalog uploaded and its whole run estimated. Nothing is read (issue #57). */
export function useEstimateCatalogRun() {
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
  });
}

export const catalogRunQueryKey = (runId: string) => ['catalog-runs', runId] as const;

/**
 * One Catalog run, asked again every few seconds while it reads (issue #58), so its running total
 * and its Tavole arrive without anybody reloading the page.
 */
export function useCatalogRun(runId: string) {
  return useQuery({
    queryKey: catalogRunQueryKey(runId),
    queryFn: () => api.catalogRun(runId),
    refetchInterval: (query) => (query.state.data?.run.state === 'running' ? 2_000 : false),
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
