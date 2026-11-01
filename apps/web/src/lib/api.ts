import type {
  ApiErrorBody,
  CatalogRunResponse,
  CatalogRunsResponse,
  ContinueCatalogRunRequest,
  ReadAgainFromResponse,
  ReadAgainRequest,
  RemovedTavolaResponse,
  TavolaRemovalResponse,
  StartCatalogRunRequest,
  ReadingSetup,
  EnglishNameRequest,
  ContributionResponse,
  ContributionsResponse,
  ContributionTarget,
  NewContributionRequest,
  RecordPartFromContributionRequest,
  WaitingContributionsResponse,
  WaitingCountResponse,
  CategoriesResponse,
  CategoryNameRequest,
  CategoryResponse,
  CategoryWrittenResponse,
  AddSpecificationNameRequest,
  CorrectSpecificationNameRequest,
  SpecificationNameOrderRequest,
  SpecificationNamesResponse,
  SpecificationNameWrittenResponse,
  SpecificationRequest,
  CorrectSpecificationRequest,
  SpecificationSuggestionsResponse,
  UnitsResponse,
  UnitSymbolRequest,
  UnitWrittenResponse,
  TavolaCategoryRequest,
  ClubResponse,
  LandingResponse,
  VisitorSampleResponse,
  MembershipRequest,
  ReminderPlan,
  ReminderRun,
  MembershipStandingResponse,
  SetAutoRenewalRequest,
  StartSubscriptionResponse,
  LegalNoticeResponse,
  NameProcessorRequest,
  ProcessorResponse,
  ProcessorRole,
  ProcessorsResponse,
  ErasureResponse,
  PrivacyResponse,
  RetentionReport,
  SpendingResponse,
  MonthlyLimitLeftResponse,
  CorrectClubRequest,
  CorrectMemberRequest,
  InspectPasswordSetupRequest,
  NewMemberRequest,
  PasswordSetup,
  PasswordSetupRequest,
  RecordPaymentRequest,
  RenewalResponse,
  RosterEntryResponse,
  ProposalAnswerEvent,
  ProposalResponse,
  ProposalScreenshotResponse,
  ProposalsResponse,
  ProposalStatus,
  ProposalStatusRequest,
  SummariseProposalRequest,
  ProposalTurnRequest,
  StartProposalRequest,
  RosterImportPlan,
  RosterImportRequest,
  RosterResponse,
  SignInRequest,
  CorrectListingRequest,
  CorrectPartRequest,
  EquivalentRequest,
  FitmentRequest,
  ListingResponse,
  PartResponse,
  PartLookupResponse,
  NewSourceRequest,
  PartRecordResponse,
  CatalogModel,
  CatalogModelResponse,
  CatalogModelsResponse,
  ModelProgressResponse,
  MoveMarkRequest,
  NewMarkRequest,
  NewListingRequest,
  NewModelRequest,
  NewPositionRequest,
  NewSubAssemblyRequest,
  SubAssemblyNoteRequest,
  SubAssemblyOutlineRequest,
  SubAssemblyResponse,
  NewTavolaRequest,
  PastePlanResponse,
  PasteRequest,
  PositionListingsResponse,
  PositionsResponse,
  RelatePositionsRequest,
  ReorderPhotographsRequest,
  SearchResponse,
  ServiceStatus,
  SessionResponse,
  QuarterTurn,
  TavolaCheckingResponse,
  TavolaListingsResponse,
  TavolaPublishedResponse,
  TavolaResponse,
  SampleResponse,
  SamplesResponse,
  ShowToVisitorsRequest,
  TavolaScan,
  TavolaSummary,
  TurnScanRequest,
  ReadingDoubt,
  RewriteDoubtRequest,
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

/**
 * What a failed request says on screen.
 *
 * Every refusal this archive writes is already a sentence a member can act on, so the API's own
 * words are what gets shown; the fallback is for the case where there were no words at all,
 * because the archive was not reached. Written once rather than in the six places that show one.
 */
export function refusalText(error: unknown): string {
  return error instanceof ApiError ? error.message : 'The archive could not be reached.';
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

  // **Not every success carries a body**, and asking one of them for JSON fails on nothing at
  // all. A removal answers 204 — "it is gone" — and asking for a password reset answers 202 with
  // deliberately nothing in it, because whether that address is on the roster is the one thing
  // that answer must not disclose. The content type is what decides, rather than a list of status
  // codes somebody has to remember to extend.
  const isJson = response.headers.get('Content-Type')?.includes('application/json') ?? false;
  return (isJson ? await response.json() : undefined) as T;
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

  /**
   * Who this browser is, and whether their Membership still lets them read. Two questions in one
   * answer, because they have different answers: a lapsed member is signed in and cannot read.
   */
  session: () => request<SessionResponse>('/session'),
  signIn: (credentials: SignInRequest) => send<SessionResponse>('POST', '/session', credentials),
  signOut: () => request<SessionResponse>('/session', { method: 'DELETE' }),

  /**
   * **The way back in, for somebody who cannot get in.**
   *
   * `requestPasswordReset` answers the same whether or not that address is on the roster, so
   * there is nothing in its answer to read — which is the point (story 7). The token travels in
   * the body rather than in the address, so the secret in a reset link is not written to the
   * access log of everything it passes through.
   */
  requestPasswordReset: (email: string) => send<void>('POST', '/password-resets', { email }),
  inspectPasswordSetup: (token: string) =>
    send<PasswordSetup>('POST', '/password-setups/inspect', {
      token,
    } satisfies InspectPasswordSetupRequest),
  setPassword: (setup: PasswordSetupRequest) =>
    send<SessionResponse>('POST', '/password-setups', setup),

  /**
   * **The roster** — an Administrator's, and the answer to "I paid, why can't I get in".
   *
   * Adding somebody sends their invitation in the same breath, because a row that says "invited"
   * and has invited nobody is the state this screen exists to make impossible. Recording a
   * payment answers with the whole row, so a screen never has to work out what a new term did to
   * somebody's standing.
   */
  roster: () => request<RosterResponse>('/roster'),
  addMember: (member: NewMemberRequest) => send<RosterEntryResponse>('POST', '/roster', member),
  correctMember: (accountId: string, fields: CorrectMemberRequest) =>
    send<RosterEntryResponse>('PATCH', `/roster/${accountId}`, fields),
  inviteAgain: (accountId: string) =>
    send<RosterEntryResponse>('POST', `/roster/${accountId}/invitation`, {}),
  recordPayment: (accountId: string, payment: RecordPaymentRequest) =>
    send<RosterEntryResponse>('POST', `/roster/${accountId}/payments`, payment),

  /**
   * **Letting go of people** (ADR 0007): one at a time on request, and by rule once they have
   * been lapsed long enough. `retentionReport` is the dry run — who the next daily sweep would
   * delete — and writes nothing; there is deliberately no call here that runs the sweep.
   */
  eraseMember: (accountId: string) =>
    request<ErasureResponse>(`/roster/${accountId}`, { method: 'DELETE' }),
  retentionReport: () => request<RetentionReport>('/roster/retention'),

  /**
   * **The platform's own legal pages** (issue #9). Both are open to anybody, and both carry only
   * facts: who the association is, who handles members' data for it, and the retention figures
   * from the system that applies them. The sentences around those facts are the screens'.
   */
  legalNotice: () => request<LegalNoticeResponse>('/legal-notice'),
  privacy: () => request<PrivacyResponse>('/privacy'),

  /**
   * **What a Visitor is shown** (issue #128): the Models the archive covers with how many
   * Published Tavole each has, and the yearly fee. Open to anybody, and nothing else of the
   * archive is in it.
   */
  landing: () => request<LandingResponse>('/landing'),
  /** One e-mail to the Club office, answered to the Visitor. Nothing of it is kept (issue #131). */
  askToJoin: (asked: MembershipRequest) => send<void>('POST', '/membership-requests', asked),
  /**
   * **A Sample, as a Visitor reads it** (issue #132): its public drawing, every number on it, and
   * the factory's Parts at the open one. A 404 for any Tavola that is not a Sample.
   */
  visitorSample: (tavolaId: string) =>
    request<VisitorSampleResponse>(`/landing/samples/${encodeURIComponent(tavolaId)}`),

  /** The association's own record of its processors, agreements included. An Administrator's. */
  processors: () => request<ProcessorsResponse>('/processors'),
  nameProcessor: (role: ProcessorRole, fields: NameProcessorRequest) =>
    send<ProcessorResponse>('PUT', `/processors/${role}`, fields),
  removeProcessor: (role: ProcessorRole) =>
    request<void>(`/processors/${role}`, { method: 'DELETE' }),

  /**
   * **The Club's annual membership list, loaded instead of typed** (ticket 16).
   *
   * `previewRosterImport` writes nothing whatever. It is the same reading of the same file that
   * `importRoster` then does inside its transaction, so what an Administrator is shown is what
   * happens — and it is a separate call rather than a flag, because an address that records a
   * hundred people when a boolean is wrong is one press away from a very bad afternoon.
   *
   * Neither of them ever sends an invitation. Inviting stays the deliberate act it is on the
   * roster screen, one person at a time.
   */
  previewRosterImport: (file: RosterImportRequest) =>
    send<RosterImportPlan>('POST', '/roster/import/preview', file),
  importRoster: (file: RosterImportRequest) =>
    send<RosterImportPlan>('POST', '/roster/import', file),

  /**
   * **A member's own Membership, and paying for it through the platform** (ADR 0004).
   *
   * `startSubscription` answers with the payment provider's page and changes nothing: the
   * Paid-through moves when the provider tells the archive the money arrived, never when a
   * member presses a button here. `setAutoRenewal(false)` is the one-press cancellation.
   */
  membership: () => request<MembershipStandingResponse>('/subscription'),
  startSubscription: () => send<StartSubscriptionResponse>('POST', '/subscription', {}),
  setAutoRenewal: (renews: boolean) =>
    send<MembershipStandingResponse>('PUT', '/subscription/auto-renewal', {
      renews,
    } satisfies SetAutoRenewalRequest),

  /**
   * **Renewal reminders** (issue #3). `reminderPlan` is the preview — exactly who would be
   * written to and what the treasurer would be told — and sends nothing. `runReminders` runs
   * the nightly job now, and is refused with the reason while sending is not on.
   */
  reminderPlan: () => request<ReminderPlan>('/reminders'),
  runReminders: () => send<ReminderRun>('POST', '/reminders/run', {}),

  /** What this server reads the factory catalog with (issue #55). An Administrator's alone. */
  readingSetup: () => request<ReadingSetup>('/reading-method'),
  /** What Ricambi has spent on Claude, against the Monthly limit (issue #189). An Administrator's. */
  spending: () => request<SpendingResponse>('/spending'),
  /** What is left of this month's Monthly limit, for starting a run (issue #192). An Administrator's. */
  monthlyLimitLeft: () => request<MonthlyLimitLeftResponse>('/spending/left'),
  /**
   * A catalog uploaded and priced (issue #57). The PDF is the body, as a scan is; the Model and
   * the pages to read travel in the address, because there is nothing else on the request.
   */
  estimateCatalogRun: (
    catalog: File,
    run: { modelId: string; firstPage: number; lastPage: number },
  ) =>
    request<CatalogRunResponse>(
      `/catalog-runs?${new URLSearchParams({
        modelId: run.modelId,
        firstPage: String(run.firstPage),
        lastPage: String(run.lastPage),
      }).toString()}`,
      { method: 'POST', headers: { 'Content-Type': 'application/pdf' }, body: catalog },
    ),
  /** Every Catalog run, the latest first (issue #62). */
  catalogRuns: () => request<CatalogRunsResponse>('/catalog-runs'),
  catalogRun: (runId: string) => request<CatalogRunResponse>(`/catalog-runs/${runId}`),
  startCatalogRun: (runId: string, start: StartCatalogRunRequest) =>
    send<CatalogRunResponse>('POST', `/catalog-runs/${runId}/start`, start),
  continueCatalogRun: (runId: string, carryOn: ContinueCatalogRunRequest) =>
    send<CatalogRunResponse>('POST', `/catalog-runs/${runId}/continue`, carryOn),
  stopCatalogRun: (runId: string) =>
    send<CatalogRunResponse>('POST', `/catalog-runs/${runId}/stop`, {}),
  /** The run an Unchecked Tavola would be read again from, if one read it (issue #61). */
  readAgainFrom: (tavolaId: string) =>
    request<ReadAgainFromResponse>(
      `/catalog-runs/read-again?${new URLSearchParams({ tavolaId }).toString()}`,
    ),
  /** One Tavola's own run, estimated for reading only its pages again. Nothing is read yet. */
  readAgain: (readAgain: ReadAgainRequest) =>
    send<CatalogRunResponse>('POST', '/catalog-runs/read-again', readAgain),
  /** An Unchecked Tavola removed whole, answered with the Model it was on (issue #83). */
  removeTavola: (tavolaId: string) =>
    request<RemovedTavolaResponse>(`/tavole/${tavolaId}`, { method: 'DELETE' }),
  /** What removing that Tavola would take with it, or why it would be refused (issue #84). */
  tavolaRemoval: (tavolaId: string) =>
    request<TavolaRemovalResponse>(`/tavole/${tavolaId}/removal`),

  /** The Club's own record, so a change of bank is an afternoon rather than a deployment. */
  club: () => request<ClubResponse>('/club'),
  correctClub: (fields: CorrectClubRequest) => send<ClubResponse>('PATCH', '/club', fields),

  /**
   * **What a member needs in order to pay**, which is deliberately not the Club's record above.
   *
   * The one address in this archive readable by somebody whose Membership has run out — that is
   * the whole point of it — and the reference it carries arrives already written in their name,
   * because a member asked to substitute themselves into `{name}` will send a transfer the
   * treasurer cannot match to anybody.
   */
  renewal: () => request<RenewalResponse>('/renewal'),

  /**
   * **The way into the archive that does not start at the car** (ticket 22).
   *
   * Matched over the Catalog Number, the Disegno Origine, an Equivalent's reference and either
   * name — the four things somebody holding a bracket can read off it, plus the one a modern
   * replacement is stamped with. The spacing in the query does not matter, because the catalog
   * prints `260 03 150` and the part is stamped `26003150`.
   *
   * Each match carries every place the Part is listed, so the browser never has to ask a second
   * time to find out where a result leads, and the Equivalents that matched, so a member can
   * check the answer against the thing in their hand.
   */
  search: (query: string) => request<SearchResponse>(`/search?q=${encodeURIComponent(query)}`),

  models: () => request<CatalogModelsResponse>('/models'),
  model: (modelId: string) => request<CatalogModelResponse>(`/models/${modelId}`),
  /**
   * Where the work stands across one car's drawings — counted in the database, because sixty
   * sheets read whole to produce three numbers each is sixty requests nobody wants to wait for.
   *
   * There is deliberately no such call for a single Tavola. That sheet's own progress is derived
   * from the drawing and the index the browser is already showing, in `lib/progress.ts`.
   */
  modelProgress: (modelId: string) => request<ModelProgressResponse>(`/models/${modelId}/progress`),
  createModel: (model: NewModelRequest) => send<{ model: CatalogModel }>('POST', '/models', model),

  /**
   * The systems of a car (issue #8): the list an Administrator keeps, one of them across every
   * car, and the two ways the list changes. A Category is named by its slug in an address —
   * `/categories/brakes` — and by its id when it is being renamed, since renaming moves the slug.
   */
  categories: () => request<CategoriesResponse>('/categories'),
  category: (slug: string) => request<CategoryResponse>(`/categories/${encodeURIComponent(slug)}`),
  addCategory: (category: CategoryNameRequest) =>
    send<CategoryWrittenResponse>('POST', '/categories', category),
  renameCategory: (categoryId: string, category: CategoryNameRequest) =>
    send<CategoryWrittenResponse>('PATCH', `/categories/${categoryId}`, category),

  /**
   * The Units and the Specification names (issue #109): read by anyone in the archive, kept by an
   * Administrator. The names are put in order whole, as a Part's photographs are.
   */
  units: () => request<UnitsResponse>('/units'),
  addUnit: (unit: UnitSymbolRequest) => send<UnitWrittenResponse>('POST', '/units', unit),
  renameUnit: (unitId: string, unit: UnitSymbolRequest) =>
    send<UnitWrittenResponse>('PATCH', `/units/${unitId}`, unit),
  removeUnit: (unitId: string) => request<void>(`/units/${unitId}`, { method: 'DELETE' }),
  specificationNames: () => request<SpecificationNamesResponse>('/specification-names'),
  addSpecificationName: (name: AddSpecificationNameRequest) =>
    send<SpecificationNameWrittenResponse>('POST', '/specification-names', name),
  correctSpecificationName: (nameId: string, name: CorrectSpecificationNameRequest) =>
    send<SpecificationNameWrittenResponse>('PATCH', `/specification-names/${nameId}`, name),
  orderSpecificationNames: (order: SpecificationNameOrderRequest) =>
    send<SpecificationNamesResponse>('PUT', '/specification-names/order', order),
  removeSpecificationName: (nameId: string) =>
    request<void>(`/specification-names/${nameId}`, { method: 'DELETE' }),
  /** What has been written under a name before, most used first. An Editor's to read. */
  specificationSuggestions: (nameId: string, typed: string) =>
    request<SpecificationSuggestionsResponse>(
      `/specification-names/${nameId}/suggestions?q=${encodeURIComponent(typed)}`,
    ),

  tavola: (tavolaId: string) => request<TavolaResponse>(`/tavole/${tavolaId}`),
  createTavola: (modelId: string, tavola: NewTavolaRequest) =>
    send<{ tavola: TavolaSummary }>('POST', `/models/${modelId}/tavole`, tavola),
  /** Filing a sheet under a system, moving it, or — with a blank — taking it out again. */
  categoriseTavola: (tavolaId: string, category: TavolaCategoryRequest) =>
    send<{ tavola: TavolaSummary }>('PUT', `/tavole/${tavolaId}/category`, category),
  /** An Editor's statement that an Unchecked Tavola says what the factory printed. */
  publishTavola: (tavolaId: string) =>
    send<TavolaPublishedResponse>('POST', `/tavole/${tavolaId}/publication`, {}),
  /**
   * Showing a Published Tavola to Visitors with this number open, or opening another number on
   * one already shown (ADR 0019). An Administrator's decision, and so are the two below.
   */
  showToVisitors: (tavolaId: string, positionId: string) =>
    send<SampleResponse>('PUT', `/tavole/${tavolaId}/sample`, {
      positionId,
    } satisfies ShowToVisitorsRequest),
  stopShowingToVisitors: (tavolaId: string) =>
    request<void>(`/tavole/${tavolaId}/sample`, { method: 'DELETE' }),
  /** Every Tavola shown to Visitors, in the order they were first shown. */
  samples: () => request<SamplesResponse>('/samples'),
  /** What an Editor checks a machine-read Tavola against (issue #34). An Editor's alone. */
  tavolaChecking: (tavolaId: string) =>
    request<TavolaCheckingResponse>(`/tavole/${tavolaId}/checking`),
  /** A doubt an Editor has looked at, rewritten in their words or cleared (issue #56). */
  rewriteDoubt: (doubtId: string, reason: string) =>
    send<{ doubt: ReadingDoubt }>('PUT', `/doubts/${doubtId}`, {
      reason,
    } satisfies RewriteDoubtRequest),
  clearDoubt: (doubtId: string) => request<void>(`/doubts/${doubtId}`, { method: 'DELETE' }),
  /** An Editor vouching for an English name, as it stands or rewritten (issue #32). */
  nameTavolaInEnglish: (tavolaId: string, nameEn: string) =>
    send<{ tavola: TavolaSummary }>('PUT', `/tavole/${tavolaId}/english-name`, {
      nameEn,
    } satisfies EnglishNameRequest),

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
   * What belongs *with* a number rather than at it — the named Sub-assembly it sits in, and the
   * numbers it has been linked to.
   *
   * **Both answer with the sheet**, for a reason neither the marking tool nor the Part record
   * has: a link is symmetric, so recording one changes *two* Positions; and a Sub-assembly stops
   * existing when its last number leaves it, so removing one number can remove one. Neither is
   * derivable from the request that caused it.
   *
   * `putInSubAssembly` names it rather than choosing it. A sheet has one *Door Lock*, so sending
   * that name again puts these numbers into the one that is already there.
   */
  putInSubAssembly: (tavolaId: string, subAssembly: NewSubAssemblyRequest) =>
    send<PositionsResponse>('POST', `/tavole/${tavolaId}/sub-assemblies`, subAssembly),
  takeOutOfSubAssembly: (positionId: string) =>
    request<PositionsResponse>(`/positions/${positionId}/sub-assembly`, { method: 'DELETE' }),
  dissolveSubAssembly: (subAssemblyId: string) =>
    request<PositionsResponse>(`/sub-assemblies/${subAssemblyId}`, { method: 'DELETE' }),
  /**
   * **A Sub-assembly read as one thing** (issue #110), under the Tavola it is on: its Note, and
   * its numbers with what sits at each. Writing the Note answers with the same page.
   */
  subAssembly: (tavolaId: string, subAssemblyId: string) =>
    request<SubAssemblyResponse>(`/tavole/${tavolaId}/sub-assemblies/${subAssemblyId}`),
  writeSubAssemblyNote: (subAssemblyId: string, note: SubAssemblyNoteRequest) =>
    send<SubAssemblyResponse>('PUT', `/sub-assemblies/${subAssemblyId}/note`, note),
  /** Where it is on the drawing (issue #113): drawn or replaced whole, and answered with the sheet. */
  outlineSubAssembly: (subAssemblyId: string, outline: SubAssemblyOutlineRequest) =>
    send<PositionsResponse>('PUT', `/sub-assemblies/${subAssemblyId}/outline`, outline),
  removeSubAssemblyOutline: (subAssemblyId: string) =>
    request<PositionsResponse>(`/sub-assemblies/${subAssemblyId}/outline`, { method: 'DELETE' }),
  /**
   * A Sub-assembly's Photographs (issue #114), uploaded, ordered and removed as a Part's are, and
   * answered with the page re-read.
   */
  addSubAssemblyPhotograph: (subAssemblyId: string, file: File) =>
    request<SubAssemblyResponse>(`/sub-assemblies/${subAssemblyId}/photographs`, {
      method: 'POST',
      headers: { 'Content-Type': file.type },
      body: file,
    }),
  reorderSubAssemblyPhotographs: (subAssemblyId: string, order: ReorderPhotographsRequest) =>
    send<SubAssemblyResponse>('PATCH', `/sub-assemblies/${subAssemblyId}/photographs`, order),
  removeSubAssemblyPhotograph: (subAssemblyId: string, photographId: string) =>
    request<SubAssemblyResponse>(`/sub-assemblies/${subAssemblyId}/photographs/${photographId}`, {
      method: 'DELETE',
    }),

  relatePositions: (tavolaId: string, pair: RelatePositionsRequest) =>
    send<PositionsResponse>('POST', `/tavole/${tavolaId}/related-positions`, pair),
  /** By the **link's** id: there is one row, and both ends report the same id for it. */
  unrelatePositions: (linkId: string) =>
    request<PositionsResponse>(`/related-positions/${linkId}`, { method: 'DELETE' }),

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
  /** The sheet's own text, whole — what a member reads when they work from the list. */
  tavolaListings: (tavolaId: string) =>
    request<TavolaListingsResponse>(`/tavole/${tavolaId}/listings`),
  createListing: (tavolaId: string, listing: NewListingRequest) =>
    send<ListingResponse>('POST', `/tavole/${tavolaId}/listings`, listing),
  /** Where it sits on this sheet, how many, and whether the drawing shows it. Never which Part. */
  correctListing: (listingId: string, listing: CorrectListingRequest) =>
    send<ListingResponse>('PATCH', `/listings/${listingId}`, listing),
  removeListing: (listingId: string) =>
    request<void>(`/listings/${listingId}`, { method: 'DELETE' }),

  /**
   * **A whole catalog page at once, and a way back out into a spreadsheet** (ticket 12).
   *
   * `previewPaste` writes nothing whatever. It is the same reading of the same text that
   * `applyPaste` then does inside its transaction, so what an Editor is shown is what happens —
   * and it is a separate call rather than a flag, because an address that records two hundred
   * rows when a boolean is wrong is one press away from a very bad afternoon.
   *
   * The export is deliberately **not** here: it is a file to be saved rather than a response to be
   * read, so the browser follows the link and the download lands where downloads land.
   */
  previewPaste: (tavolaId: string, paste: PasteRequest) =>
    send<PastePlanResponse>('POST', `/tavole/${tavolaId}/paste/preview`, paste),
  applyPaste: (tavolaId: string, paste: PasteRequest) =>
    send<PastePlanResponse>('POST', `/tavole/${tavolaId}/paste`, paste),
  /** Where a browser goes to download the drawing as a spreadsheet. Same-origin, same gate. */
  spreadsheetUrl: (tavolaId: string) => `/api/tavole/${tavolaId}/export.csv`,

  /**
   * The Part itself — **addressed as the thing it is** rather than through a drawing (ADR 0001),
   * because correcting a Part corrects it at every number it sits at on every sheet.
   *
   * `part` and `correctPart` both answer with the whole Part **and every Tavola it is listed on**,
   * which is what a screen showing one Position cannot work out for itself and is the fact an
   * Editor has to be holding before they save rather than after.
   *
   * `lookUpParts` is the lookup that makes two things reachable at all: listing a Part the archive
   * already has when it has no Catalog Number to collide with, and finding a Part listed
   * **nowhere** — invisible on every screen that reads from a drawing, and still holding a number
   * the archive would go on refusing to anybody who typed it.
   */
  lookUpParts: (query: string) =>
    request<PartLookupResponse>(`/parts?q=${encodeURIComponent(query)}`),
  part: (partId: string) => request<PartResponse>(`/parts/${partId}`),
  correctPart: (partId: string, part: CorrectPartRequest) =>
    send<PartResponse>('PATCH', `/parts/${partId}`, part),
  namePartInEnglish: (partId: string, nameEn: string) =>
    send<PartResponse>('PUT', `/parts/${partId}/english-name`, {
      nameEn,
    } satisfies EnglishNameRequest),
  /** Refused while anything still lists it. The Listings go first, deliberately. */
  removePart: (partId: string) => request<void>(`/parts/${partId}`, { method: 'DELETE' }),

  /**
   * What fits a Part, what can be bought instead of it, and where it has been available.
   *
   * **Hung off the Part and not off a drawing**, because all three are true of the component
   * wherever it is listed (ADR 0001) — correcting one from the panel under Tavola 2 corrects it
   * on every sheet the Part appears on, which is the point rather than a side effect.
   *
   * Every one of the nine answers with the **whole Part, re-read**. Each collection is an
   * ordered list and the order is the archive's — the cars in the catalog's order, the
   * equivalents from the original supplier outwards, the sources with the most recently seen
   * price first — so nothing here ever has to work out where a new row belongs.
   *
   * A Part's Specifications are hung off it in the same way (issue #112), and answer the same.
   */
  addSpecification: (partId: string, specification: SpecificationRequest) =>
    send<PartRecordResponse>('POST', `/parts/${partId}/specifications`, specification),
  correctSpecification: (specificationId: string, specification: CorrectSpecificationRequest) =>
    send<PartRecordResponse>('PATCH', `/specifications/${specificationId}`, specification),
  removeSpecification: (specificationId: string) =>
    request<PartRecordResponse>(`/specifications/${specificationId}`, { method: 'DELETE' }),

  addFitment: (partId: string, fitment: FitmentRequest) =>
    send<PartRecordResponse>('POST', `/parts/${partId}/fitments`, fitment),
  correctFitment: (fitmentId: string, fitment: FitmentRequest) =>
    send<PartRecordResponse>('PATCH', `/fitments/${fitmentId}`, fitment),
  removeFitment: (fitmentId: string) =>
    request<PartRecordResponse>(`/fitments/${fitmentId}`, { method: 'DELETE' }),

  addEquivalent: (partId: string, equivalent: EquivalentRequest) =>
    send<PartRecordResponse>('POST', `/parts/${partId}/equivalents`, equivalent),
  correctEquivalent: (equivalentId: string, equivalent: EquivalentRequest) =>
    send<PartRecordResponse>('PATCH', `/equivalents/${equivalentId}`, equivalent),
  removeEquivalent: (equivalentId: string) =>
    request<PartRecordResponse>(`/equivalents/${equivalentId}`, { method: 'DELETE' }),

  addSource: (partId: string, source: NewSourceRequest) =>
    send<PartRecordResponse>('POST', `/parts/${partId}/sources`, source),
  correctSource: (sourceId: string, source: NewSourceRequest) =>
    send<PartRecordResponse>('PATCH', `/sources/${sourceId}`, source),
  removeSource: (sourceId: string) =>
    request<PartRecordResponse>(`/sources/${sourceId}`, { method: 'DELETE' }),

  /**
   * **What the Part looks like** — the check no part number can give a member (story 77), and
   * the file-upload path member Contributions reuse (issue #5).
   *
   * All three answer with the whole Part, like the nine above, and for a sharper reason than
   * symmetry: the *order* is what a member reads first, so a browser handed back the one
   * photograph that moved would have to work out where the other five went.
   *
   * `reorderPhotographs` names the whole order rather than one picture and a direction. An order
   * is a statement about the list, and half of one applied is an order nobody chose.
   */
  addPhotograph: (partId: string, file: File) =>
    request<PartRecordResponse>(`/parts/${partId}/photographs`, {
      method: 'POST',
      headers: { 'Content-Type': file.type },
      body: file,
    }),
  reorderPhotographs: (partId: string, order: ReorderPhotographsRequest) =>
    send<PartRecordResponse>('PATCH', `/parts/${partId}/photographs`, order),
  removePhotograph: (photographId: string) =>
    request<PartRecordResponse>(`/photographs/${photographId}`, { method: 'DELETE' }),

  /**
   * **What members have said** about a number and the Parts at it, and the way to say something.
   *
   * The reading depends on who is asking: what is published, and what this member has sent that
   * is still waiting to be checked. A photograph goes up on its own, after the words it belongs
   * to have arrived — on the same upload path a Part's own photographs use.
   */
  positionContributions: (positionId: string) =>
    request<ContributionsResponse>(`/positions/${positionId}/contributions`),
  sendContribution: (target: ContributionTarget, written: NewContributionRequest) =>
    send<ContributionResponse>(
      'POST',
      target.kind === 'part'
        ? `/parts/${target.partId}/contributions`
        : `/positions/${target.positionId}/contributions`,
      written,
    ),
  attachContributionPhotograph: (contributionId: string, file: File) =>
    request<ContributionResponse>(`/contributions/${contributionId}/photographs`, {
      method: 'POST',
      headers: { 'Content-Type': file.type },
      body: file,
    }),

  /**
   * **What an Editor does with what members sent** (issue #6): everything nobody has decided,
   * oldest first and each beside the record it is about, and the three things that can be done
   * to one besides correcting the Part with the tools above.
   *
   * Every write answers with the queue re-read, so deciding one is also learning which is next.
   * The count is its own small call because the chrome asks it on every screen.
   */
  waitingContributions: () => request<WaitingContributionsResponse>('/contributions/waiting'),
  waitingCount: () => request<WaitingCountResponse>('/contributions/waiting/count'),
  decideContribution: (contributionId: string, decision: 'publish' | 'discard') =>
    send<WaitingContributionsResponse>('PUT', `/contributions/${contributionId}/decision`, {
      decision,
    }),
  recordPartFromContribution: (contributionId: string, part: RecordPartFromContributionRequest) =>
    send<WaitingContributionsResponse>('POST', `/contributions/${contributionId}/part`, part),
  /** Moved, not copied: the picture is the Part's from then on. */
  promoteContributionPhotograph: (photographId: string) =>
    send<WaitingContributionsResponse>(
      'POST',
      `/contribution-photographs/${photographId}/promotion`,
      {},
    ),

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
  /**
   * **Proposing** (issue #152): the proposer's own Drafts, one of them whole, and a new one
   * started with what is on screen.
   */
  proposals: (status?: ProposalStatus) =>
    request<ProposalsResponse>(status === undefined ? '/proposals' : `/proposals?status=${status}`),
  proposal: (proposalId: string) => request<ProposalResponse>(`/proposals/${proposalId}`),
  startProposal: (start: StartProposalRequest) =>
    send<ProposalResponse>('POST', '/proposals', start),
  /**
   * **The finished Proposal** (issue #153), written from the conversation, or written again with
   * a change the author asks for; then handed over, or the Draft discarded.
   */
  summariseProposal: (proposalId: string, request: SummariseProposalRequest) =>
    send<ProposalResponse>('POST', `/proposals/${proposalId}/summary`, request),
  handOverProposal: (proposalId: string) =>
    send<ProposalResponse>('POST', `/proposals/${proposalId}/hand-over`, {}),
  discardProposal: (proposalId: string) =>
    request<void>(`/proposals/${proposalId}`, { method: 'DELETE' }),
  /** An Administrator's decision about a handed-over Proposal. */
  decideProposal: (proposalId: string, decision: ProposalStatusRequest) =>
    send<ProposalResponse>('PATCH', `/proposals/${proposalId}`, decision),
  /**
   * A turn, and its answer **as it is written**: one event per line, each handed to `heard` as
   * it arrives. A refusal before the answer begins is thrown as any other; a failure after it is
   * the stream's own last event.
   */
  converse: async (
    proposalId: string,
    turn: ProposalTurnRequest,
    heard: (event: ProposalAnswerEvent) => void,
  ): Promise<void> => {
    const response = await fetch(`/api/proposals/${proposalId}/turns`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Accept: 'application/x-ndjson' },
      body: JSON.stringify(turn),
    });
    if (!response.ok || response.body === null) {
      const body = (await response.json().catch(() => null)) as ApiErrorBody | null;
      throw new ApiError(
        response.status,
        body?.error.code ?? 'unknown_error',
        body?.error.message ?? `The archive answered with ${response.status}.`,
      );
    }

    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    let pending = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      pending += value;
      const lines = pending.split('\n');
      pending = lines.pop() ?? '';
      for (const line of lines.filter((line) => line !== '')) {
        heard(JSON.parse(line) as ProposalAnswerEvent);
      }
    }
  },

  /**
   * A screenshot pasted or picked onto a Draft (issue #154), waiting there until a turn sends it,
   * and one taken off again. The picture is the body, as a Photograph's is.
   */
  showScreenshot: (proposalId: string, file: File) =>
    request<ProposalScreenshotResponse>(`/proposals/${proposalId}/screenshots`, {
      method: 'POST',
      headers: { 'Content-Type': file.type },
      body: file,
    }),
  removeScreenshot: (proposalId: string, screenshotId: string) =>
    request<ProposalResponse>(`/proposals/${proposalId}/screenshots/${screenshotId}`, {
      method: 'DELETE',
    }),

  /** The drawing turned a quarter, its Marks with it. The upload stays as it arrived. */
  turnScan: (tavolaId: string, direction: QuarterTurn) =>
    send<{ scan: TavolaScan }>('POST', `/tavole/${tavolaId}/scan/turns`, {
      direction,
    } satisfies TurnScanRequest),
};

export type {
  CatalogModel,
  Specification,
  SpecificationName,
  SpecificationNameListing,
  Unit,
  UnitListing,
  CatalogRun,
  CheckedListing,
  QuarterTurn,
  ReadingDoubt,
  TableSheet,
  TavolaCheckingResponse,
  Contribution,
  ContributionSubject,
  ContributionTarget,
  RecordPartFromContributionRequest,
  WaitingContribution,
  CategoryListing,
  CategoryOnModel,
  CatalogProvenance,
  ClubRecord,
  MembershipGrant,
  PasswordSetup,
  Renewal,
  Role,
  RosterEntry,
  RosterImportColumns,
  RosterImportOutcome,
  RosterImportPlan,
  RosterImportRow,
  RosterImportTally,
  RosterStanding,
  SessionResponse,
  SignedInAccount,
  TokenPurpose,
  Category,
  CatalogNumberConflict,
  CorrectListingRequest,
  CorrectPartRequest,
  Currency,
  Equivalent,
  EquivalentKind,
  EquivalentRequest,
  Fitment,
  FitmentRequest,
  FoundPart,
  ListedElsewhere,
  ListedOn,
  ListedPart,
  Mark,
  MarkPoint,
  NewListingRequest,
  NewModelRequest,
  NewPartRequest,
  NewSourceRequest,
  NewSubAssemblyRequest,
  NewTavolaRequest,
  ObservedPrice,
  Part,
  PartInFull,
  PastedColumns,
  PastedPart,
  PastedRow,
  PastedRowOutcome,
  PastePlanResponse,
  PasteRequest,
  PasteTally,
  PartListing,
  PartResponse,
  Photograph,
  Position,
  RelatedPosition,
  RelatePositionsRequest,
  ReorderPhotographsRequest,
  SearchListing,
  SearchMatch,
  SearchResponse,
  Sheet,
  Source,
  SourceCondition,
  ServiceStatus,
  SubAssembly,
  SubAssemblyInFull,
  SubAssemblyPosition,
  SubAssemblyResponse,
  TavolaListing,
  TavolaProgress,
  TavolaPublishedResponse,
  TavolaResponse,
  TavolaScan,
  TavolaPublication,
  TavolaSample,
  EndedSample,
  SamplesResponse,
  TavolaState,
  TavolaSummary,
  VisitorListing,
  VisitorPosition,
  VisitorSample,
  VisitorSampleListed,
} from '@ricambi/contracts';
