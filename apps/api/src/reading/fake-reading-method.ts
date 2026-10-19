import { CLAUDE_MODEL } from './claude-requests.js';
import type { ReadRow, ReadingMethod, RequestEstimate, Tokens } from './reading-method.js';

/**
 * **The fake Reading method**, for a practice system (issue #55). It sends nothing anywhere and
 * reads nothing: every page is a Table sheet of a Tavola of its own, numbered 100 past the page so
 * it stands clear of the practice archive's, with one invented row, except page 5, whose number it
 * cannot read; every request takes the same
 * few tokens, and translating hands the Italian back. That is enough to show a Catalog run bring
 * in Unchecked Tavole without paying for one (issue #58), and nothing it says could be published
 * as fact.
 *
 * It prices itself as the real model, so its runs are costed as a real run would be, and it is
 * never charged. Production refuses to start with it (`composition/environment-safety.ts`).
 */
/** A page whose Tavola number it cannot read, so a run has a page to set aside (issue #60). */
const UNREADABLE_PAGE = 5;
const TOKENS: Tokens = { input: 1500, output: 200 };
const ESTIMATE: RequestEstimate = { input: 1500, output: 200, outputAtMost: 1000 };
const INVENTED_ROW: ReadRow = {
  position: '1',
  disegnoOrigine: '',
  numbers: [],
  quantity: '1',
  nameIt: 'PEZZO DI PROVA',
  note: '',
  unsure: [],
};

export function createFakeReadingMethod(): ReadingMethod {
  return {
    name: 'The fake Reading method',
    model: CLAUDE_MODEL,
    charged: false,

    async estimate() {
      return { identify: ESTIMATE, reading: ESTIMATE, translation: ESTIMATE };
    },
    async identify(sheet) {
      return {
        value: {
          kind: 'table',
          tavola: sheet.page === UNREADABLE_PAGE ? null : String(100 + sheet.page),
          foglio: null,
          turn: 0,
          numbersTurn: 0,
          titleIt: 'TAVOLA DI PROVA',
          sezione: null,
          gruppo: null,
          sottogruppo: null,
        },
        tokens: TOKENS,
      };
    },
    async readTable() {
      return { value: { layout: 'catalogue', ranges: [], rows: [INVENTED_ROW] }, tokens: TOKENS };
    },
    async translate(texts) {
      return { value: texts, tokens: TOKENS };
    },
    async estimateTranslation() {
      return ESTIMATE;
    },
    async readNumbers(crops) {
      return {
        value: crops.map((crop) => ({ id: crop.id, number: null, partial: false, unsure: false })),
        tokens: TOKENS,
      };
    },
    async estimateNumbers() {
      return ESTIMATE;
    },
    async orientNumbers() {
      return { value: 'as-found', tokens: TOKENS };
    },
    async estimateOrientation() {
      return ESTIMATE;
    },
  };
}
