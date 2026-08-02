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

/** `GET /api/tavole/:tavolaId` */
export interface TavolaResponse {
  tavola: TavolaSummary & {
    model: CatalogModel;
    provenance: CatalogProvenance;
  };
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
 * `GET /api/session`
 *
 * The stand-in gate that stands in front of the scans until ticket 14 brings Accounts and
 * Memberships. It admits Editors and nobody else, so being signed in is what "may edit" means
 * for as long as it exists.
 */
export interface SessionResponse {
  signedIn: boolean;
}
