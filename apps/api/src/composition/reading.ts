import type { ReadingMethodKind, ReadingSettings } from '../config/config.js';
import { createClaudeApiReadingMethod } from '../reading/claude-api-method.js';
import { createClaudeSubscriptionReadingMethod } from '../reading/claude-subscription-method.js';
import { createFakeReadingMethod } from '../reading/fake-reading-method.js';
import type { ReadingMethod } from '../reading/reading-method.js';

/**
 * **What this server reads the factory catalog with** (ADR 0018, issue #55), handed to the
 * application as an e-mail sender is.
 *
 * The configuration names exactly one Reading method. Where it names none, or where both
 * credentials are present, no reading can start and `unavailable` says why, in words an
 * Administrator can act on. The server still starts: nothing else in the archive depends on
 * reading. A credential is held by the method it was given to and appears nowhere here.
 */
export interface ConfiguredReading {
  /** The method the configuration names, or `null` for none. */
  readonly kind: ReadingMethodKind | null;
  /** What reads, where reading can start. */
  readonly method: ReadingMethod | null;
  /** Why no reading can start, or `null` where it can. Never carries a credential. */
  readonly unavailable: string | null;
  /**
   * Whether what it reads is invented rather than read off the catalog. Declared, like an
   * e-mail sender's `reachesRealPeople`, and refused in production.
   */
  readonly invented: boolean;
}

/** Whether what a kind of method reads is billed per use (ADR 0018). */
export const CHARGED: Record<ReadingMethodKind, boolean> = {
  subscription: false,
  'api-key': true,
  fake: false,
};

export function configureReading(
  settings: ReadingSettings,
  env: NodeJS.ProcessEnv = process.env,
): ConfiguredReading {
  const { method: kind, subscriptionToken, apiKey } = settings;

  if (kind === undefined) {
    return unavailable(
      null,
      'No Reading method is configured. Set READING_METHOD to subscription or api-key, with ' +
        'its credential as a secret.',
    );
  }

  // Exactly one credential, so the one that pays for a run is never a matter of which the
  // method happens to prefer (issue #38).
  if (subscriptionToken !== undefined && apiKey !== undefined) {
    return unavailable(
      kind,
      'There are both a subscription token and an API key. Remove the one that is not meant ' +
        'to read: CLAUDE_CODE_OAUTH_TOKEN for the subscription, ANTHROPIC_API_KEY for the key.',
    );
  }

  switch (kind) {
    case 'subscription':
      return subscriptionToken === undefined
        ? unavailable(
            kind,
            'The subscription is configured, and there is no subscription token to sign in ' +
              'with. Set CLAUDE_CODE_OAUTH_TOKEN as a secret.',
          )
        : available(
            kind,
            // The method takes every API credential out of Claude Code's environment and keeps
            // only the login, so a key set by mistake still never pays for this.
            createClaudeSubscriptionReadingMethod({
              env: { ...env, CLAUDE_CODE_OAUTH_TOKEN: subscriptionToken },
            }),
          );
    case 'api-key':
      return apiKey === undefined
        ? unavailable(
            kind,
            'The API key is configured, and there is no API key. Set ANTHROPIC_API_KEY as a ' +
              'secret.',
          )
        : available(kind, createClaudeApiReadingMethod({ apiKey }));
    case 'fake':
      return available(kind, createFakeReadingMethod());
  }
}

function available(kind: ReadingMethodKind, method: ReadingMethod): ConfiguredReading {
  return { kind, method, unavailable: null, invented: kind === 'fake' };
}

function unavailable(kind: ReadingMethodKind | null, why: string): ConfiguredReading {
  return { kind, method: null, unavailable: why, invented: kind === 'fake' };
}
