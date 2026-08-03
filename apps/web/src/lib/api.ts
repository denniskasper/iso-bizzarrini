import type {
  ApiErrorBody,
  CategoriesResponse,
  ListingResponse,
  CatalogModel,
  CatalogModelResponse,
  CatalogModelsResponse,
  MoveMarkRequest,
  NewMarkRequest,
  NewListingRequest,
  NewModelRequest,
  NewPositionRequest,
  NewTavolaRequest,
  PositionListingsResponse,
  PositionsResponse,
  ServiceStatus,
  SessionResponse,
  TavolaResponse,
  TavolaScan,
  TavolaSummary,
} from '@ricambi/contracts';

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
  /**
   * Whatever the refusal carried with it, for the refusals that are not dead ends.
   *
   * A Catalog Number that is already recorded answers with the Part that has it, because the
   * collision is how the archive deduplicates rather than an obstacle (ADR 0001) — and an
   * Editor cannot merge into something they have not been shown.
   */
  readonly details: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
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
      body?.error.details,
    );
  }

  // A refusal has a body worth reading and a removal has none — 204 is the archive saying "it
  // is gone", and asking it for JSON would fail on nothing at all.
  return (response.status === 204 ? undefined : await response.json()) as T;
}

function send<T>(method: string, path: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export const api = {
  status: () => request<ServiceStatus>('/status'),

  session: () => request<SessionResponse>('/session'),
  signIn: (passphrase: string) => send<SessionResponse>('POST', '/session', { passphrase }),
  signOut: () => request<SessionResponse>('/session', { method: 'DELETE' }),

  models: () => request<CatalogModelsResponse>('/models'),
  model: (modelId: string) => request<CatalogModelResponse>(`/models/${modelId}`),
  createModel: (model: NewModelRequest) => send<{ model: CatalogModel }>('POST', '/models', model),

  categories: () => request<CategoriesResponse>('/categories'),

  tavola: (tavolaId: string) => request<TavolaResponse>(`/tavole/${tavolaId}`),
  createTavola: (modelId: string, tavola: NewTavolaRequest) =>
    send<{ tavola: TavolaSummary }>('POST', `/models/${modelId}/tavole`, tavola),

  /**
   * Marking up a drawing. **Every one of these answers with the sheet**, so nothing in this
   * browser ever has to work out where a new number goes in a catalog's order — see
   * `PositionsResponse`.
   *
   * `placeMark` is the whole marking tool in one call: it names the Position by the number the
   * factory printed, because that is what the Editor knows at the moment they click, and one
   * click has to cost one request.
   */
  placeMark: (tavolaId: string, mark: NewMarkRequest) =>
    send<PositionsResponse>('POST', `/tavole/${tavolaId}/marks`, mark),
  addPosition: (tavolaId: string, position: NewPositionRequest) =>
    send<PositionsResponse>('POST', `/tavole/${tavolaId}/positions`, position),
  removePosition: (positionId: string) =>
    request<PositionsResponse>(`/positions/${positionId}`, { method: 'DELETE' }),
  moveMark: (markId: string, to: MoveMarkRequest) =>
    send<PositionsResponse>('PATCH', `/marks/${markId}`, to),
  removeMark: (markId: string) =>
    request<PositionsResponse>(`/marks/${markId}`, { method: 'DELETE' }),

  /**
   * Reading what sits at a number, and recording it.
   *
   * Read one Position at a time rather than with the sheet: a Tavola may carry two hundred of
   * them, each with several Parts and each Part's other appearances, and a member reads one.
   *
   * `createListing` is the merge-or-correct rule's near side. It carries either an existing
   * Part's id or a whole new Part, and a Catalog Number the archive already holds comes back as
   * a refusal carrying that Part — which is the answer, not a failure to work around.
   */
  positionListings: (positionId: string) =>
    request<PositionListingsResponse>(`/positions/${positionId}/listings`),
  createListing: (tavolaId: string, listing: NewListingRequest) =>
    send<ListingResponse>('POST', `/tavole/${tavolaId}/listings`, listing),
  removeListing: (listingId: string) =>
    request<void>(`/listings/${listingId}`, { method: 'DELETE' }),

  /**
   * The scan is the request body rather than a form field: there is nothing else on this
   * request to name, so the bytes go up as they are instead of being field-parsed on the way.
   */
  uploadScan: (tavolaId: string, file: File) =>
    request<{ scan: TavolaScan }>(`/tavole/${tavolaId}/scan`, {
      method: 'PUT',
      headers: { 'Content-Type': file.type },
      body: file,
    }),
};

export type {
  CatalogModel,
  CatalogProvenance,
  Category,
  CatalogNumberConflict,
  ListedElsewhere,
  Mark,
  MarkPoint,
  NewListingRequest,
  NewModelRequest,
  NewPartRequest,
  NewTavolaRequest,
  Part,
  PartListing,
  Position,
  ServiceStatus,
  TavolaResponse,
  TavolaScan,
  TavolaSummary,
} from '@ricambi/contracts';
