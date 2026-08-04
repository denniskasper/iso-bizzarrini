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
  /** As an Editor wrote it. */
  name: string;
  /** What decides whether two typed names are the same Category. */
  slug: string;
}

/** `GET /api/categories` */
export interface CategoriesResponse {
  categories: Category[];
}

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

/** A Tavola as a Model's list reports it. */
export interface TavolaSummary {
  id: string;
  /** As printed on the sheet — an opaque string, never arithmetic. */
  number: string;
  nameIt: string;
  nameEn: string;
  category: Category;
  /** `null` until a scan is uploaded. A Tavola without one is a legitimate state. */
  scan: TavolaScan | null;
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

/** `GET /api/tavole/:tavolaId` */
export interface TavolaResponse extends Sheet {
  tavola: TavolaSummary & {
    model: CatalogModel;
    provenance: CatalogProvenance;
  };
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
 * A Part with everything the archive holds about it — **what a member reads at a circle**.
 *
 * The three collections are the Part's and not the Listing's: which cars it fits, what can be
 * bought instead of it and where it has been available are true of the component wherever it is
 * listed, which is ADR 0001 showing up in a response shape. They hang off this rather than off
 * `Part` so that the bare identity — what a refused Catalog Number hands back, what a Tavola's
 * index prints — stays the small thing it is.
 */
export interface PartInFull extends Part {
  fitments: Fitment[];
  equivalents: Equivalent[];
  sources: Source[];
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
  /** Ricambi is English; the Italian name of a sheet belongs on the sheet's own page. */
  nameEn: string;
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
export type ListedPart = Pick<Part, 'id' | 'nameEn' | 'nameIt' | 'catalogNumber'>;

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
  /** Typed, not chosen: its slug decides whether this is a new Category or one already used. */
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
 * `GET /api/session`
 *
 * The stand-in gate that stands in front of the scans until ticket 14 brings Accounts and
 * Memberships. It admits Editors and nobody else, so being signed in is what "may edit" means
 * for as long as it exists.
 */
export interface SessionResponse {
  signedIn: boolean;
}
