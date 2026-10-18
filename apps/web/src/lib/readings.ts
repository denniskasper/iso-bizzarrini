import { useMutation, useQuery } from '@tanstack/react-query';
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
