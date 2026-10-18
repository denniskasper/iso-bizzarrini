/**
 * **What a token costs, as the provider lists it** (ADR 0017) — the only source the read command
 * prices a run from. It never asks the provider's billing, which would need a second, more
 * powerful credential. Prices change: whoever changes this list checks them again, at the source
 * below, and moves the date.
 *
 * The read command sets no prompt cache, so every input token is a base input token.
 */
export const PRICE_LIST = {
  checkedOn: '2026-10-17',
  source: 'https://platform.claude.com/docs/en/about-claude/pricing',
  currency: 'USD',
  /** Dollars per million tokens. */
  models: {
    'claude-opus-5-5': { inputPerMillion: 4, outputPerMillion: 20 },
  } as Record<string, ModelPrice | undefined>,
};

export interface ModelPrice {
  inputPerMillion: number;
  outputPerMillion: number;
}

export function priceOf(model: string): ModelPrice | null {
  return PRICE_LIST.models[model] ?? null;
}
