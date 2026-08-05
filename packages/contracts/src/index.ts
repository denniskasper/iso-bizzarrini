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
 * The four collections are the Part's and not the Listing's: which cars it fits, what can be
 * bought instead of it, where it has been available and what it looks like are true of the
 * component wherever it is listed, which is ADR 0001 showing up in a response shape. They hang
 * off this rather than off `Part` so that the bare identity — what a refused Catalog Number
 * hands back, what a Tavola's index prints — stays the small thing it is.
 */
export interface PartInFull extends Part {
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
 * **How much of one sheet has been done** — the three counts an Editor opens a Tavola wanting.
 *
 * The two are counted separately and neither is a stage of the other: a Position carries Marks
 * or it does not, and it carries a Listing or it does not, and the ordinary archive has plenty
 * of each without the other.
 *
 * **They are counts and not a score, and nothing here can tell the difference.** A number the
 * catalog prints that the drawing never showed is *finished* with no Mark on it (CONTEXT.md), so
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
  /** Ricambi is English; the Italian name of a sheet belongs on the sheet's own page. */
  nameEn: string;
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

/** How the Club came to grant a term of Membership. Ticket 18 adds the payment provider's own. */
export type MembershipGrant = 'opening-entry' | 'bank-transfer' | 'roster-import';

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
  /** Whether at least one Membership's Paid-through has not passed. */
  membershipIsLive: boolean;
  /** ISO date — the last day the furthest term covers. Null where no term was ever recorded. */
  paidThrough: string | null;
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
  /** ISO instant. Null until the member has redeemed an invitation and chosen a password. */
  activatedAt: string | null;
  /** When the outstanding invitation was sent, and when it stops working. Null once redeemed. */
  invitationSentAt: string | null;
  invitationExpiresAt: string | null;
  addedAt: string;
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
 * renewal reminder will say when ticket 17 sends one.
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
}

export interface ClubResponse {
  club: ClubRecord;
}

export type CorrectClubRequest = Partial<ClubRecord>;

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
