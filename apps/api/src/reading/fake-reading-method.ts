import { CLAUDE_MODEL } from './claude-requests.js';
import type { ReadingMethod, RequestEstimate, Tokens } from './reading-method.js';

/**
 * **The fake Reading method**, for a practice system (issue #55). It sends nothing anywhere and
 * reads nothing: every page is "something other than a drawing or a table", every request takes
 * the same few tokens, and translating hands the Italian back. That is enough to show what a
 * Catalog run looks like without paying for one, and nothing it says could be published.
 *
 * It prices itself as the real model, so its runs are costed as a real run would be, and it is
 * never charged. Production refuses to start with it (`composition/environment-safety.ts`).
 */
const TOKENS: Tokens = { input: 1500, output: 200 };
const ESTIMATE: RequestEstimate = { input: 1500, output: 200, outputAtMost: 1000 };

export function createFakeReadingMethod(): ReadingMethod {
  return {
    name: 'The fake Reading method',
    model: CLAUDE_MODEL,
    charged: false,

    async estimate() {
      return { identify: ESTIMATE, reading: ESTIMATE, translation: ESTIMATE };
    },
    async identify() {
      return {
        value: {
          kind: 'other',
          tavola: null,
          foglio: null,
          turn: 0,
          titleIt: null,
          sezione: null,
          gruppo: null,
          sottogruppo: null,
        },
        tokens: TOKENS,
      };
    },
    async readTable() {
      return { value: { layout: 'catalogue', ranges: [], rows: [] }, tokens: TOKENS };
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
  };
}
