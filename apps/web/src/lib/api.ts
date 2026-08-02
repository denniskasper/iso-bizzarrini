import type { ApiErrorBody, CatalogModelsResponse, ServiceStatus } from '@ricambi/contracts';

/**
 * The API client. Same-origin always: in development Vite proxies /api, in production the API
 * serves the app itself, so nothing here ever needs to know a hostname.
 *
 * The response shapes come from `@ricambi/contracts`, which the API produces against — so a
 * field renamed on one side stops typechecking on the other.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    credentials: 'same-origin',
    headers: { Accept: 'application/json', ...init?.headers },
    ...init,
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ApiErrorBody | null;
    throw new ApiError(
      response.status,
      body?.error.code ?? 'unknown_error',
      body?.error.message ?? `The archive answered with ${response.status}.`,
    );
  }

  return (await response.json()) as T;
}

export const api = {
  status: () => request<ServiceStatus>('/status'),
  models: () => request<CatalogModelsResponse>('/models'),
};

export type { CatalogModel, ServiceStatus } from '@ricambi/contracts';
