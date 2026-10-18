import type { CostRecord } from './cost.js';
import type { ReadListing } from './interpret.js';
import type { MarkDoubt, ProposedMark } from './marks.js';
import type { SheetIdentity } from './reading-method.js';
import type { MachineTranslation } from './translation.js';

/**
 * **Where a reading's progress is kept** (issue #53).
 *
 * The reading of a catalog (`catalog-reading.ts`) decides what to ask and what it means; a store
 * keeps what it found. It is told what each page was found to be, each Tavola once it is finished,
 * what the run has cost, and how the run ended. It is asked what an earlier run already did, so
 * that carrying on asks nothing twice and reads no finished Tavola again.
 *
 * The read command keeps it in a directory (`directory-store.ts`). Nothing here is about files.
 */
export interface ReadingStore {
  /**
   * What earlier runs of this catalog already did. Asked once, before anything is estimated, and
   * the place to refuse a reading the store cannot keep.
   */
  done(): Promise<DoneBefore>;
  /** The run is within its limit and about to send its first request. */
  started(run: { readingMethod: string }): Promise<void>;
  /** A page has been asked what it is. */
  pageFound(page: number, identity: SheetIdentity): Promise<void>;
  /** A Tavola has been read whole. Its cost follows straight after. */
  tavolaFinished(tavola: FinishedTavola): Promise<void>;
  /** What the run has cost so far: after every finished Tavola, and once more at the end. */
  costed(record: CostRecord): Promise<void>;
  /**
   * The run is over, whether it read everything or stopped: `cost.stopped` says which, and why.
   * The pages that went into no Tavola are kept for a person to look at.
   */
  ended(end: { cost: CostRecord; setAside: SetAsidePage[] }): Promise<void>;
}

export interface DoneBefore {
  /** 1 for a catalog never read before, then one more for each run that carries on with it. */
  run: number;
  /** What each page an earlier run asked about was found to be. */
  pages: { page: number; identity: SheetIdentity }[];
  /** The numbers of the Tavole an earlier run finished. */
  tavole: string[];
  /** What the finished Tavole's Italian was translated as, so the rest read the same. */
  translations: MachineTranslation[];
}

export const NOTHING_DONE: DoneBefore = { run: 1, pages: [], tavole: [], translations: [] };

/** A sheet of the catalog, turned upright the way its headings read. */
export interface UprightSheet {
  page: number;
  image: Buffer;
}

export interface FinishedTavola {
  number: string;
  titleIt: string;
  /** A Machine translation of `titleIt`, or empty where there is none. */
  titleEn: string;
  catalogSection: string | null;
  catalogGroup: string | null;
  catalogSubgroup: string | null;
  readingMethod: string;
  /** The drawing, or `null` where the catalog has a table for this Tavola and no drawing. */
  scan: UprightSheet | null;
  /** In the factory's order. */
  tableSheets: (UprightSheet & { foglio: string | null })[];
  /** Each with its English, a Machine translation, or empty where there is none. */
  listings: (ReadListing & { nameEn: string; catalogNoteEn: string })[];
  /** Proposed on the drawing. None where there is no drawing. */
  marks: ProposedMark[];
  /** Positions listed with no Mark, and Marks for a number listed nowhere. */
  doubts: MarkDoubt[];
  machineTranslations: MachineTranslation[];
}

export interface SetAsidePage {
  page: number;
  image: Buffer;
  reason: string;
}
