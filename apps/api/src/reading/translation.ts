/**
 * **Machine translation, kept honest** (ADR 0016, issue #32).
 *
 * The Italian is the factory's and is stored verbatim; the English beside it is a Machine
 * translation until an Editor vouches for it. Two things are decided here rather than left to the
 * model:
 *
 * - **A code or a number is never altered.** Every word with a digit in it is taken out of the
 *   Italian before it is sent, and stands as `{{1}}`, `{{2}}`…. An English that does not carry
 *   each of them exactly once is no translation at all, and the text is left without one.
 * - **One Italian word is one English word.** The term list goes with every request, and within a
 *   run the same Italian is translated once and reused, so `VITE` reads the same on every Tavola.
 */

/**
 * How a parts counter says it. Checked against the trial's readings; add to it when an Editor
 * keeps correcting the same word, and never change an entry without reloading what used it.
 */
export const TERM_LIST: readonly { italian: string; english: string }[] = [
  { italian: 'alzacristallo', english: 'window regulator' },
  { italian: 'anello', english: 'ring' },
  { italian: 'anteriore', english: 'front' },
  { italian: 'assale', english: 'axle' },
  { italian: 'bullone', english: 'bolt' },
  { italian: 'completo', english: 'assembly' },
  { italian: 'cristallo', english: 'glass' },
  { italian: 'cuscinetto', english: 'bearing' },
  { italian: 'dado', english: 'nut' },
  { italian: 'destro', english: 'right' },
  { italian: 'guarnizione', english: 'gasket' },
  { italian: 'molla', english: 'spring' },
  { italian: 'paraolio', english: 'oil seal' },
  { italian: 'perno', english: 'pin' },
  { italian: 'piastrina', english: 'plate' },
  { italian: 'posteriore', english: 'rear' },
  { italian: 'rondella', english: 'washer' },
  { italian: 'rosetta', english: 'washer' },
  { italian: 'sinistro', english: 'left' },
  { italian: 'staffa', english: 'bracket' },
  { italian: 'supporto', english: 'mounting' },
  { italian: 'tubo', english: 'pipe' },
  { italian: 'vite', english: 'screw' },
];

export interface Masked {
  /** The Italian with every code and number replaced by `{{1}}`, `{{2}}`…. */
  text: string;
  codes: string[];
}

const CODE = /\S*\d\S*/g;
const PLACEHOLDER = /\{\{(\d+)\}\}/g;

export function maskCodes(italian: string): Masked {
  const codes: string[] = [];
  const text = italian.replace(CODE, (code) => {
    codes.push(code);
    return `{{${codes.length}}}`;
  });
  return { text, codes };
}

/**
 * The English with the codes put back as they were printed, or `null` where it lost one, invented
 * one or carried one twice — which would be an English that says something the Italian does not.
 */
export function unmaskCodes(english: string, codes: string[]): string | null {
  const seen = [...english.matchAll(PLACEHOLDER)].map((match) => Number(match[1]));
  const each = codes.map((_, index) => seen.filter((number) => number === index + 1).length);
  if (seen.length !== codes.length || each.some((count) => count !== 1)) {
    return null;
  }
  return english.replace(PLACEHOLDER, (_, number: string) => codes[Number(number) - 1] as string);
}

/** What one Tavola's Italian was machine-translated as, kept with it for the loader to compare. */
export interface MachineTranslation {
  italian: string;
  english: string;
}

/**
 * Every translation made in one directory, so the same Italian is translated once and reads the
 * same wherever it appears. An Italian the model could not translate faithfully is remembered as
 * having none, and is not asked about again.
 */
export class Translations {
  private readonly known = new Map<string, string>();

  constructor(earlier: MachineTranslation[] = []) {
    for (const { italian, english } of earlier) {
      this.known.set(italian, english);
    }
  }

  /** The texts among these that have not been translated yet, once each. */
  missing(texts: string[]): string[] {
    return [...new Set(texts.filter((text) => text.trim() !== '' && !this.known.has(text)))];
  }

  /** Records what the model answered for `italian`, with the codes put back. */
  record(italian: string, maskedEnglish: string, codes: string[]): void {
    this.known.set(italian, unmaskCodes(maskedEnglish.trim(), codes) ?? '');
  }

  /** The English for this Italian, or `''` where there is none. */
  english(italian: string): string {
    return this.known.get(italian) ?? '';
  }

  /** What these texts were translated as, leaving out the ones that have no English. */
  of(texts: string[]): MachineTranslation[] {
    return [...new Set(texts)]
      .map((italian) => ({ italian, english: this.english(italian) }))
      .filter((translation) => translation.english !== '');
  }
}
