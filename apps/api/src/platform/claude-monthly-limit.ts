import Anthropic from '@anthropic-ai/sdk';

/**
 * **The provider refusing because the Monthly limit is reached**, recognised the same way by
 * Proposals' conversations and by Catalog runs. It answers in one of two ways, and neither can be
 * passed by asking again before the month turns:
 *
 * - at a limit set in the Console, the organisation's or the workspace's: HTTP 400
 *   `invalid_request_error`, "You have reached your specified (workspace) API usage limits…";
 * - at the tier's own cap: HTTP 429 `enforced_spend_limit_reached`, without `retry-after`.
 */
export function isMonthlyLimitRefusal(error: unknown): boolean {
  if (error instanceof Anthropic.BadRequestError) {
    return SPECIFIED_LIMIT.test(messageOf(error.error));
  }
  if (error instanceof Anthropic.RateLimitError) {
    return JSON.stringify(error.error ?? null).includes(TIER_CAP);
  }
  return false;
}

const SPECIFIED_LIMIT = /^You have reached your specified (workspace )?API usage limits/;
const TIER_CAP = 'enforced_spend_limit_reached';

function messageOf(body: unknown): string {
  const inner = (body as { error?: { message?: unknown } } | undefined)?.error;
  return typeof inner?.message === 'string' ? inner.message : '';
}

/**
 * A `fetch` for the Anthropic client that tells it not to retry the tier cap's 429. The client
 * retries every 429 on its own, which at the cap would only ask again, and again, for what will be
 * refused until the month turns. A 400 is never retried, so the Console's limit needs nothing.
 */
export function fetchWithoutRetryAtTheMonthlyLimit(
  fetch: typeof globalThis.fetch = globalThis.fetch,
): typeof globalThis.fetch {
  return async (input, init) => {
    const response = await fetch(input, init);
    if (response.status !== 429 || !(await response.clone().text()).includes(TIER_CAP)) {
      return response;
    }
    const headers = new Headers(response.headers);
    headers.set('x-should-retry', 'false');
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  };
}
