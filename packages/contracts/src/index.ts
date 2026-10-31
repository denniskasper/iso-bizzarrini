/**
 * What the API promises the browser, declared once.
 *
 * The API and the app are one deployable (ADR 0008) but two builds, and before this existed
 * each response shape was written down twice — once where it is produced, once where it is
 * consumed — with nothing keeping the two honest. Every ticket from here adds Tavole,
 * Positions, Marks, Parts and Listings to that surface, so the duplication was going to
 * multiply.
 *
 * **Types only.** This package emits no JavaScript and is consumed with `import type`, so it
 * needs no build step and appears in neither bundle. Do not put a constant, a function or an
 * enum here — the moment something in here has to exist at runtime, this stops being free and
 * both apps need a compiled dependency.
 */

/** The shape every failure takes, so the browser never has to guess. */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/**
 * Whether this is the real archive. The distinction the whole non-production environment hangs
 * on — the banner, the chrome, the title, and every refusal to mail a member or touch a mandate.
 * There are two of them and there will only ever be two: an environment either is the members'
 * archive or it is not.
 */
export type EnvironmentMode = 'production' | 'non-production';

/** `GET /api/status` */
export interface ServiceStatus {
  status: 'ok' | 'degraded';
  /**
   * Ricambi's Version (ADR 0016): the Release this build descends from, as the root
   * `package.json` writes it. Work merged since that Release still carries it.
   */
  version: string;
  /**
   * The full commit the image was built from, or `null` when the build was told none — under
   * `pnpm dev`, under test, and wherever the image was built without one. Never guessed.
   */
  commit: string | null;
  /** Which deployment this is — free text, an operations name rather than a rule. */
  environment: string;
  /** Whether it is the real archive. Assume `non-production` when nothing says otherwise. */
  mode: EnvironmentMode;
  /** ISO 8601, from the injected clock — never the browser's idea of now. */
  time: string;
  database: 'reachable' | 'unreachable';
}

/**
 * A Model as the API reports it: a vehicle as the factory catalogs distinguish them.
 * `series` and `modelYears` are absent for Models the catalog does not distinguish that far.
 */
export interface CatalogModel {
  id: string;
  brand: string;
  name: string;
  series: string | null;
  /** As the catalog writes them — "1963–65", "from 1965". Free text, never parsed. */
  modelYears: string | null;
}

/** `GET /api/models` */
export interface CatalogModelsResponse {
  models: CatalogModel[];
}

/** `GET /api/models/:modelId` — a Model and every Tavola drawn for it. */
export interface CatalogModelResponse {
  model: CatalogModel;
  tavole: TavolaSummary[];
}

/**
 * A Category is the system of the car a Tavola belongs to — Brakes, Electrical, Fuel System.
 * It groups tavole within a Model and across Models, and it is what navigation uses.
 */
export interface Category {
  id: string;
  /** As the Administrator who keeps the list wrote it. */
  name: string;
  /**
   * What decides whether two names are the same Category, and what an address names it by:
   * `/categories/brakes`. It follows the name, so renaming a Category moves its address.
   */
  slug: string;
}

/** A Category as the list reports it: the name, and how much of the archive is filed under it. */
export interface CategoryListing extends Category {
  /** How many Tavole carry it, across every Model. Zero is an entry nobody has used yet. */
  tavole: number;
}

/**
 * `GET /api/categories` — the maintained list, in alphabetical order.
 *
 * Every entry is here whether or not anything is filed under it: this is what an Editor chooses
 * from when recording a Tavola, and a system nobody has drawn yet still has to be choosable.
 */
export interface CategoriesResponse {
  categories: CategoryListing[];
  /** How many Tavole in the archive have no Category yet. They are reached from their Model. */
  uncategorised: number;
}

/** One Model's share of a Category: the car, and its drawings of that system. */
export interface CategoryOnModel {
  model: CatalogModel;
  /** In the order the catalog prints them. Never empty — a Model with none is not listed. */
  tavole: TavolaSummary[];
}

/**
 * `GET /api/categories/:slug` — one system, across **every** Model, so the same system can be
 * compared between cars.
 */
export interface CategoryResponse {
  category: Category;
  /** Brand, then Model, the order the catalog index is in. */
  models: CategoryOnModel[];
}

/**
 * `POST /api/categories` and `PATCH /api/categories/:categoryId` — an Administrator adding to
 * the list or renaming an entry. A name is all a Category has: there is no code and no number.
 */
export interface CategoryNameRequest {
  name: string;
}

/** What both of those answer. */
export interface CategoryWrittenResponse {
  category: Category;
}

/**
 * A Unit: what a Specification's quantity is counted in, written one way only — *g*, *mm*, *Nm*.
 * Kept by an Administrator; fixed by a Specification name and never typed by an Editor.
 */
export interface Unit {
  id: string;
  /** As it is printed beside a value. Case is part of it: *mm* and *Mm* are different Units. */
  symbol: string;
}

/** A Unit as the list reports it, with how many Specification names count in it. */
export interface UnitListing extends Unit {
  /** A Unit with any is refused removal. */
  names: number;
}

/** `GET /api/units` — the whole list, by symbol. */
export interface UnitsResponse {
  units: UnitListing[];
}

/** `POST /api/units` and `PATCH /api/units/:unitId` — an Administrator adding or respelling one. */
export interface UnitSymbolRequest {
  symbol: string;
}

/** What both of those answer. */
export interface UnitWrittenResponse {
  unit: Unit;
}

/**
 * A Specification name: what a Part's Specification is recorded under — *Material*, *Weight* —
 * and the Unit its values are counted in, if any. A name without one takes words.
 */
export interface SpecificationName {
  id: string;
  name: string;
  /** What decides whether two names are the same, as a Category's slug does. */
  slug: string;
  unit: Unit | null;
}

/** A name as the list reports it, with how many Parts have a value for it. */
export interface SpecificationNameListing extends SpecificationName {
  /** A name with any can neither change its Unit nor be removed. */
  parts: number;
}

/** `GET /api/specification-names` — the whole list, in the order a Part's Specifications read in. */
export interface SpecificationNamesResponse {
  specificationNames: SpecificationNameListing[];
}

/** `POST /api/specification-names` — added at the end of the list. */
export interface AddSpecificationNameRequest {
  name: string;
  /** A Unit on the list, or `null` for a name that takes words. */
  unitId: string | null;
}

/**
 * `PATCH /api/specification-names/:nameId` — renaming one, or changing its Unit while no Part has
 * a value for it. An absent field is left as it is.
 */
export interface CorrectSpecificationNameRequest {
  name?: string;
  unitId?: string | null;
}

/** What adding and correcting answer. */
export interface SpecificationNameWrittenResponse {
  specificationName: SpecificationName;
}

/**
 * `PUT /api/specification-names/order` — the whole list in its new order, every name once. It
 * answers `SpecificationNamesResponse`.
 */
export interface SpecificationNameOrderRequest {
  nameIds: string[];
}

/**
 * A Specification: one Part's value under one name — *Material: Chromed brass*, *Weight: 412 g*.
 * At most one per Part per name.
 */
export interface Specification {
  id: string;
  nameId: string;
  name: string;
  /**
   * As it is read. A number under a name with a Unit, written with a point whatever was typed;
   * words, as the Editor wrote them, under a name without one.
   */
  value: string;
  /** The name's Unit, read from the name and never stored with the value. `null` for words. */
  unit: string | null;
}

/** `POST /api/parts/:partId/specifications` — a value under a name the Part has none for yet. */
export interface SpecificationRequest {
  nameId: string;
  /** A number, with a point or a comma, for a name with a Unit; words for one without. */
  value: string;
}

/** `PATCH /api/specifications/:specificationId` — the value corrected. The name stays. */
export interface CorrectSpecificationRequest {
  value: string;
}

/**
 * `GET /api/specification-names/:nameId/suggestions?q=` — the values already recorded under a
 * name that contain what has been typed, ignoring case, most used first. Offered, not imposed.
 */
export interface SpecificationSuggestionsResponse {
  suggestions: string[];
}

/**
 * `PUT /api/tavole/:tavolaId/category` — an Editor putting a drawing under a system, moving it
 * to another, or taking it out again.
 */
export interface TavolaCategoryRequest {
  /** A Category on the list, by name or by slug. Blank for none. */
  category: string;
}

/**
 * `PUT /api/tavole/:tavolaId/english-name` and `PUT /api/parts/:partId/english-name` — an Editor
 * vouching for an English name, as it stands or rewritten. Either way it is no longer a Machine
 * translation (ADR 0017). The Tavola answers `{ tavola: TavolaSummary }`; the Part answers
 * `PartResponse`, as correcting it does.
 */
export interface EnglishNameRequest {
  nameEn: string;
}

/**
 * What the address and the filter call a Tavola with no Category. Reserved, so no Category can
 * be given a name that would collide with it.
 *
 * A type and not a constant: this package is types only, and each side spells the word once.
 */
export type Uncategorised = 'uncategorised';

/**
 * A Tavola's scan, as the browser may reach it.
 *
 * Every address here is authenticated and immutable: a signed-out request is refused, and a
 * re-upload produces a new scan and therefore a new address, so a browser may keep what it has
 * for as long as it likes (ADR 0006, ADR 0013).
 */
export interface TavolaScan {
  id: string;
  /** The dimensions of what `displayUrl` serves, so a viewer knows the aspect ratio up front. */
  width: number;
  height: number;
  /** The whole drawing, prepared at ingest. */
  displayUrl: string;
  /** A thumbnail, so listing a Model's Tavole never downloads a drawing. */
  previewUrl: string;
}

/**
 * Whether an Editor has compared a Tavola with its sheets (ADR 0017). Only an Editor is ever
 * shown an `unchecked` one; to a Member every Tavola there is, is `published`.
 */
export type TavolaState = 'unchecked' | 'published';

/** A Tavola as a Model's list reports it. */
export interface TavolaSummary {
  id: string;
  /** As printed on the sheet — an opaque string, never arithmetic. */
  number: string;
  nameIt: string;
  nameEn: string;
  /**
   * `nameEn` is a Machine translation nobody has vouched for yet: shown labelled, with the
   * Italian beside it. An Editor confirming or rewriting it clears this; publishing does not.
   */
  nameEnMachineTranslated: boolean;
  /** `null` until an Editor puts it under a system. Like a missing scan, a legitimate state. */
  category: Category | null;
  /** `null` until a scan is uploaded. A Tavola without one is a legitimate state. */
  scan: TavolaScan | null;
  state: TavolaState;
}

/**
 * Who vouched for a Tavola by publishing it, and when. `by` is `null` once their Account is gone
 * (ADR 0007); the whole of it is `null` on a Tavola that was Published before publishing was an
 * act anybody performed.
 */
export interface TavolaPublication {
  /** ISO timestamp. */
  at: string;
  by: string | null;
}

/**
 * The factory's own classification, printed on the sheet as *Sezione*, *Gruppo* and
 * *Sottogruppo*, reported exactly as the factory wrote it.
 *
 * **Provenance, not navigation.** It is here so a member can match the screen against a paper
 * catalog; nothing filters or groups by it. That is the Category's job.
 */
export interface CatalogProvenance {
  section: string | null;
  group: string | null;
  subgroup: string | null;
}

/**
 * A place on a drawing.
 *
 * **Fractions of the drawing, never pixels of a file**: `0` is the left or top edge and `1` the
 * right or bottom one, whatever resolution the sheet was scanned at (ADR 0013). A Tavola
 * re-scanned at twice the size keeps every Mark an Editor placed on it.
 *
 * It has a name of its own because the same pair travels through every layer on both sides —
 * the gesture that produces it, the request that carries it, the row that stores it — and a
 * loose `{ x, y }` written out at each of them is a pair somebody eventually gets the wrong way
 * round.
 */
export interface MarkPoint {
  x: number;
  y: number;
}

/** A place on the scan where a Position's number appears. */
export interface Mark extends MarkPoint {
  id: string;
}

/**
 * A named set of Positions within one Tavola — *Window Slider*, *Door Lock*.
 *
 * **A name, and explicitly not a bill of materials** (spec, Out of Scope). It has no number,
 * nothing orders it, and it holds Positions rather than Parts: what a member gets from it is
 * "these eleven numbers go together", which is what somebody taking a door apart actually wants
 * and a great deal less than a parts tree pretends to know.
 *
 * **Which numbers are in it is not on this shape**, deliberately — it is `Position.subAssemblyId`
 * on the sheet's own Positions, in one place rather than two. Membership listed here as well
 * would be the same fact twice, free to disagree the moment a Position moves.
 */
export interface SubAssembly {
  id: string;
  /** As whoever named it wrote it. This is what members read. */
  name: string;
  /**
   * Where it is on the drawing, as an Editor drew round it (issue #113): at least three corners,
   * in order, in the same fractions of the drawing a Mark is placed in. `null` until somebody
   * draws one, which leaves the Sub-assembly exactly as valid. Outlines may overlap.
   *
   * On the sheet rather than only on the Sub-assembly's page, because it is the drawing that
   * shows it: a member pointing at a name beside the sheet is shown where it is without asking.
   */
  outline: MarkPoint[] | null;
}

/**
 * Two Positions an Editor linked because the parts work together — the guide rod and the one
 * channel it runs in, rather than the eleven numbers of the window mechanism.
 *
 * **The link is symmetric, and it is one row.** That is why `id` is the *link's* id and is the
 * same from both ends: recording it once is the only thing that can happen, so removing it from
 * either end removes the one link there is.
 */
export interface RelatedPosition {
  /** The link, not either end of it. The same id appears on both Positions. */
  id: string;
  /**
   * The Position at the other end, by id alone — anything reading this is reading it against the
   * sheet the link belongs to, and already holds that sheet's numbers as the factory printed them.
   */
  positionId: string;
}

/**
 * A number printed on a Tavola.
 *
 * **It exists in its own right, and nothing here says what sits at it.** Marking a sheet up and
 * finding out what each number is are separate evenings' work, so a Position about which
 * nothing whatever is known is an ordinary, finished thing rather than a half-made one. What
 * sits there arrives with ticket 06, as a Listing, and does not live on this shape.
 *
 * `marks` is in reading order down the sheet, and may be empty — a Position with no Mark is
 * one the catalog lists but the drawing does not show.
 *
 * What *does* live here is what belongs with the number: the Sub-assembly it sits in and the
 * numbers it has been linked to. Two mechanisms, because they answer two questions — the broad
 * one, and the narrow hand-picked pointer at the one other part this one works against.
 */
export interface Position {
  id: string;
  /** As printed — `207`, `210 S`, `211 D`. An identifier, never arithmetic. */
  number: string;
  marks: Mark[];
  /**
   * The named Sub-assembly this number sits in, if any. **At most one, and that is the whole
   * rule** — a Position belongs to one or to none, and a Sub-assembly holds Positions rather than
   * other Sub-assemblies, so nothing here nests.
   *
   * `null` is the ordinary case and means exactly that: a number in none shows nothing, rather
   * than falling back to every other number on the drawing.
   */
  subAssemblyId: string | null;
  /**
   * The numbers on this sheet this one has been linked to, in the catalog's own order. Every
   * link is visible from both ends because there is one of it.
   */
  related: RelatedPosition[];
}

/**
 * **The whole sheet as it now stands** — every number the factory printed on it, and the
 * Sub-assemblies the club has drawn round them.
 *
 * The two travel together because a Position names its Sub-assembly by id and would otherwise be
 * pointing at something nothing on the wire could name. The names are in one place and membership
 * in another, which is the same argument the sheet's own index makes: a name repeated on eleven
 * Positions is a name that can be edited on ten of them.
 */
export interface Sheet {
  /**
   * Every Position on the sheet, in the order the factory printed them, with the drawing —
   * because circles that arrive after the sheet does are circles a member watches appear.
   */
  positions: Position[];
  /** The sheet's Sub-assemblies, by name. One with nothing in it is not one, and is not here. */
  subAssemblies: SubAssembly[];
}

/**
 * The picture of one of the factory's table fogli for a Tavola, kept as the evidence its Listings
 * were read from (ADR 0017). As private as the Scan: the address is authenticated, and a Member
 * reaches it only once the Tavola is Published.
 */
export interface TableSheet {
  /** Its place among the Tavola's Table sheets, counting from 1, as the factory printed them. */
  sheet: number;
  width: number;
  height: number;
  url: string;
}

/** `GET /api/tavole/:tavolaId` */
export interface TavolaResponse extends Sheet {
  tavola: TavolaSummary & {
    model: CatalogModel;
    provenance: CatalogProvenance;
    publication: TavolaPublication | null;
    /** Empty for a Tavola recorded by hand, which nobody read off a table. */
    tableSheets: TableSheet[];
    /**
     * Whether it is shown to Visitors, and how (ADR 0019): `null` when it is not. **Only an
     * Administrator is told**, so for everybody else the field is not there at all.
     */
    sample?: TavolaSample | null;
    /**
     * Whether it stopped being shown by itself, because its open number went (issue #130): `null`
     * when it did not, or once it is shown again. Told to Administrators only, as `sample` is.
     */
    endedSample?: EndedSample | null;
  };
}

/**
 * A Published Tavola an Administrator shows to Visitors (ADR 0019), as Administrators are told
 * about it. What a Visitor reads of it is another shape, and a much smaller one.
 */
export interface TavolaSample {
  /** The one number a Visitor may read the Parts at. Every other number is locked. */
  open: { positionId: string; number: string };
  /** ISO timestamp of when it was first shown. Opening another number does not move it. */
  markedAt: string;
  /** Who showed it, while their Account exists. */
  markedBy: string | null;
  /**
   * **The smaller public copy** of the drawing: served to anybody, signed in or not, and sharp
   * enough to read the numbers but not to print the sheet. The Scan itself stays private.
   */
  drawing: { url: string; width: number; height: number };
}

/**
 * Why a Sample stopped being one without an Administrator stopping it. Its open number was
 * removed: Ricambi has no other way for a Position to go.
 */
export type SampleEndReason = 'removed';

/**
 * **A Sample that ended by itself** (issue #130), as Administrators are told about it, so they can
 * show the Tavola again with another number open. Its public copy is already deleted.
 */
export interface EndedSample {
  /** The number that was open. It is no longer on the Tavola. */
  openNumber: string;
  /** ISO timestamp. */
  endedAt: string;
  reason: SampleEndReason;
}

/**
 * `PUT /api/tavole/:tavolaId/sample` — an Administrator showing a Published Tavola to Visitors
 * with this Position open, or opening another one on a Tavola already shown. Answers
 * `SampleResponse`. `DELETE` on the same address stops showing it.
 */
export interface ShowToVisitorsRequest {
  positionId: string;
}

export interface SampleResponse {
  sample: TavolaSample;
}

/** Which Tavola a Sample is, in the list of them. */
export type SampleTavola = Pick<TavolaSummary, 'id' | 'number' | 'nameIt' | 'nameEn'> & {
  model: CatalogModel;
};

/** `GET /api/samples` — every Tavola shown to Visitors, in the order they were first shown. */
export interface SamplesResponse {
  samples: (TavolaSample & { tavola: SampleTavola })[];
  /**
   * Every Sample that ended by itself and has not been shown again or set aside since, most
   * recent first. `DELETE /api/tavole/:tavolaId/sample` sets one aside.
   */
  ended: (EndedSample & { tavola: SampleTavola })[];
}

/**
 * Something the read command was unsure of on a Tavola (ADR 0017), and the row or the number it
 * concerns — which is where an Editor checking the Tavola is taken.
 */
export interface ReadingDoubt {
  id: string;
  /** In the read command's words, or the Editor's once they have rewritten it. */
  reason: string;
  listingId: string | null;
  positionId: string | null;
}

/**
 * `PUT /api/doubts/:doubtId` — an Editor rewriting a doubt on an Unchecked Tavola in their own
 * words (issue #56). Answers `{ doubt: ReadingDoubt }`. `DELETE` on the same address clears it.
 */
export interface RewriteDoubtRequest {
  reason: string;
}

/** A line of the sheet's index, with the Table sheet it was read from — `null` if recorded by hand. */
export interface CheckedListing extends TavolaListing {
  tableSheet: number | null;
  /**
   * Where one Reading hesitated and the other read the same: a quiet note beside the row, never a
   * doubt. `null` where neither hesitated, and on a row recorded by hand.
   */
  readingNote: string | null;
}

/**
 * `GET /api/tavole/:tavolaId/checking` — **what an Editor compares a machine-read Tavola with**
 * (issue #34): the rows as read, the sheet each came from, and every doubt. An Editor's alone,
 * because the Reading method is never told to a Member.
 */
export interface TavolaCheckingResponse {
  /** What read it off the factory's sheets, or `null` for a Tavola a person recorded. */
  readingMethod: string | null;
  listings: CheckedListing[];
  doubts: ReadingDoubt[];
}

/** What a server can be configured to read the factory catalog with (ADR 0018). */
export type ReadingMethodKind = 'subscription' | 'api-key' | 'fake';

/**
 * `GET /api/reading-method` — **what this server reads the catalog with** (issue #55), for the
 * Readings section. An Administrator's alone, and 404 to anybody else. It never names a
 * credential or whose subscription it is: only the kind, and whether it is charged.
 */
export interface ReadingSetup {
  /** `null` where none is configured. */
  method: ReadingMethodKind | null;
  /** Whether what it reads is billed per use; `null` where there is no method. */
  charged: boolean | null;
  /** Whether a reading can start. */
  available: boolean;
  /** Why no reading can start, or `null` where one can. */
  unavailable: string | null;
}

/**
 * Where a Catalog run stands (issues #57, #58, #59, #65). `estimating`: uploaded, and being
 * priced page by page on the server. `estimated`: uploaded and priced, nothing read. `running`: reading on the server, whether or not anybody is watching. Then `finished`, or
 * stopped: before the next sheet could pass the spending limit, at the subscription plan's usage
 * limit, after the model failed or declined to answer, or because an Administrator pressed Stop.
 * A stopped run can be continued. `failed` is the end of it, with the reason.
 */
export type CatalogRunState =
  | 'estimating'
  | 'estimated'
  | 'running'
  | 'finished'
  | 'stopped-at-limit'
  | 'stopped-at-usage-limit'
  | 'stopped-after-failures'
  | 'stopped-by-administrator'
  | 'failed';

/**
 * What a person, or the server itself, did to a Catalog run (issue #59), or to a Tavola it read:
 * `removed` it (issue #85).
 */
export type CatalogRunActionKind = 'started' | 'raised' | 'continued' | 'stopped' | 'removed';

export interface CatalogRunAction {
  action: CatalogRunActionKind;
  /**
   * The Administrator who did it. `null` where the server carried the run on after a restart, or
   * where the Account has since been deleted.
   */
  by: { id: string; name: string } | null;
  at: string;
  /** The limit it was started with, or raised to, in dollars. `null` for the other actions. */
  limit: number | null;
  /** The number of the Tavola `removed`. `null` for the other actions. */
  tavola: string | null;
}

/** One Tavola of a Catalog run, as the run page lists it. */
export interface CatalogRunTavola {
  number: string;
  /** Whether it was read whole. One the run stopped in the middle of is not. */
  finished: boolean;
  /** In dollars, at the price list's prices: what it cost, or would have cost, so far. */
  cost: number;
  /** The Unchecked Tavola it became, or `null` where it has not become one. */
  tavolaId: string | null;
  /** Why it was not loaded into the archive, where it was not: it is Published, say. */
  refused: string | null;
  /**
   * When an Administrator removed the Tavola it became, and who (issue #85), or `null` where
   * nobody did. `by` is `null` where the Account has since been deleted.
   */
  removed: { by: { id: string; name: string } | null; at: string } | null;
  /**
   * The later Catalog run that read this Tavola again and replaced the one this run made, or
   * `null` where none did. Said instead of a bare "read", which is all a line whose Tavola has
   * gone could say before.
   */
  replacedBy: { runId: string } | null;
}

/**
 * `POST /api/catalog-runs?modelId=&firstPage=&lastPage=`, with the catalog PDF as the body, and
 * `GET /api/catalog-runs/:runId` — **one Catalog run**, for the Readings section. An
 * Administrator's alone, and 404 to anybody else. Like `ReadingSetup`, it names the kind of
 * Reading method and never a credential.
 */
export interface CatalogRun {
  id: string;
  state: CatalogRunState;
  model: { id: string; brand: string; name: string; series: string | null };
  /** The pages of the PDF to read, counting from 1, both included. */
  pages: { first: number; last: number };
  /** How many pages the uploaded PDF has. */
  catalogPages: number;
  /**
   * In dollars, at the price list's prices, for every page in `pages`. While it is `estimating`,
   * for the pages estimated so far.
   */
  estimate: number;
  /**
   * How far its estimate has got, while it is `estimating` (issue #65): how many of the `of` pages
   * to read have been priced. `null` in every other state.
   */
  estimating: { pages: number; of: number } | null;
  readingMethod: ReadingMethodKind;
  /** Whether what it reads is billed per use. Where it is not, `estimate` is what it would cost. */
  charged: boolean;
  /** The model the run is priced for, and the date its prices were checked. */
  priceList: { model: string; checkedOn: string };
  createdAt: string;
  /** The most it may cost, in dollars, given when it was started. `null` before then. */
  limit: number | null;
  /** What it has cost so far, in dollars: the running total held against `limit`. */
  spent: number;
  startedAt: string | null;
  endedAt: string | null;
  /**
   * Why a `failed` run failed, or why a stopped one stopped where its state does not say it all,
   * in words with no credential in them.
   */
  failure: string | null;
  /** Each Tavola the run has found, in the order it reads them. */
  tavole: CatalogRunTavola[];
  /**
   * **What it has not yet read** (issue #64), worked out from what it has done and so right
   * across stops, continuing and restarts. Both are empty once it has read everything.
   * - `tavole`: the Tavole it began reading and did not finish, in the order it reads them.
   * - `pages`: the pages to read it never reached, in page order. That is a page it has not yet
   *   identified, or one of a Tavola it has not begun. A page it set aside has been reached.
   */
  left: { tavole: string[]; pages: number[] };
  /** Who started, raised, continued and stopped it, and when, oldest first. */
  actions: CatalogRunAction[];
  /**
   * The pages it put into no Tavola, in page order, and why: a page whose Tavola number could not
   * be read is shown rather than guessed (issue #60). Empty until the run has ended.
   */
  setAside: CatalogRunSetAsidePage[];
  /**
   * Where the run reads one Unchecked Tavola again (issue #61): its number, and the pages of the
   * catalog it was found on, which are all the run reads. `null` for a run of the catalog.
   */
  readsAgain: { tavola: string; pages: number[] } | null;
  /**
   * **Its record** (issue #62): what each time it read cost, the first and then one for each time
   * it was continued, as `cost.json` held it. Empty until it has spent something.
   */
  costs: CatalogRunCostRecord[];
}

/** One request's token counts, as the response reported them, and what they cost in dollars. */
export interface CatalogRunSpent {
  input: number;
  output: number;
  cost: number;
}

/** What one page placed in a Tavola cost. */
export interface CatalogRunSheetCost {
  page: number;
  kind: 'drawing' | 'table';
  /** Everything below added up. */
  cost: number;
  /** Asking what the page is. Nothing where an earlier run had already asked. */
  identification: CatalogRunSpent;
  /** On a Table sheet, its two Readings. Empty on a drawing. */
  readings: (CatalogRunSpent & { reading: 1 | 2 })[];
  /** On a drawing, each request that read its numbers into proposed Marks. Empty on a sheet. */
  marks: CatalogRunSpent[];
}

/** One time a Catalog run read, from being started or continued to stopping or finishing. */
export interface CatalogRunCostRecord {
  /** 1 for the first time, then one more for each time it was continued. */
  time: number;
  /** The prices it was costed at, in `currency` per million tokens, and when they were checked. */
  priceList: {
    model: string;
    inputPerMillion: number;
    outputPerMillion: number;
    currency: string;
    checkedOn: string;
  };
  /** What was left of the run's limit this time, and what reading the rest was estimated at. */
  limit: number;
  estimate: number;
  total: number;
  /**
   * Why it stopped before it had read everything: the spending limit, the plan's usage limit, the
   * model failing or declining, or an Administrator asking. `null` where it did not stop.
   */
  stopped: 'spending-limit' | 'usage-limit' | 'method-failed' | 'asked' | null;
  tavole: {
    number: string;
    finished: boolean;
    cost: number;
    sheets: CatalogRunSheetCost[];
    /** Its Italian put into English. `null` where nothing was sent. */
    translation: CatalogRunSpent | null;
  }[];
  /** Pages asked what they are that went into no Tavola. */
  setAside: { page: number; identification: CatalogRunSpent }[];
  /**
   * Requests sent, and so paid for, whose answers were cut off when the server went away (issue
   * #66). Each is counted at the most it could cost, and is in `total`, which is why the total
   * can be more than what the answers add up to.
   */
  cutOff: CatalogRunCutOffRequest[];
}

/** A request whose answer never came back, at the most it could cost. */
export interface CatalogRunCutOffRequest {
  /** Asking what a page is, one Reading of a Table sheet, a drawing's numbers, or translating. */
  request: 'identification' | 'reading' | 'numbers' | 'translation';
  /** `null` for a translation, which is about a Tavola. */
  page: number | null;
  /** `null` for asking what a page is. */
  tavola: string | null;
  /** Which Reading, for a Reading; otherwise `null`. */
  reading: 1 | 2 | null;
  cost: number;
}

/**
 * `GET /api/catalog-runs` — **every Catalog run, the latest first** (issue #62), for the Readings
 * section. Each opens its record at `GET /api/catalog-runs/:runId`. An Administrator's alone, and
 * 404 to anybody else.
 */
export interface CatalogRunsResponse {
  runs: CatalogRunListed[];
}

export interface CatalogRunListed {
  id: string;
  model: CatalogRun['model'];
  state: CatalogRunState;
  createdAt: string;
  startedAt: string | null;
  /** What it has cost, or would have cost where it is not charged, in dollars. */
  spent: number;
  estimate: number;
  readingMethod: ReadingMethodKind;
  charged: boolean;
  readsAgain: CatalogRun['readsAgain'];
  /** How many of the Tavole it read an Administrator has since removed (issue #85). */
  removed: number;
}

export interface CatalogRunSetAsidePage {
  page: number;
  reason: string;
  /** Where its image is served, to Administrators only. */
  image: string;
}

export interface CatalogRunResponse {
  run: CatalogRun;
}

/**
 * `POST /api/catalog-runs/:runId/start` — an estimated run started, held to `limit` dollars.
 * There is no default limit, and one below the estimate is refused. Answers `CatalogRunResponse`
 * at once: the reading goes on in the background.
 */
export interface StartCatalogRunRequest {
  limit: number;
}

/**
 * `POST /api/catalog-runs/:runId/continue` — a stopped run read on from where it stopped (issue
 * #59). `limit` raises its spending limit first, and is needed where the limit is what stopped
 * it. Answers `CatalogRunResponse` at once.
 *
 * `POST /api/catalog-runs/:runId/stop`, with no body, stops a running run before its next request.
 */
export interface ContinueCatalogRunRequest {
  limit?: number;
}

/**
 * `GET /api/catalog-runs/read-again?tavolaId=` — the Catalog run a Tavola would be read again
 * from: the one that last read it, or `null` where none did (issue #61). An Administrator's alone,
 * and 404 to anybody else.
 */
export interface ReadAgainFromResponse {
  runId: string | null;
}

/**
 * `POST /api/catalog-runs/read-again` — an Unchecked Tavola's own run, estimated for reading only
 * its pages again from the stored catalog. Answers `CatalogRunResponse`, a run to start as any
 * other. Refused, with the reason, for a Published Tavola and for one with Contributions on its
 * Positions.
 */
export interface ReadAgainRequest {
  tavolaId: string;
}

/**
 * `DELETE /api/tavole/:tavolaId` — an Unchecked Tavola removed, with its Positions, Marks,
 * Listings, doubts, Scan and Table sheets, and the Parts listed nowhere else (issue #83). Answers
 * with the Model it belonged to. Refused, with the reason, for a Published Tavola, for one with
 * Contributions on its Positions, and while a Catalog run is reading or being estimated. An
 * Administrator's alone, and 404 to anybody else.
 */
export interface RemovedTavolaResponse {
  modelId: string;
}

/**
 * `GET /api/tavole/:tavolaId/removal` — what removing an Unchecked Tavola would take with it,
 * before anything is removed (issue #84), by the same reckoning the removal then applies. Refused
 * with the reason, as the removal would be. An Administrator's alone, and 404 to anybody else.
 */
export interface TavolaRemovalResponse {
  removal: TavolaRemoval;
}

export interface TavolaRemoval {
  positions: number;
  marks: number;
  listings: number;
  tableSheets: number;
  scan: boolean;
  /** The Parts listed on it and nowhere else, which go with it. Parts listed elsewhere stay. */
  parts: {
    id: string;
    catalogNumber: string | null;
    nameIt: string | null;
    nameEn: string | null;
  }[];
}

/** Which way a quarter turn goes, looking at the drawing. */
export type QuarterTurn = 'clockwise' | 'anticlockwise';

/**
 * `POST /api/tavole/:tavolaId/scan/turns` — the Scan turned a quarter, its Marks with it. Answers
 * `{ scan: TavolaScan }`, at a new address: the drawing at the old one has not changed.
 */
export interface TurnScanRequest {
  direction: QuarterTurn;
}

/** `POST /api/tavole/:tavolaId/publication` — an Editor publishing an Unchecked Tavola. */
export interface TavolaPublishedResponse {
  tavola: TavolaSummary & { publication: TavolaPublication };
}

/**
 * A component, identified in its own right rather than by where it appears (ADR 0001).
 *
 * **Every field but the identity is optional, and that is the archive being honest.** A large
 * part of what arrives has a description and no number at all; a Part with no Catalog Number is
 * fully legitimate and the interface says so rather than printing a placeholder. What is
 * guaranteed is that a Part can be *named*: one of the two names is always there.
 *
 * `catalogNote` and `note` are two fields and are never merged. One is transcribed from the
 * factory catalog and nobody may improve it; the other is what the club has worked out. A
 * member has to be able to tell evidence from interpretation (story 62), and a shape that
 * concatenated them would make that impossible downstream of here.
 */
export interface Part {
  id: string;
  /** What a member reads. At least one of the two is present. */
  nameEn: string | null;
  /**
   * `nameEn` is a Machine translation nobody has vouched for yet: shown labelled, with the
   * Italian beside it, until an Editor confirms or rewrites it.
   */
  nameEnMachineTranslated: boolean;
  /** The factory's own words, as the catalog prints them. */
  nameIt: string | null;
  /**
   * The factory's identifying number, from the catalog's first column. Unique across the
   * archive when present, which is what keeps "where else does this Part appear" honest — and
   * absent for a great many Parts, which is ordinary rather than incomplete.
   */
  catalogNumber: string | null;
  /** The original factory drawing number. Prominent, authoritative, and *not* unique. */
  disegnoOrigine: string | null;
  description: string | null;
  dimensions: string | null;
  materialFinish: string | null;
  /** Transcribed from the factory catalog, in the factory's words. Evidence, not opinion. */
  catalogNote: string | null;
  /**
   * A Machine translation of `catalogNote`, always shown as one and beside it. Codes and numbers
   * in it are the note's own, unaltered.
   */
  catalogNoteEn: string | null;
  /** What the club has established, written by an Editor. Never merged with the above. */
  note: string | null;
}

/**
 * A statement that a Part fits a Model, in the words of whoever knew it.
 *
 * **The qualifier is free text and is never parsed** (story 71). Half of what the club knows
 * about where one bracket stops and the next begins is *"from chassis #310"*, *"late"*, or
 * *"1963–64"* — a break somebody half-remembers from a car they owned. Structured date and
 * chassis ranges would demand a precision nobody has and would silently drop everything that
 * did not fit the shape, so the member reads the qualification and judges compatibility
 * themselves.
 */
export interface Fitment {
  id: string;
  /** The whole Model, because it may well not be the car the member is looking at. */
  model: CatalogModel;
  /** As it was written. `null` where the Part fits the car without qualification. */
  qualifier: string | null;
}

/**
 * What kind of thing an Equivalent names.
 *
 * The four are not degrees of the same thing — they are four different answers to *"what can I
 * buy instead"*, and which one it is changes what a restorer does next. A **donor vehicle** is
 * the odd one and the most valuable: it sends somebody to a scrapyard rather than to a
 * catalogue (story 73).
 */
export type EquivalentKind = 'oe-supplier' | 'oem' | 'industry-standard' | 'donor-vehicle';

/**
 * Another way to obtain what a Part does — **the single most valuable content this archive will
 * hold**, because the original is usually unobtainable and the equivalent usually is not.
 *
 * There is no limit on how many a Part may have and there are no fixed slots: a Part carrying
 * six known cross-references keeps six, rather than losing four of them because somebody once
 * drew a table with two columns.
 */
export interface Equivalent {
  id: string;
  kind: EquivalentKind;
  /** Who or what it is of — *Girling*, *SKF*, *DIN 934*, *Fiat 124 Coupé*. */
  maker: string;
  /**
   * The number to quote. **Absent is ordinary**, and for a Donor Vehicle it is the usual case:
   * often nobody knows what the other manufacturer called it, and the car alone is the useful
   * fact.
   */
  reference: string | null;
  note: string | null;
}

/** What is being offered. A restorer's decision changes completely depending on which. */
export type SourceCondition = 'new-old-stock' | 'used' | 'reproduction';

/** Where these cars actually trade. A fixed set, so no Source carries a currency nobody sells in. */
export type Currency = 'EUR' | 'USD' | 'GBP' | 'CHF';

/**
 * A price **and the date it was seen**, which is one fact and not two.
 *
 * This shape exists so that a price without its date cannot be *represented*, let alone
 * rendered (stories 75–76). Three loose optional fields on the Source would leave every screen
 * that ever prints a price responsible for remembering the rule; here there is nothing to
 * remember, because there is no price to reach without the date beside it.
 */
export interface ObservedPrice {
  /** In the currency's minor unit — `25000` is €250.00. Never a fraction, never a float. */
  amount: number;
  currency: Currency;
  /** ISO `YYYY-MM-DD`. What makes the amount above worth anything at all. */
  observedOn: string;
}

/** Somewhere a Part has actually been available (story 74). */
export interface Source {
  id: string;
  name: string;
  url: string;
  /** `null` where the offer did not say. The archive says so rather than guessing. */
  condition: SourceCondition | null;
  /** The price and the date it was seen, or nothing. Never one without the other. */
  price: ObservedPrice | null;
  note: string | null;
}

/**
 * A photograph of a Part — **the check no part number can give anybody** (story 77).
 *
 * A member with a bracket in their hand is not comparing a description; they are comparing a
 * shape. So this is the one thing in the archive that answers "is this the one" without being
 * read at all, and it is why the panel puts it above the numbers rather than after the prose.
 *
 * Every address here is authenticated and immutable, exactly as a Tavola's scan is (ADR 0006):
 * these are the Club's photographs, and a re-upload is a new Photograph and therefore a new
 * address. `width` and `height` are the *display* image's, so a grid knows the shape of the
 * picture before it arrives and nothing reflows under a member's thumb.
 */
export interface Photograph {
  id: string;
  width: number;
  height: number;
  /** The whole photograph, prepared at ingest. What "view it larger" opens. */
  displayUrl: string;
  /** A thumbnail, so a Position carrying five Parts does not download five photographs. */
  previewUrl: string;
}

/**
 * A Part with everything the archive holds about it — **what a member reads at a circle**.
 *
 * The five collections are the Part's and not the Listing's: what it is made of and weighs,
 * which cars it fits, what can be bought instead of it, where it has been available and what it
 * looks like are true of the component wherever it is listed, which is ADR 0001 showing up in a
 * response shape. They hang
 * off this rather than off `Part` so that the bare identity — what a refused Catalog Number
 * hands back, what a Tavola's index prints — stays the small thing it is.
 */
export interface PartInFull extends Part {
  /** In the order of the Administrator's list of names. Empty for a Part with none. */
  specifications: Specification[];
  fitments: Fitment[];
  equivalents: Equivalent[];
  sources: Source[];
  /** In the order an Editor put them in. The first is the one that identifies the Part. */
  photographs: Photograph[];
}

/**
 * One Part's appearance on one Tavola: where it sits, how many are fitted per car *there*, and
 * whether the drawing shows it.
 *
 * **The quantity lives here and not on the Part**, because the same washer legitimately takes
 * four on one drawing and two on another. `null` means nobody has recorded one — the archive
 * does not invent a `1`.
 *
 * `drawn` is the difference between an alternative and an addition, and it is the field a member
 * cannot afford to have shown to them ambiguously: several **drawn** Parts at one Position are
 * fitted instead of one another, while **undrawn** ones — the screws and washers — are all
 * needed as well. Confusing the two means the wrong parts arrive in the post.
 */
export interface PartListing {
  id: string;
  quantityPerCar: number | null;
  drawn: boolean;
  part: PartInFull;
  /**
   * The other Tavole this Part is listed on, so a member learns where else it is used. The
   * Tavola being read is not among them.
   */
  elsewhere: ListedElsewhere[];
}

/** Somewhere else the same Part is listed — another sheet, and possibly another car. */
export interface ListedElsewhere {
  tavolaId: string;
  /** As printed on that sheet. */
  tavolaNumber: string;
  /** Ricambi is English; the Italian name of a sheet belongs on the sheet's own page… */
  nameEn: string;
  /** …unless the English is a Machine translation, which is never shown without the Italian. */
  nameEnMachineTranslated: boolean;
  nameIt: string;
  /** A Tavola belongs to one Model (ADR 0002), and the Model may not be the one being read. */
  model: CatalogModel;
  /** `null` where the Part is listed on that Tavola without a Position of its own. */
  positionNumber: string | null;
  quantityPerCar: number | null;
}

/**
 * A Part as the Tavola's own index names it — **the four things a printed catalog page prints
 * in its columns**, and deliberately nothing else.
 *
 * Derived from `Part` rather than written out again, so a field renamed there is renamed here.
 * What is left out is the point: a sheet may carry two hundred Positions with several Parts on
 * each, and shipping every description, transcribed catalog note and club note to draw a *list*
 * would be a drawing's worth of prose nobody has asked to read. The whole Part arrives when a
 * member picks one, at `PositionListingsResponse`.
 */
export type ListedPart = Pick<
  Part,
  'id' | 'nameEn' | 'nameEnMachineTranslated' | 'nameIt' | 'catalogNumber'
>;

/**
 * One line of a Tavola's index: what is listed on the sheet, and at which number.
 *
 * The Position is named by **id alone**, because anything reading this list is reading it against
 * the sheet it belongs to and already holds that sheet's Positions with their printed numbers.
 * Carrying the number here as well would be the same fact in two places, free to disagree.
 */
export interface TavolaListing {
  id: string;
  /** `null` for a Part the catalog names on this sheet without a number of its own. */
  positionId: string | null;
  quantityPerCar: number | null;
  drawn: boolean;
  part: ListedPart;
}

/**
 * `GET /api/tavole/:tavolaId/listings` — **the sheet's own text, so a member can work from it.**
 *
 * The facing page of a factory catalog: everything listed on this drawing, in the order the
 * factory printed the numbers, with the Listings that sit at no number at all last. It is what
 * makes navigation two-way (story 46) and it is also the only way to know which Positions have
 * nothing recorded at them yet — a Position absent from this list is one nobody has written
 * anything down about, which is a different thing from one nobody has clicked (story 45).
 */
export interface TavolaListingsResponse {
  listings: TavolaListing[];
}

/**
 * `GET /api/positions/:positionId/listings` — **what sits at a number a member has clicked.**
 *
 * The sentence the whole product exists to complete ends here. It is read separately from the
 * sheet rather than carried on every Position of it: a Tavola may hold two hundred Positions,
 * each with several Parts and each Part's other appearances, and a member reads one at a time.
 *
 * Ordered with the **drawn** Listings first, because they are the alternatives — what the
 * Position's number actually points at — and the undrawn ones are what is needed as well.
 */
export interface PositionListingsResponse {
  listings: PartListing[];
}

/**
 * **How much of one sheet has been done** — the three counts an Editor opens a Tavola wanting.
 *
 * The two are counted separately and neither is a stage of the other: a Position carries Marks
 * or it does not, and it carries a Listing or it does not, and the ordinary archive has plenty
 * of each without the other.
 *
 * **They are counts and not a score, and nothing here can tell the difference.** A number the
 * catalog prints that the drawing never showed is *finished* with no Mark on it (GLOSSARY.md), so
 * `marked` short of `positions` may mean an evening's work or may mean a sheet that is done —
 * and which of the two it is lives on paper in front of an Editor, not in this archive. Screens
 * may print `marked` against `positions`, because that is the fact; what none of them may do is
 * call the difference *outstanding*, or turn it into a percentage complete.
 *
 * The Tavola is named by **id alone**, because anything reading this is reading it against the
 * Model's own list of sheets and already holds their numbers and names. Carrying them here as
 * well would be the same fact in two places, free to disagree.
 */
export interface TavolaProgress {
  tavolaId: string;
  /** Every number recorded on the sheet. Zero for a Tavola nobody has marked up yet. */
  positions: number;
  /** How many of them carry at least one Mark. */
  marked: number;
  /** How many of them carry at least one Listing. */
  listed: number;
}

/**
 * `GET /api/models/:modelId/progress` — **where the work stands across one car's drawings.**
 *
 * Counted in the database rather than assembled from the sheets, because the alternative is one
 * request per Tavola: a Model with sixty of them would read sixty drawings' worth of Positions
 * and sixty indexes to print a table of counts. A Tavola's *own* progress needs no request at
 * all — the sheet and its index are already in the browser that is showing them.
 *
 * In the Model's own catalog order, which is the order its Tavole are listed in. Which of them
 * to do next is the Editor's judgement, and an archive that re-ordered the catalog by how much
 * was left would be answering that for them.
 */
export interface ModelProgressResponse {
  tavole: TavolaProgress[];
}

/**
 * `POST /api/models` — what an Editor records about a car.
 *
 * The **wire** shape, which is why every field is a plain string: a form sends what was typed,
 * and blank means "the catalog does not go that far" rather than a value. The API narrows it to
 * its own shape on the way in, and that narrowing is the API's business.
 */
export interface NewModelRequest {
  brand: string;
  name: string;
  series: string;
  modelYears: string;
}

/** `POST /api/models/:modelId/tavole` — what an Editor records about a drawing. */
export interface NewTavolaRequest {
  /** As printed on the sheet. */
  number: string;
  nameIt: string;
  nameEn: string;
  /**
   * Chosen from the maintained list, by name or by slug — never typed into existence. Blank
   * records the Tavola with no Category yet; a name that is not on the list is refused.
   */
  category: string;
  /** The factory's own header, as printed. Blank where the sheet prints none. */
  catalogSection: string;
  catalogGroup: string;
  catalogSubgroup: string;
}

/**
 * `POST /api/tavole/:tavolaId/marks` — **the one-click primitive, and the reason it looks like
 * this.**
 *
 * Placing a Mark is the project's critical path: hundreds of Tavole, over two hundred Positions
 * on some of them, all of it volunteers' evenings. So one click is one request. The number
 * names the Position rather than an id, because at the moment of the click the Editor knows
 * what the factory printed and the archive may or may not have heard of it yet — the API finds
 * that Position or records it, and either way answers with the whole of it.
 */
export interface NewMarkRequest extends MarkPoint {
  /** As printed on the sheet. */
  number: string;
}

/** `POST /api/tavole/:tavolaId/positions` — a number the catalog lists but the drawing omits. */
export interface NewPositionRequest {
  number: string;
}

/** `PATCH /api/marks/:markId` — a circle an Editor put in the wrong place. */
export type MoveMarkRequest = MarkPoint;

/**
 * `POST /api/tavole/:tavolaId/sub-assemblies` — putting numbers into a named one (story 106).
 *
 * **It is named rather than chosen**, and the name is what decides which Sub-assembly it is: a
 * sheet has one *Door Lock*, so sending that name again puts these numbers into the one that
 * already exists rather than beside it. Two of one name on one sheet would be one Sub-assembly
 * recorded twice, and reading them as two would split the very numbers it exists to hold
 * together.
 *
 * A Position that is already in another Sub-assembly is **moved**, because an Editor naming it
 * here means it — that is the difference between this and a migration reconciling two
 * spreadsheets. And one whose last Position leaves it stops existing, so nothing accumulates a
 * list of names pointing at nothing.
 */
export interface NewSubAssemblyRequest {
  name: string;
  /** At least one. One with no numbers in it is a name for nothing, and is refused. */
  positionIds: string[];
}

/**
 * `GET /api/tavole/:tavolaId/sub-assemblies/:subAssemblyId` — **a Sub-assembly read as one
 * thing** (issue #110): its name, what the club has written about it, and its numbers with what
 * sits at each.
 *
 * Addressed under its Tavola because that is the only place it exists, which is also what puts it
 * behind everything a Tavola is behind. The sheet itself still carries only the name
 * (`SubAssembly`): a Note is prose, and a drawing's worth of it is nobody's to ship to draw a list.
 */
export interface SubAssemblyResponse {
  subAssembly: SubAssemblyInFull;
  /** Its numbers, in the order the factory printed them. */
  positions: SubAssemblyPosition[];
}

export interface SubAssemblyInFull extends SubAssembly {
  /** What the club has established about the assembly as a whole, written by an Editor. */
  note: string | null;
  /**
   * The assembly as restorers photograph it (issue #114), in the order an Editor put them in. The
   * first is the one that identifies it. As private as a Part's, at the same addresses.
   */
  photographs: Photograph[];
}

/**
 * One of a Sub-assembly's numbers, with the Parts listed at it — named as the sheet's own index
 * names them, drawn ones first. A number nobody has recorded anything at yet has none.
 */
export interface SubAssemblyPosition {
  id: string;
  /** As printed. What a link to it on the drawing is built from. */
  number: string;
  parts: ListedPart[];
}

/**
 * `PUT /api/sub-assemblies/:subAssemblyId/note` — an Editor writing, changing or clearing a
 * Sub-assembly's Note. Blank or `null` clears it, as it does a Part's. Answers with the page.
 */
export interface SubAssemblyNoteRequest {
  note: string | null;
}

/*
 * `POST /api/sub-assemblies/:subAssemblyId/photographs` — the photograph is the body, as it is for
 * a Part's. `PATCH` the same address with a `ReorderPhotographsRequest` to name the whole order,
 * and `DELETE /api/sub-assemblies/:subAssemblyId/photographs/:photographId` to remove one. Each
 * answers with the page, `SubAssemblyResponse`, re-read.
 */

/**
 * `PUT /api/sub-assemblies/:subAssemblyId/outline` — an Editor drawing a Sub-assembly's outline,
 * or replacing the one it has: a Sub-assembly has at most one. At least three corners, each on
 * the drawing (`0`–`1` both ways). Answers with the sheet; `DELETE` on the same address removes
 * the outline and leaves the Sub-assembly.
 */
export interface SubAssemblyOutlineRequest {
  corners: MarkPoint[];
}

/**
 * `POST /api/tavole/:tavolaId/related-positions` — the narrow, hand-picked pointer (story 107).
 *
 * **Recorded once, from either end.** The two ids are interchangeable: whichever way round they
 * arrive, one row is written and both Positions report it. Sending the same pair again — in
 * either order — is refused as already recorded rather than written twice, which is what "nobody
 * has to remember to enter it twice" has to mean at the point of entry as well as at the point of
 * reading.
 */
export interface RelatePositionsRequest {
  positionId: string;
  otherPositionId: string;
}

/**
 * What an Editor types about a component (story 101).
 *
 * The **wire** shape, which is why every field is a plain string: a form sends what was typed,
 * and blank means "not recorded" rather than a value. The API narrows it on the way in, and the
 * trim it applies is of the whitespace a form adds around a value and never of the value itself
 * — a Catalog Number printed `260 03 150` keeps its spacing, because it is an identifier
 * compared character by character against a printed page.
 */
export interface NewPartRequest {
  nameEn: string;
  nameIt: string;
  catalogNumber: string;
  disegnoOrigine: string;
  description: string;
  dimensions: string;
  materialFinish: string;
  catalogNote: string;
  note: string;
}

/**
 * `POST /api/tavole/:tavolaId/listings` — placing a Part on a drawing.
 *
 * **It names an existing Part or records a new one, never both and never neither.** That is the
 * whole of ADR 0001 expressed as a request: a Part used on six drawings stays one Part, so
 * listing it a second time carries its id (story 103); a Part the archive has not met before
 * arrives whole. Sending a `part` whose Catalog Number is already recorded is refused with the
 * existing Part in `details`, which is the merge-or-correct rule and not an error to route
 * around.
 */
export interface NewListingRequest {
  /** Absent for a Part listed on the sheet without a Position of its own. */
  positionId?: string | null;
  /** How many are fitted per car *here*. Absent where the catalog prints none. */
  quantityPerCar?: number | null;
  /** Whether the Position's number points at this Part. Fasteners are listed undrawn. */
  drawn: boolean;
  partId?: string;
  part?: NewPartRequest;
}

/**
 * `PATCH /api/listings/:listingId` — a Listing an Editor got wrong.
 *
 * **The three fields a Listing has of its own**, and the Part is not among them: correcting *what
 * the Part is* is `CorrectPartRequest` below, and a Listing that could be pointed at a
 * different Part would be a way of editing two records with one press. Moving one to another
 * number is ordinary — a Part transcribed against the wrong line of a catalog page — and so is
 * clearing the number altogether, which is the state a Position removed out from under it leaves
 * it in.
 */
export interface CorrectListingRequest {
  /** Absent or null for a Part listed on the sheet without a Position of its own. */
  positionId?: string | null;
  quantityPerCar?: number | null;
  drawn: boolean;
}

/**
 * `PATCH /api/parts/:partId` — **the same nine fields recording one takes**, which is the point.
 *
 * Every field is sent whether or not it changed, so a value can be **cleared** as well as
 * corrected: blank means "not recorded", exactly as it does on the way in, and a Part whose
 * Catalog Number turns out to belong to something else has to be able to go back to having none
 * (ADR 0001 — no number is invented, and none is a legitimate state).
 *
 * A Catalog Number edited into one another Part already holds is refused the same way entering
 * one is, carrying that Part in `details`. The rule is the archive's, not the form's, so it
 * cannot depend on which screen the number was typed on.
 */
export type CorrectPartRequest = NewPartRequest;

/**
 * A sheet a Part is listed on, as an Editor's lookup reports it.
 *
 * **One entry per Tavola and not per Listing**, which is the difference between this and
 * `ListedElsewhere`: a Part at three numbers on one drawing is on *one* drawing, and what an
 * Editor about to correct it needs to know is how many sheets the correction reaches. The Model
 * comes with it because a Tavola belongs to exactly one (ADR 0002) and it may well not be the car
 * being looked at.
 */
export interface ListedOn {
  tavolaId: string;
  /** As printed on that sheet. */
  tavolaNumber: string;
  /** Ricambi is English; the Italian name of a sheet belongs on the sheet's own page. */
  nameEn: string;
  model: CatalogModel;
}

/**
 * A Part the lookup found, and every Tavola it is listed on.
 *
 * **An empty `listedOn` is the interesting case.** A Part whose last Listing was removed is
 * listed nowhere: invisible on every screen that reads from a drawing, reachable from nothing,
 * and still holding its Catalog Number — so retyping that number is refused and points at
 * something the Editor cannot see. This is what makes it findable, and therefore correctable or
 * removable, rather than a phantom.
 *
 * The bare `Part` and not the whole of it: this is a list to pick from, and what fits the
 * Part, what replaces it and where it has been available arrive when one is picked.
 */
export interface FoundPart {
  part: Part;
  listedOn: ListedOn[];
}

/**
 * `GET /api/parts?q=` — **an Editor's tool for listing a Part the archive already has.**
 *
 * It matches exactly what `SearchResponse` matches, through the same rule: the same five fields,
 * the same indifference to how a number is spaced, the same prefix. What differs is what it
 * *reports*. Search names every number a Part sits at, because a member wants the right circle;
 * this names one row per **sheet**, because an Editor about to correct a Part is deciding how far
 * the correction reaches, and a washer at four numbers on one drawing changes one drawing.
 *
 * `more` is set when the archive held back matches rather than reporting them all. It exists so
 * that a capped list can never read as a complete one — an Editor told "no such Part" by a
 * truncated answer would record a second copy of it.
 */
export interface PartLookupResponse {
  parts: FoundPart[];
  more: boolean;
}

/**
 * Somewhere a Part a search found is listed — **the car, the sheet and the number**, which is
 * the whole of what a member needs in order to say "that one is mine" (story 82).
 *
 * One entry per Listing rather than per Tavola, which is what separates it from `ListedOn`: a
 * washer at three numbers on one drawing is three circles to go and look at, and each of them is
 * somewhere the browser can send a member straight to.
 *
 * The Model comes with it because a Tavola belongs to exactly one (ADR 0002), and in a list of
 * results reached from a number rather than from a car it is the first thing to read.
 */
export interface SearchListing {
  /**
   * The Listing's own id. Nothing is addressed by it here — it is identity, so that a list of a
   * Part's appearances can be told apart by what they *are* rather than by a sheet and a number
   * reassembled into a key, which is only unique for as long as the constraints that make it so.
   */
  id: string;
  tavolaId: string;
  /** As printed on that sheet. */
  tavolaNumber: string;
  /** Ricambi is English; the Italian name of a sheet belongs on the sheet's own page… */
  nameEn: string;
  /** …unless the English is a Machine translation, which is never shown without the Italian. */
  nameEnMachineTranslated: boolean;
  nameIt: string;
  model: CatalogModel;
  /** `null` where the Part is listed on that Tavola without a Position of its own. */
  positionNumber: string | null;
}

/**
 * A Part a search found, wherever it is listed, and **why it matched where the reason is not on
 * the Part itself.**
 *
 * `matchedEquivalents` is that last clause and it is the reverse lookup made checkable. Somebody
 * holding a modern bearing marked `6205` is asking what it replaces; an answer reading only
 * "Front wheel bearing" gives them nothing to hold the bearing up against, so the Equivalents the
 * query actually matched come back with it. It is empty for a Part found by its own number or
 * name, because then there is nothing to explain.
 *
 * The bare `Part` and not the whole of it: this is a list to pick from, and what fits the Part,
 * what replaces it and where it has been available arrive when the member picks one and lands on
 * it in the context of a drawing.
 */
export interface SearchMatch {
  part: Part;
  /** Only the Equivalents this query matched, in the archive's own order. Usually empty. */
  matchedEquivalents: Equivalent[];
  /** Empty for a Part listed on no drawing — findable, correctable, and nowhere to go. */
  listings: SearchListing[];
}

/**
 * `GET /api/search?q=` — **the way into the archive that does not start at the car.**
 *
 * Matched over five fields and no more: Catalog Number, Disegno Origine, an Equivalent's
 * reference, and either name. The three numbers match **however the query is spaced**, because
 * the catalog prints `260 03 150` and the bracket in somebody's hand is stamped `26003150`.
 * Notes, Catalog Notes, descriptions and Contributions are deliberately not searched (spec) —
 * that would be free-text search, and this is Postgres with no relevance ranking behind it.
 *
 * The order is the archive's rather than a score: the number typed exactly first, then the
 * catalog's own order. `more` is set when matches were held back, so that a capped list can never
 * read as a complete one — a member told "nothing else matches" goes looking for a Part the
 * archive has.
 */
export interface SearchResponse {
  matches: SearchMatch[];
  more: boolean;
}

/**
 * `GET /api/parts/:partId`, and what correcting one answers with: **the whole Part, and every
 * sheet a correction to it reaches.**
 *
 * The two travel together because the second is what makes the first safe to change. A Part is
 * one thing (ADR 0001), so correcting it corrects it at every number it sits at on every drawing
 * — which is invisible from a screen showing one Position, and is the fact an Editor has to be
 * holding *before* they save rather than after.
 */
export interface PartResponse {
  part: PartInFull;
  listedOn: ListedOn[];
}

/**
 * `POST /api/parts/:partId/fitments`, and `PATCH /api/fitments/:fitmentId` to correct one.
 *
 * The qualifier is a plain string because it is a plain string all the way down: blank means the
 * Part fits the car without qualification, and anything else is recorded as it was typed.
 */
export interface FitmentRequest {
  modelId: string;
  qualifier: string;
}

/** `POST /api/parts/:partId/equivalents`, and `PATCH /api/equivalents/:equivalentId`. */
export interface EquivalentRequest {
  kind: EquivalentKind;
  maker: string;
  /** Blank where nobody knows it — which for a Donor Vehicle is the ordinary case. */
  reference: string;
  note: string;
}

/**
 * `POST /api/parts/:partId/sources`, and `PATCH /api/sources/:sourceId`.
 *
 * The **wire** shape, so every field is what a form sent. The price is the string that was typed
 * — `250`, `250.00`, `250,50` — and the API turns it into minor units, because a decimal that
 * travelled as a number would have been rounded by somebody's browser before it arrived.
 *
 * **A price sent without `observedOn` is refused**, at the point of entry rather than hidden at
 * display. That refusal is the whole of stories 75 and 76: an archive that quietly dropped the
 * date would go on showing a figure from 2011 as though somebody had checked this morning.
 */
export interface NewSourceRequest {
  name: string;
  url: string;
  /** Blank where the offer does not say what it is offering. */
  condition: SourceCondition | '';
  /** Blank for a Source recorded without one, which is most of them. */
  price: string;
  currency: Currency;
  /** ISO `YYYY-MM-DD`. Required the moment there is a price, and meaningless without one. */
  observedOn: string;
  note: string;
}

/**
 * What recording, correcting or removing a Fitment, an Equivalent or a Source answers with:
 * **the whole Part, re-read.**
 *
 * The same argument `PositionsResponse` makes about a sheet's numbers. Each of the three is an
 * ordered list — the cars in the catalog's own order, the equivalents by kind, the sources with
 * the most recently seen price first — and the order is the archive's rule. A browser handed the
 * one row that changed would have to work out where it goes, in three different orders, in a
 * second place free to disagree with this one.
 */
export interface PartRecordResponse {
  part: PartInFull;
}

/**
 * Where a Contribution was written — **a Part or a Position, and the second matters as much as
 * the first.** The archive deliberately shows members which circles have nothing recorded at
 * them; if the only thing that could be written about were a Part that does not exist yet, it
 * would be pointing at a gap and offering no way to fill it (story 84).
 */
export type ContributionTarget =
  { kind: 'part'; partId: string } | { kind: 'position'; positionId: string };

/**
 * Where a Contribution stands, **as far as anybody reading the archive is ever told.**
 *
 * `waiting` is only ever said to the member who wrote it. A Contribution an Editor has discarded
 * is not published and is not here at all.
 */
export type ContributionState = 'waiting' | 'published';

/**
 * Something a Member offers about a Part or a Position — what they know, in their words, with
 * photographs if they have them (GLOSSARY.md).
 *
 * **It is prose and pictures and nothing else.** There is no field in it that names a field of
 * the Part, and that is deliberate: a correction reaches the record through an Editor's hands,
 * who reads this and edits the Part. `correction` says only that the member wrote it *because
 * the record is wrong* (story 90), so that an Editor reads it as something to act on rather than
 * something to publish beside the mistake.
 */
export interface Contribution {
  id: string;
  target: ContributionTarget;
  /** As the member wrote it, line breaks and all. */
  text: string;
  /** The member is reporting that the Part's record is wrong. Never true of a Position. */
  correction: boolean;
  /**
   * Who wrote it, which is what lets another member judge it and follow up (story 89).
   *
   * `null` where the Account behind it is gone: the knowledge stays and the identification does
   * not (ADR 0007). A screen says "a former member" and nothing more.
   */
  authorName: string | null;
  /** ISO instant, from the archive's clock. */
  writtenAt: string;
  state: ContributionState;
  /** Whether the person asking is the person who wrote it. */
  mine: boolean;
  /** In the order they were attached. Addressed and served like every other image (ADR 0006). */
  photographs: Photograph[];
}

/**
 * `POST /api/parts/:partId/contributions` and `POST /api/positions/:positionId/contributions`.
 *
 * Photographs are not here. Each is sent on its own afterwards, to the Contribution this
 * answers with — so the words have arrived before the first picture starts up a garage's
 * reception, and a photograph that fails takes nothing with it.
 */
export interface NewContributionRequest {
  text: string;
  /** Only meaningful against a Part. Left out, it is an ordinary Contribution. */
  correction?: boolean;
}

/** What writing one, or attaching a photograph to one, answers with: the whole of it, re-read. */
export interface ContributionResponse {
  contribution: Contribution;
}

/**
 * `GET /api/positions/:positionId/contributions` — **everything members have said about what a
 * member is looking at**: the number itself, and every Part listed at it.
 *
 * One request for a click, like the Listings it is read beside. A Part's Contributions are the
 * Part's (ADR 0001), so the same ones answer at every number that Part sits at, on every sheet.
 *
 * **What is here depends on who asked.** Everybody is given what has been published; the member
 * who wrote something still waiting is given that as well, and nobody else is. Oldest first.
 */
export interface ContributionsResponse {
  contributions: Contribution[];
}

/**
 * What a waiting Contribution is **about, as the archive has it now** — which is what an Editor
 * judges it against (story 116).
 *
 * For a Part that is the whole record and every sheet a correction to it would reach, exactly
 * as `PartResponse` carries them. For a Position it is where the number is and whatever already
 * sits at it — usually nothing, which is why the member wrote.
 */
export type ContributionSubject =
  | { kind: 'part'; part: PartInFull; listedOn: ListedOn[] }
  | {
      kind: 'position';
      position: { id: string; number: string };
      tavola: { id: string; number: string; nameEn: string; model: CatalogModel };
      listings: PartListing[];
    };

/** One Contribution an Editor has yet to decide, beside the record it is about. */
export interface WaitingContribution {
  contribution: Contribution;
  subject: ContributionSubject;
}

/**
 * `GET /api/contributions/waiting` — **everything members have sent that nobody has decided,
 * oldest first**, so that nobody's is forgotten (story 115). An Editor's, and nobody else's.
 *
 * Every write an Editor makes while reviewing answers with this too, re-read: deciding one takes
 * it out, and recording a Part from one changes what it is about.
 */
export interface WaitingContributionsResponse {
  contributions: WaitingContribution[];
}

/**
 * `GET /api/contributions/waiting/count` — how many, and nothing else. What the chrome asks on
 * every screen, so that the queue is noticed without being opened.
 */
export interface WaitingCountResponse {
  waiting: number;
}

/**
 * `PUT /api/contributions/:contributionId/decision` — **published or discarded, and decided
 * once.** There is nothing between the two and no way back from either: an Editor who wants a
 * correction in the archive edits the Part, and that edit is the record of it.
 */
export interface DecideContributionRequest {
  decision: 'publish' | 'discard';
}

/**
 * `POST /api/contributions/:contributionId/part` — **a gap filled by the member who knew**
 * (story 120). Records a Part and its Listing at the Position the Contribution is about, and
 * the Contribution becomes that Part's.
 *
 * `NewListingRequest` without the Position, which is not the Editor's to choose here: it names
 * an existing Part or describes a new one, under the same merge-or-correct rule.
 */
export type RecordPartFromContributionRequest = Omit<NewListingRequest, 'positionId'>;

/**
 * `PATCH /api/parts/:partId/photographs` — **the whole order, every time.**
 *
 * Not "move this one up". An order is a statement about the list rather than about one member of
 * it, and a request that named one photograph and a direction would leave the archive to work out
 * what the browser meant against a list that may have changed since it was drawn. Every id the
 * Part holds has to be here exactly once; anything else is refused rather than half-applied.
 */
export interface ReorderPhotographsRequest {
  photographIds: string[];
}

/**
 * `POST /api/tavole/:tavolaId/paste` and `.../paste/preview` — **a whole catalog page at once,
 * rather than two hundred forms** (story 113).
 *
 * The text is what the Editor's clipboard held: rows out of a spreadsheet, tab-separated, or a
 * `.csv` saved from one. It is sent as it was pasted, header row and all — which columns it has
 * is the archive's to work out and not something an Editor has to declare.
 */
export interface PasteRequest {
  text: string;
}

/**
 * Which of the archive's fields a column of the pasted table was read as.
 *
 * **The header is reported back**, exactly as the Editor's sheet spelt it, because the preview's
 * job is to be checkable: a column read as the wrong field is the mistake that would otherwise
 * be found two hundred rows later. `null` is a field this paste has no column for.
 */
export interface PastedColumns {
  position: string | null;
  catalogNumber: string | null;
  nameEn: string | null;
  nameIt: string | null;
  quantityPerCar: string | null;
  disegnoOrigine: string | null;
  drawn: string | null;
}

/**
 * What one pasted row will do to the archive.
 *
 * **The four are what an Editor has to be able to tell apart before pressing anything.** A row
 * that records something new and a row that finds what the archive already has look identical on
 * a spreadsheet and are entirely different afterwards — and `already-listed` is the one that
 * makes an exported sheet safe to paste back, because a round trip is two hundred rows of it.
 */
export type PastedRowOutcome =
  /** A Part the archive has not met, recorded here with its first Listing. */
  | 'new-part'
  /** A Part the archive already holds, listed at this number rather than recorded again. */
  | 'matched-part'
  /** That Part is already listed at that number on this sheet. Nothing to do, and nothing done. */
  | 'already-listed'
  /** The row could not be read. It is reported with its line and the rest are unaffected. */
  | 'refused';

/** What a row says a Part is — the columns of a printed catalog page, and nothing else. */
export interface PastedPart {
  nameEn: string | null;
  nameIt: string | null;
  catalogNumber: string | null;
  disegnoOrigine: string | null;
  quantityPerCar: number | null;
  drawn: boolean;
}

/**
 * One row of the paste, and what became — or would become — of it.
 *
 * `line` counts the header as line 1, which is the number the Editor's own spreadsheet shows
 * beside the row. It is the only address they have for a row that could not be read.
 */
export interface PastedRow {
  line: number;
  outcome: PastedRowOutcome;
  /**
   * What an Editor has to be told about this row, in words they can act on.
   *
   * On a **refused** row it is why it could not be read. On an **already-listed** one it is the
   * one thing a paste would otherwise swallow in silence: that the row disagrees with what is
   * recorded — a quantity corrected in the spreadsheet, a drawn flag changed — and that nothing
   * here is going to apply it. A bulk write over curated records is what this archive does not do
   * (ADR 0005); saying nothing about the difference would be a different failure, and a worse one,
   * because the Editor would believe the correction had landed.
   */
  why?: string;
  /** As printed. `null` where the row names no number, which is a legitimate Listing. */
  positionNumber: string | null;
  /** Whether that number is one this sheet does not carry yet, and will gain. */
  newPosition: boolean;
  /** What the row says. Absent only where it could not be read that far. */
  part?: PastedPart;
  /** The Part the archive already holds, for a matched or already-listed row. */
  matched?: Part;
  /**
   * The **line earlier in this same paste** that records the Part this row was matched to — a
   * catalog number appearing twice, which is one Part listed at two numbers rather than two Parts.
   * The archive has never seen it, so there is no `matched` to show instead.
   */
  matchedLine?: number;
}

/** How the paste came out, in the counts an Editor reads before deciding to press it. */
export interface PasteTally {
  newParts: number;
  matchedParts: number;
  alreadyListed: number;
  refused: number;
  /** Numbers this paste would add to the sheet, each counted once however many rows name it. */
  newPositions: number;
}

/**
 * **What the paste will do, or what it did** — one shape for both, because they are one answer.
 *
 * The preview is the same reading of the same text against the same archive; applying it does
 * that reading again, inside the transaction, and then carries it out. So a preview cannot
 * promise something the write then does differently, and the Editor is never shown a plan that
 * was drawn by different code from the one that runs.
 *
 * `applied` is the only difference: `false` is a preview and **nothing whatever was written**,
 * which is the box ticket 12 asks for before anything is created.
 */
export interface PastePlanResponse {
  applied: boolean;
  columns: PastedColumns;
  /** In the order they were pasted. Every row is here, including the refused ones. */
  rows: PastedRow[];
  tally: PasteTally;
}

/**
 * What a refused Catalog Number carries in `ApiErrorBody.error.details`: **the Part that
 * already has it.**
 *
 * The collision is the deduplication mechanism rather than an obstacle (ADR 0001), so the
 * refusal has to hand back enough for an Editor to decide between merging into that Part and
 * correcting the number they typed. A message alone would leave them to go and find it.
 */
export interface CatalogNumberConflict {
  part: Part;
}

/** What recording a Listing answers with: the Listing, as it will be read. */
export interface ListingResponse {
  listing: PartListing;
}

/**
 * What placing, moving, grouping, linking or removing anything answers with: **the whole sheet,
 * re-read.**
 *
 * Not the one Position that changed, which is what it looks like it should be. A browser handed
 * a single Position would have to work out where in the catalog's order it belongs, and the
 * order is the archive's rule — leading digits, then the number as printed, under the database's
 * own collation. Sorting `12 bis` in two places is two answers waiting to disagree, so this
 * answers with the list and the browser never sorts a catalog at all.
 *
 * Sub-assembling and linking make the same argument twice over: a link is symmetric, so recording
 * one changes *two* Positions, and a Sub-assembly that loses its last number stops existing.
 * Neither is derivable from the request that caused it, and both are on the sheet that comes back.
 *
 * The cost is the sheet's Positions on every click, which is a few kilobytes even on a Tavola
 * carrying two hundred of them, against a scan already measured in megabytes.
 */
export type PositionsResponse = Sheet;

/**
 * What a person may do. Editor is global — it moderates and edits every Model — and Club Officer
 * is deliberately folded into Administrator while there is one Club.
 */
export type Role = 'member' | 'editor' | 'administrator';

/**
 * How the Club came to grant a term of Membership. `payment-provider` is one a member paid for
 * through the platform, granted when the provider confirmed the money had arrived (issue #4).
 */
export type MembershipGrant =
  'opening-entry' | 'bank-transfer' | 'roster-import' | 'payment-provider';

/** The two reasons to send somebody a link that sets a password. */
export type TokenPurpose = 'invitation' | 'password-reset';

/**
 * Where somebody stands on the roster. **The three states the screen has to tell apart** so that
 * "I paid, why can't I get in" is answerable without anyone opening a database (story 124).
 *
 * They are ordered by what is wrong: a lapsed Membership stops a person reaching the archive
 * whether or not they ever chose a password, so it wins over `invited`.
 */
export type RosterStanding = 'lapsed' | 'invited' | 'active';

/**
 * `GET /api/session`
 *
 * **Signed in is always somebody** (ticket 15). A pair rather than a boolean beside a nullable
 * field, so a screen that has established `signedIn` is holding the Account rather than one it
 * still has to check for null — there is no longer a third state where neither is true.
 */
export type SessionResponse =
  { signedIn: true; account: SignedInAccount } | { signedIn: false; account: null };

/** Who the browser is signed in as, and whether their Membership still lets them read. */
export interface SignedInAccount {
  id: string;
  name: string;
  email: string;
  role: Role;
  /**
   * Whether they may read the archive: a Paid-through that has not passed, or grace past it
   * while a Subscription that renews itself is collecting (issue #17).
   */
  membershipIsLive: boolean;
  /** ISO date — the last day the furthest term covers. Null where no term was ever recorded. */
  paidThrough: string | null;
  /**
   * ISO date — the last day of grace, **only while they are reading on it**: the Paid-through
   * has passed and the renewal payment is being confirmed. Null otherwise, paid up included.
   */
  graceUntil: string | null;
  /**
   * Whether they may propose (issue #152): an Administrator has let them, this is a practice
   * system, and the conversation is there to be had. What the Propose button is shown by.
   */
  mayPropose: boolean;
}

/**
 * `POST /api/session`
 *
 * The e-mail address the Club has for them, and the password they chose themselves. There is no
 * other credential this archive accepts.
 */
export interface SignInRequest {
  email: string;
  password: string;
}

/**
 * `POST /api/password-resets` — "I have forgotten my password".
 *
 * There is no response body worth reading. **The answer is the same whether or not the address
 * is on the roster** (story 7), so there is nothing in it that could differ.
 */
export interface PasswordResetRequest {
  email: string;
}

/**
 * `POST /api/password-setups/inspect` — what is behind a link, before anybody types a password
 * into it.
 *
 * Worth a call of its own so that an expired invitation says so on arrival rather than after the
 * member has chosen a password and pressed the button.
 */
export interface InspectPasswordSetupRequest {
  token: string;
}

export interface PasswordSetup {
  purpose: TokenPurpose;
  /** So the screen can greet the person by name and show which address this is for. */
  name: string;
  email: string;
}

/** `POST /api/password-setups` — the member choosing their own password. Answers signed in. */
export interface PasswordSetupRequest {
  token: string;
  password: string;
}

/** One person on the roster, as an Administrator reads them. Never carries a password. */
export interface RosterEntry {
  id: string;
  name: string;
  email: string;
  role: Role;
  standing: RosterStanding;
  /** ISO date — the last day the furthest term covers. Null where none was ever recorded. */
  paidThrough: string | null;
  /**
   * ISO date — the last day of grace, while they are reading on it rather than paid up
   * (issue #17). Their standing is then not `lapsed`. Null otherwise.
   */
  graceUntil: string | null;
  /** ISO instant. Null until the member has redeemed an invitation and chosen a password. */
  activatedAt: string | null;
  /** When the outstanding invitation was sent, and when it stops working. Null once redeemed. */
  invitationSentAt: string | null;
  invitationExpiresAt: string | null;
  addedAt: string;
  /** Whether an Administrator has let them propose (issue #152). Never true in Production. */
  mayPropose: boolean;
}

/** `GET /api/roster` */
export interface RosterResponse {
  members: RosterEntry[];
}

/** One person's row and nothing else, for a screen that has just changed one of them. */
export interface RosterEntryResponse {
  member: RosterEntry;
}

/** `POST /api/roster` — an Administrator adds a person and the invitation goes out (story 121). */
export interface NewMemberRequest {
  name: string;
  email: string;
  /** ISO date. The term the Club has already been paid for, asserted by the Administrator. */
  paidThrough: string;
  role?: Role;
}

/** `PATCH /api/roster/:accountId` — correcting a name, appointing or standing down an Editor. */
export interface CorrectMemberRequest {
  name?: string;
  role?: Role;
  /** Letting them propose, or no longer (issue #152). Refused in Production. */
  mayPropose?: boolean;
}

/**
 * `POST /api/roster/:accountId/payments` — money that arrived by bank transfer (story 125).
 *
 * `paidThrough` is stated rather than calculated, because a treasurer reconciling a statement
 * knows what the transfer was for and a system guessing at term lengths does not.
 */
export interface RecordPaymentRequest {
  /** As typed — `45`, `45.00`, `45,50`. Null where the Club is granting a term for nothing. */
  amount: string | null;
  currency: Currency;
  /** ISO date. The day the money arrived, off the statement. */
  receivedOn: string;
  /** The reference the member actually used, which is how a transfer is matched to a person. */
  reference: string | null;
  /** ISO date. The last day the new term covers. */
  paidThrough: string;
}

/**
 * How long the archive keeps what it knows about a person (ADR 0007). **Read from the running
 * system and never written into a screen**, so that the privacy statement and the sweep that
 * carries it out cannot come to say different things.
 */
export interface RetentionTerms {
  /** Years an Account is kept after its last Membership ran out, before it is deleted. */
  accountYears: number;
  /**
   * Full calendar years a payment record is kept after the year the money arrived — the
   * statutory accounting period, which an erasure does not shorten.
   */
  paymentRecordYears: number;
}

/**
 * `GET /api/legal-notice` — **who is behind the platform**, open to anybody.
 *
 * The public part of the Club's record and nothing beside it: `ClubRecord` also carries the bank
 * details and the reminder text, which are an Administrator's. Every field is null until the
 * association has written it — an invented address on a legal page would look finished.
 */
export interface LegalNotice {
  /** The association's registered name, with its legal form. */
  name: string | null;
  postalAddress: string | null;
  representedBy: string | null;
  registerCourt: string | null;
  registerNumber: string | null;
  vatId: string | null;
  /** The Club office's address — the same one the renewal screen points at. */
  email: string | null;
  phone: string | null;
  further: string | null;
}

export interface LegalNoticeResponse {
  legalNotice: LegalNotice;
}

/**
 * One Model as a Visitor is shown it (ADR 0019): the car, and how far the archive goes for it.
 *
 * Its own shape rather than `CatalogModel` with a number added, so that a field added to what a
 * member reads never reaches a Visitor by default. No id: there is no address a Visitor could
 * use one at.
 */
export interface VisitorModel {
  brand: string;
  name: string;
  series: string | null;
  modelYears: string | null;
  /** Published Tavole only. An Unchecked one is an Editor's and is not counted (ADR 0017). */
  publishedTavole: number;
}

/**
 * `GET /api/landing` — **what a Visitor is shown** (issue #128), open to anybody: the depth of
 * the archive and none of its content, and what joining costs.
 */
export interface Landing {
  /** Brand, then Model. Only Models with at least one Published Tavola, since those are covered. */
  models: VisitorModel[];
  /** The Samples (issue #132), in the order an Administrator first showed them. */
  samples: VisitorSampleListed[];
  /** The yearly fee, from the Club's record — the amount the Renewal asks a member for. */
  fee: string;
  currency: Currency;
  /** The Club office's address from the Club record: where a Visitor writes without the form. */
  officeEmail: string | null;
  /**
   * Whether a Visitor may ask to join through the form (issue #131): only where a letter would
   * reach the Club office, so never without an office address or a transport that delivers.
   */
  requestForm: boolean;
}

export interface LandingResponse {
  landing: Landing;
}

/**
 * A Tavola as a Visitor is told it is (ADR 0019): **the factory's heading and nothing else** — its
 * number, its two names and the car. Its own shape, like `VisitorModel`, so that a field added to
 * the member's Tavola never reaches a Visitor by default.
 */
export interface VisitorTavola {
  /** The Tavola's own id, because a Sample lives at its Tavola's own address. */
  id: string;
  number: string;
  nameIt: string;
  nameEn: string;
  model: Pick<VisitorModel, 'brand' | 'name' | 'series' | 'modelYears'>;
}

/** A Sample as the landing lists it: which drawing, and the public copy to show of it. */
export interface VisitorSampleListed {
  tavola: VisitorTavola;
  /** The smaller public copy (ADR 0019). The Scan stays behind sign-in. */
  drawing: { url: string; width: number; height: number };
}

/**
 * A number on a Sample: **where it is printed, and nothing about what sits there** unless it is
 * the one open. No id, and no Sub-assembly or related numbers: those are the club's.
 */
export interface VisitorPosition {
  /** As printed. */
  number: string;
  /** Where it is drawn, in the same fractions of the drawing as a member's Marks. */
  marks: MarkPoint[];
  /** The one number a Visitor may read the Parts at. Every other number is locked. */
  open: boolean;
}

/**
 * A Part listed at a Sample's open number, as the factory printed it: **these five, and nothing
 * the club added** (ADR 0019) — no Note, Photograph, Specification, Fitment or Equivalent.
 */
export interface VisitorListing {
  catalogNumber: string | null;
  nameIt: string | null;
  nameEn: string | null;
  quantityPerCar: number | null;
  catalogNote: string | null;
}

/**
 * `GET /api/landing/samples/:shownTavolaId` — **a Sample, as a Visitor reads it** (issue #132), open
 * to anybody. A 404 for a Tavola that is not a Sample, in the same words as for one that does not
 * exist, so the answer says nothing about it.
 */
export interface VisitorSample extends VisitorSampleListed {
  /** Every number on the sheet, in the order the factory printed them. */
  positions: VisitorPosition[];
  /** The open number, and what the factory listed at it, drawn Parts first. */
  open: { number: string; listings: VisitorListing[] };
}

export interface VisitorSampleResponse {
  sample: VisitorSample;
}

/**
 * `POST /api/membership-requests` — **a Visitor asks the Club for membership** (issue #131). Sent
 * to the Club office as one e-mail, answered to `email`, and kept nowhere in Ricambi. Answers 204.
 */
export interface MembershipRequest {
  name: string;
  email: string;
  /** The car or cars the Visitor has, in their own words. */
  cars?: string;
  message?: string;
  /** The Visitor agreed to their details going to the Club office, as the privacy statement says. */
  consent: boolean;
  /**
   * The field a person never sees and a script fills in. Anything in it refuses the request, so a
   * browser leaves it out or sends it empty.
   */
  website?: string;
}

/**
 * What a processor does for the association. Five, because those are the five the privacy
 * statement has to account for — `error-tracking` among them so that "nobody" is something the
 * statement says on purpose (ADR 0011).
 */
export type ProcessorRole = 'hosting' | 'storage' | 'email' | 'payment' | 'error-tracking';

/** A company that handles members' data on the association's behalf, as the public is told. */
export interface Processor {
  role: ProcessorRole;
  name: string;
  /** Where the data is handled — a country is enough. */
  location: string;
}

/**
 * The same processor as the association keeps it — `GET /api/processors`, an Administrator's.
 *
 * What is added is the one thing that is nobody else's business and is the association's to
 * track to completion: whether the processor agreement has been signed.
 */
export interface ProcessorRecord extends Processor {
  /** ISO date. Null while the agreement is outstanding, which none may be at go-live. */
  agreementSignedOn: string | null;
}

export interface ProcessorsResponse {
  processors: ProcessorRecord[];
}

export interface ProcessorResponse {
  processor: ProcessorRecord;
}

/** `PUT /api/processors/:role` — naming who does this for the association, or correcting it. */
export interface NameProcessorRequest {
  name: string;
  location: string;
  agreementSignedOn?: string | null;
}

/**
 * `GET /api/privacy` — everything in the privacy statement that is a fact about the association
 * or the running system rather than a sentence about what the software does. Open to anybody,
 * like the statement.
 */
export interface PrivacyResponse {
  retention: RetentionTerms;
  /** The association, which is the controller. Null fields are ones nobody has written yet. */
  controller: {
    name: string | null;
    postalAddress: string | null;
    email: string | null;
  };
  dataProtectionContact: {
    name: string | null;
    email: string | null;
  };
  supervisoryAuthority: string | null;
  /** In a fixed order — hosting, storage, e-mail, payment, error tracking. Only those named. */
  processors: Processor[];
  further: string | null;
}

/**
 * `DELETE /api/roster/:accountId` — what erasing one person did, **in counts and never in
 * names**: by the time this is read there is nobody left to name.
 */
export interface Erasure {
  /** Published Contributions, which stay and now read "a former member". */
  contributionsKept: number;
  /** Contributions nobody had published — waiting or discarded — which went with the person. */
  contributionsRemoved: number;
  /** Payments the Club received, kept for the statutory accounting period. */
  paymentRecordsKept: number;
}

export interface ErasureResponse {
  erased: Erasure;
}

/** Somebody whose Account has been lapsed for longer than the retention period. */
export interface RetentionCandidate {
  id: string;
  name: string;
  email: string;
  /** ISO date. Null where no term was ever recorded, and the count ran from being added. */
  paidThrough: string | null;
  /** ISO date — the last day the Account was to be kept. Always before `asOf`. */
  keptUntil: string;
}

/**
 * `GET /api/roster/retention` — **the dry run**: exactly what the next retention sweep would
 * delete, read the same way the sweep reads it and writing nothing. The sweep itself answers in
 * this shape too, as the account of what it did.
 */
export interface RetentionReport {
  /** ISO date — the archive's today, which is what every date here was measured against. */
  asOf: string;
  retention: RetentionTerms;
  accounts: RetentionCandidate[];
  /**
   * **The last Administrator, kept although past the period** (issue #18). An Administrator can
   * go on running the Club while lapsed, so deleting every one of them would leave a roster
   * nobody can open. Where all of them are due, the one whose Membership ran out most recently
   * is kept and named here, and is not in `accounts`. Null where nobody had to be kept.
   */
  keptAdministrator: RetentionCandidate | null;
  /** Payment records of people already erased, whose statutory period has now run out too. */
  paymentRecords: number;
}

/**
 * `POST /api/roster/import/preview` and `POST /api/roster/import` — **the Club's annual
 * membership list, loaded instead of typed** (story 122).
 *
 * The text is the spreadsheet, saved as CSV and read in the browser: rows with a name, an e-mail
 * address and a Paid-through date, header row and all. It is sent as it was written, because
 * which columns it has is the archive's to work out rather than something an Administrator has
 * to declare about their own file.
 *
 * **This is the one permanent import in the product** (ADR 0005). Everything else about the
 * catalog is edited a record at a time, because a re-uploaded spreadsheet would silently
 * overwrite what an Editor had folded into a Part. A roster has no curated state beneath it and
 * genuinely recurs once a year, which is what earns it an importer of its own.
 */
export interface RosterImportRequest {
  text: string;
}

/**
 * Which of the file's columns each of the three fields was read from — **the Administrator's own
 * header, quoted back**, so a column read as the wrong field is visible before anything is
 * written rather than a hundred rows later. `null` is a field this file has no column for.
 */
export interface RosterImportColumns {
  name: string | null;
  email: string | null;
  paidThrough: string | null;
}

/**
 * What one row of the file will do to the roster.
 *
 * **There is deliberately no fifth outcome, because there is no removal.** A roster import adds
 * and updates and does nothing else: a truncated or half-exported file must never be able to take
 * anybody's access away, so somebody the file does not mention is somebody the import leaves
 * exactly as they were. Removing access is a separate, deliberate act.
 */
export type RosterImportOutcome =
  /** Nobody on the roster has this address. The person and their opening term are recorded. */
  | 'new-member'
  /** On the roster already: the term runs further than the roster has, or the name has changed. */
  | 'updated'
  /** On the roster, and the file says nothing the roster does not already hold. */
  | 'unchanged'
  /** The row could not be read. It is reported with its line and the rest are unaffected. */
  | 'refused';

/** What the roster holds for somebody a row matched, so the change is readable against it. */
export interface RosterImportMatch {
  name: string;
  paidThrough: string | null;
  standing: RosterStanding;
}

/**
 * One row of the file, and what became — or would become — of it.
 *
 * `line` counts the header as line 1, which is the number the Administrator's own spreadsheet
 * shows beside the row. It is the only address they have for a row that could not be read.
 */
export interface RosterImportRow {
  line: number;
  outcome: RosterImportOutcome;
  /** Normalised to lower case, as the roster keys people. Null where the cell was not readable. */
  email: string | null;
  /** As the file wrote it. Null where the file left it blank. */
  name: string | null;
  /** ISO, once read. Null where the cell could not be read as one certain day. */
  paidThrough: string | null;
  /** What the roster holds for this person now. Absent for somebody it has never heard of. */
  onTheRoster?: RosterImportMatch;
  /**
   * What an Administrator has to be told about this row, in words they can act on: why a refused
   * row could not be read, what an updated row changes, and why an unchanged one changes nothing.
   */
  why?: string;
}

/** How the import came out, in the counts an Administrator reads before deciding to press it. */
export interface RosterImportTally {
  newMembers: number;
  updated: number;
  unchanged: number;
  refused: number;
  /**
   * People on the roster this file does not mention.
   *
   * **The count that proves the import never deletes.** It is the number an Administrator who has
   * just uploaded half a file needs to see, and the one figure on this screen that is about
   * somebody the file says nothing about.
   */
  untouched: number;
}

/**
 * **What the import will do, or what it did** — one shape for both, because it is one reading.
 *
 * The preview is the same reading of the same file against the same roster; importing does that
 * reading again, inside the transaction, and then carries it out. So a preview cannot promise
 * something the write does differently.
 *
 * `applied` is the only difference: `false` is a preview and **nothing whatever was written**,
 * which is the box ticket 16 asks for before anything is created.
 *
 * **No invitation is ever sent from here.** A new member lands on the roster as somebody an
 * Administrator has still to invite, deliberately: an import is a list arriving, and inviting a
 * hundred people is not something that should be able to happen as a side effect of one press.
 */
export interface RosterImportPlan {
  applied: boolean;
  columns: RosterImportColumns;
  /** In the order they were written. Every row is here, including the refused ones. */
  rows: RosterImportRow[];
  tally: RosterImportTally;
}

/**
 * The Club — `GET /api/club`, and `PATCH /api/club` with any subset of it.
 *
 * Everything about the association that has to change without a developer (story 130): what
 * membership costs, where the money goes, how a member should label their transfer, and what a
 * renewal reminder says, whether reminders are on, and where the treasurer's digest goes.
 */
export interface ClubRecord {
  /** As typed and as read — `45.00`. Rendered rather than the minor units it is stored in. */
  fee: string;
  currency: Currency;
  bankAccountHolder: string | null;
  bankName: string | null;
  iban: string | null;
  bic: string | null;
  /** Free text with `{name}` and `{year}` in it. The format is the Club's; nothing parses it. */
  paymentReference: string;
  reminderText: string;
  /**
   * Where a member writes when something is wrong that a transfer will not fix.
   *
   * The **one** thing on the Club's record that is shown to somebody who is not an
   * Administrator: it is on the renewal screen, because "contact the Club office" is advice
   * nobody can act on without an address to act on it at (ticket 15).
   */
  officeEmail: string | null;
  /**
   * Whether an Administrator has switched renewal reminders on (issue #3). Off until somebody
   * decides otherwise; the environment has to allow sending as well, and `ReminderPlan` says
   * whether it does.
   */
  remindersOn: boolean;
  /** Where the treasurer's digest of Memberships about to run out and just lapsed goes. Null sends none. */
  treasurerEmail: string | null;
  /**
   * **Who the association is**, for the legal notice (issue #9): the registered name with its
   * legal form, where it can be served, who may speak for it, and where it is registered. Public
   * once written — see `LegalNotice` — and null until somebody has written it.
   */
  legalName: string | null;
  /** As many lines as an address has. */
  postalAddress: string | null;
  representedBy: string | null;
  registerCourt: string | null;
  registerNumber: string | null;
  vatId: string | null;
  phone: string | null;
  /** Anything else the association has to state on its legal notice, in its own words. */
  legalNoticeFurther: string | null;
  /** Who answers for data protection on the association's side. Named in the privacy statement. */
  dataProtectionContact: string | null;
  dataProtectionEmail: string | null;
  /** The authority a member may complain to, as the association would name it. */
  supervisoryAuthority: string | null;
  /** Anything else the association has to state in its privacy statement, in its own words. */
  privacyFurther: string | null;
}

export interface ClubResponse {
  club: ClubRecord;
}

export type CorrectClubRequest = Partial<ClubRecord>;

/** Somebody a renewal reminder is, or will be, written to. */
export interface ReminderRecipient {
  accountId: string;
  name: string;
  email: string;
  /** ISO date. The term the reminder is about runs to this day. */
  paidThrough: string;
  /** ISO date — the first day the reminder may go out: thirty days before the Paid-through. */
  sendsOn: string;
  /** What the treasurer should expect to read on the transfer. */
  reference: string;
}

/**
 * Why somebody whose Membership is about to run out gets no reminder. `short-term` is a term
 * shorter than the reminder window — a backfilled Membership must not receive a demand;
 * `renews-itself` is a member whose Subscription will collect the fee without being asked.
 */
export type ReminderSkipReason = 'short-term' | 'renews-itself';

export interface ReminderSkipped {
  accountId: string;
  name: string;
  paidThrough: string;
  why: ReminderSkipReason;
}

/** One line of what the treasurer is told: who, to when, and what their transfer should say. */
export interface TreasurerEntry {
  name: string;
  paidThrough: string;
  reference: string;
  /** Their Subscription will collect the fee by itself, so no transfer is to be expected. */
  renewsItself: boolean;
}

export interface Letter {
  subject: string;
  text: string;
}

/**
 * `GET /api/reminders` — **exactly who would be written to, before anything is switched on**
 * (issue #3). The same reading the nightly run does, writing nothing and sending nothing.
 */
export interface ReminderPlan {
  /** ISO date — the archive's today, which every date here was measured against. */
  asOf: string;
  /** How many days before a Paid-through the reminder goes out. */
  windowDays: number;
  /**
   * The three things that all have to be true before a single letter leaves. A screen shows
   * which of them is not, rather than a switch that appears to do nothing.
   */
  sending: {
    /**
     * `REMINDERS_ENABLED`, which only a production environment may set — and an e-mail
     * transport that delivers, since a letter that reaches nobody must not count as sent.
     */
    environmentAllows: boolean;
    /** The Administrator's own switch, on the Club's record. */
    switchedOn: boolean;
    /** The Club has said what it charges and where to send it, so a reminder can be acted on. */
    canBePaid: boolean;
  };
  /** Would be written to by a run today. */
  due: ReminderRecipient[];
  /** Would become due within the coming window, in the order they would. */
  upcoming: ReminderRecipient[];
  skipped: ReminderSkipped[];
  /** The letter as the first of them would receive it. Null where there is nobody to write to. */
  letter: Letter | null;
  digest: {
    treasurerEmail: string | null;
    /** Paid-through within the coming window, soonest first. */
    runningOut: TreasurerEntry[];
    /** Ran out within the last window, most recent first. */
    lapsed: TreasurerEntry[];
    /** ISO date the digest last went out. Null where it never has. */
    lastSentOn: string | null;
    /** The digest as it would be sent today. Null where there is nobody to list. */
    letter: Letter | null;
  };
}

/** `POST /api/reminders/run` — what running the job on demand sent. */
export interface ReminderRun {
  reminders: number;
  digest: boolean;
}

/**
 * `GET /api/renewal` — **everything a member needs in order to pay, in the words to use.**
 *
 * Readable by anybody signed in, and deliberately not behind a live Membership: the whole point
 * is that a member whose term has run out can reach it. It is a subset of the Club's record and
 * not the record itself, because widening `GET /api/club` would hand every member the reminder
 * text and the screen that edits it; what a member needs is the amount, where to send it, what
 * to write on it and who to ask.
 *
 * The reference arrives **rendered** rather than as the Club's `{name}`/`{year}` format. Asking
 * a member standing in a garage to substitute their own name into a template is asking for a
 * transfer the treasurer cannot match to anybody.
 *
 * **The Paid-through is deliberately not here.** It is on `SignedInAccount`, which every screen
 * already holds, and the same date served from two addresses is two dates free to disagree. The
 * one thing this needs it for is working out which year the member is paying for, and that
 * arrives written into the reference.
 */
export interface Renewal {
  /** As typed and as read — `45.00`. */
  fee: string;
  currency: Currency;
  bankAccountHolder: string | null;
  bankName: string | null;
  iban: string | null;
  bic: string | null;
  /** The Club's format with this member's name and the year they are paying for written in. */
  reference: string;
  officeEmail: string | null;
}

export interface RenewalResponse {
  renewal: Renewal;
}

/**
 * One payment the Club has received from a member, as the member reads it back — however it
 * arrived. A bank transfer an Administrator recorded stands in this list beside a direct debit.
 */
export interface MembershipPayment {
  id: string;
  /** ISO date. The day the money arrived. */
  paidOn: string;
  /** As read — `45.00`. */
  amount: string;
  currency: Currency;
  /** ISO date. The last day the term this bought covers. */
  paidThrough: string;
  /**
   * Whether the payment provider has a receipt for it — at
   * `GET /api/subscription/payments/:id/receipt`, which sends the member on to the provider's
   * own page. False for a payment that did not come through the provider.
   */
  hasReceipt: boolean;
}

/** A member's standing arrangement to pay the fee each year through the platform (ADR 0004). */
export interface Subscription {
  /** Whether it will collect again. False once the member has cancelled. */
  renews: boolean;
  /** ISO date — when the provider will next collect, where it has said. */
  renewsOn: string | null;
}

/**
 * `GET /api/subscription` — **where a member's Membership stands, and whether it renews itself.**
 *
 * Signed in is enough, like the Renewal: the person who most needs to pay is the one whose
 * Membership has run out. Whose it is comes from the session and from nowhere else.
 */
export interface MembershipStanding {
  /** ISO date — the last day the furthest term covers. Null where none was ever recorded. */
  paidThrough: string | null;
  /**
   * ISO date — until when access holds while the renewal payment is being collected, past the
   * Paid-through. Null unless the member is reading on grace today.
   */
  graceUntil: string | null;
  /**
   * Whether paying through the platform is on offer here at all. False where no provider is
   * configured or the Club has not said what it charges — a bank transfer is then the only way.
   */
  canPayOnline: boolean;
  /** What a year costs today, as read — `45.00`. */
  fee: string;
  currency: Currency;
  /** Null where the member has no live subscription: never started one, or it has ended. */
  subscription: Subscription | null;
  /** Newest first. */
  payments: MembershipPayment[];
}

export interface MembershipStandingResponse {
  membership: MembershipStanding;
}

/**
 * `POST /api/subscription` — the member asking to pay by direct debit or card. Answers with the
 * provider's own page; **nothing about their Membership has changed yet**, and nothing does
 * until the provider confirms the money arrived.
 */
export interface StartSubscriptionResponse {
  paymentPageUrl: string;
}

/** `PUT /api/subscription/auto-renewal` — cancelling auto-renewal in one press, or turning it back on. */
export interface SetAutoRenewalRequest {
  renews: boolean;
}

/**
 * **What somebody brings to a Proposal** (issue #152): a Fix, where something is wrong, or an
 * Idea, where something should be new. Chosen before the conversation starts, so it asks the
 * right kind of questions.
 */
export type ProposalKind = 'fix' | 'idea';

/**
 * Where a Proposal stands. A `draft` is its author's alone; it becomes `new` when handed over,
 * and the developer moves it on to `taken-up` and `done`, or `declined` with a reason.
 */
export type ProposalStatus = 'draft' | 'new' | 'taken-up' | 'done' | 'declined';

/** Who said a turn: the author, or the conversation answering them. */
export type ProposalSpeaker = 'author' | 'conversation';

/**
 * **What the author was looking at when they pressed Propose**, attached without their typing it
 * and shown at the top of the conversation. The Model and Tavola are named as they were then:
 * a practice archive is re-seeded, and a Proposal outlives what it was about.
 */
export interface ProposalContext {
  /** The address of the page, path and query, as the browser had it. */
  pageAddress: string;
  /** The Version of Ricambi that was running. */
  version: string;
  model: { id: string; name: string } | null;
  tavola: { id: string; number: string; name: string } | null;
}

/** One turn of the conversation, in the order it was said. */
export interface ProposalTurn {
  /** From 0, without gaps. */
  sequence: number;
  speaker: ProposalSpeaker;
  text: string;
  /** ISO instant. */
  at: string;
}

/** Who an Idea is for (issue #153): the roles of the archive, and somebody who is not in it yet. */
export type ProposalAudience = 'member' | 'editor' | 'administrator' | 'visitor';

/** What every finished Proposal says, whichever its kind. */
interface SummaryOfEither {
  /** A few words the Proposal is listed by, and told to later conversations by. */
  title: string;
  /**
   * **The author's own words, verbatim**: every turn they wrote, in order. Copied from the
   * conversation by the archive rather than written by the model, so nothing in it is reworded.
   */
  authorsWords: string[];
  /** Which model wrote this summary, so the developer can judge it. */
  model: string;
}

/** A finished Fix: something is wrong. */
export interface FixSummary extends SummaryOfEither {
  kind: 'fix';
  whatHappened: string;
  whatWasExpected: string;
  /** How to make it happen again, a step each, in order. Empty when nobody knows. */
  steps: string[];
  /** Where it happened, from what was on screen when the Proposal was started. */
  where: string;
}

/** A finished Idea: something should be new. */
export interface IdeaSummary extends SummaryOfEither {
  kind: 'idea';
  /** The problem, in the author's own terms. */
  problem: string;
  forWhom: ProposalAudience[];
  whatItShouldDo: string;
  decisions: string[];
  openQuestions: string[];
  /** Words the conversation found that are not yet Ricambi's terms, and what they were meant to mean. */
  newTerms: { term: string; meaning: string }[];
}

/**
 * **The finished Proposal** (issue #153): what the conversation ends on, in the fixed shape for
 * its kind, returned by the conversation method as structured output rather than read out of its
 * prose. In English, with names replaced by roles.
 */
export type ProposalSummary = FixSummary | IdeaSummary;

/** A Proposal as listed: enough to find it again. */
export interface ProposalListing {
  id: string;
  kind: ProposalKind;
  status: ProposalStatus;
  /** The summary's title, once there is a summary. */
  title: string | null;
  context: ProposalContext;
  /** The author's first words, or `null` before they have written any. */
  opening: string | null;
  /** Whether the person asking wrote it. */
  mine: boolean;
  /** ISO instants. `handedOverAt` is null while it is a Draft. */
  startedAt: string;
  updatedAt: string;
  handedOverAt: string | null;
}

/** `GET /api/proposals/:proposalId` — one Proposal and the whole of its conversation. */
export interface Proposal extends ProposalListing {
  turns: ProposalTurn[];
  /**
   * The finished Proposal, or `null` until the author asks for it. Written again when they ask
   * for a change, and set aside when they carry on the conversation after it.
   */
  summary: ProposalSummary | null;
  /** Why it was Declined, which its author is shown. Null unless it was. */
  declineReason: string | null;
}

export interface ProposalResponse {
  proposal: Proposal;
}

/**
 * `GET /api/proposals` — the asker's own Drafts, the latest first, and every handed-over
 * Proposal, New first. `?status=` keeps only the handed-over ones that stand there.
 */
export interface ProposalsResponse {
  drafts: ProposalListing[];
  handedOver: ProposalListing[];
}

/**
 * `POST /api/proposals/:proposalId/summary` — the finished Proposal, written. With `change`, the
 * author's ask for it to say something differently is kept as their turn first, and the summary
 * is written again with it.
 */
export interface SummariseProposalRequest {
  change?: string;
}

/**
 * `PATCH /api/proposals/:proposalId` — an Administrator moving a handed-over Proposal on.
 * `New → Taken up → Done`, and `Declined` from New or Taken up, with a reason.
 */
export interface ProposalStatusRequest {
  status: Exclude<ProposalStatus, 'draft' | 'new'>;
  reason?: string;
}

/**
 * `POST /api/proposals` — starting a Draft. The page is the browser's to say; the Version is the
 * server's, and the Model and Tavola are looked up from the ids rather than taken on trust.
 */
export interface StartProposalRequest {
  kind: ProposalKind;
  pageAddress: string;
  modelId?: string | null;
  tavolaId?: string | null;
}

/** `POST /api/proposals/:proposalId/turns` — what the author writes next. */
export interface ProposalTurnRequest {
  text: string;
}

/**
 * **The answer to a turn, as it is written**: `POST /api/proposals/:proposalId/turns` answers
 * with one of these per line (`application/x-ndjson`). Text arrives in pieces; `answered` closes
 * it with the two turns as kept; `failed` says why the answer stopped, and the author's turn is
 * kept either way.
 */
export type ProposalAnswerEvent =
  | { type: 'text'; text: string }
  | { type: 'answered'; turns: ProposalTurn[] }
  | { type: 'failed'; message: string };
