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
 * A number printed on a Tavola.
 *
 * **It exists in its own right, and nothing here says what sits at it.** Marking a sheet up and
 * finding out what each number is are separate evenings' work, so a Position about which
 * nothing whatever is known is an ordinary, finished thing rather than a half-made one. What
 * sits there arrives with ticket 06, as a Listing, and does not live on this shape.
 *
 * `marks` is in reading order down the sheet, and may be empty — a Position with no Mark is
 * one the catalog lists but the drawing does not show.
 */
export interface Position {
  id: string;
  /** As printed — `207`, `210 S`, `211 D`. An identifier, never arithmetic. */
  number: string;
  marks: Mark[];
}

/** `GET /api/tavole/:tavolaId` */
export interface TavolaResponse {
  tavola: TavolaSummary & {
    model: CatalogModel;
    provenance: CatalogProvenance;
  };
  /**
   * Every Position on the sheet, in the order the factory printed them, with the drawing —
   * because circles that arrive after the sheet does are circles a member watches appear.
   */
  positions: Position[];
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
  part: Part;
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
 * What placing, moving or removing anything answers with: **the whole sheet, re-read.**
 *
 * Not the one Position that changed, which is what it looks like it should be. A browser handed
 * a single Position would have to work out where in the catalog's order it belongs, and the
 * order is the archive's rule — leading digits, then the number as printed, under the database's
 * own collation. Sorting `12 bis` in two places is two answers waiting to disagree, so this
 * answers with the list and the browser never sorts a catalog at all.
 *
 * The cost is the sheet's Positions on every click, which is a few kilobytes even on a Tavola
 * carrying two hundred of them, against a scan already measured in megabytes.
 */
export interface PositionsResponse {
  positions: Position[];
}

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
