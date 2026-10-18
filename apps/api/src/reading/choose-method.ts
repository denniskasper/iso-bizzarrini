/**
 * **Which credential pays for a run** (ADR 0017, issue #38). Where there is only one, it is used.
 * Where there are both, the operator says which: a key that happens to be set must never take
 * over a run meant for the subscription, and the subscription must never quietly stand in for a
 * key the Club pays for.
 */
export type Credential = 'subscription' | 'api-key';

export const CREDENTIALS = ['subscription', 'api-key'] as const satisfies Credential[];

export interface CredentialsAvailable {
  /** Claude Code is signed in with a plan. */
  subscription: boolean;
  /** `ANTHROPIC_API_KEY` is set. */
  apiKey: boolean;
}

export class CredentialChoiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CredentialChoiceError';
  }
}

export function chooseCredential(
  available: CredentialsAvailable,
  asked: string | undefined,
): Credential {
  if (asked !== undefined) {
    if (!(CREDENTIALS as readonly string[]).includes(asked)) {
      throw new CredentialChoiceError('--with is either subscription or api-key.');
    }
    if (asked === 'subscription' && !available.subscription) {
      throw new CredentialChoiceError(
        'There is no subscription login. Sign in with `claude auth login`, or read with --with api-key.',
      );
    }
    if (asked === 'api-key' && !available.apiKey) {
      throw new CredentialChoiceError(
        'There is no API key in ANTHROPIC_API_KEY. Set one, or read with --with subscription.',
      );
    }
    return asked as Credential;
  }

  if (available.subscription && available.apiKey) {
    throw new CredentialChoiceError(
      'There is both a subscription login and an API key in ANTHROPIC_API_KEY. Say which one ' +
        'reads this catalog: --with subscription, which is not charged, or --with api-key, ' +
        'which is billed per use.',
    );
  }
  if (available.subscription) {
    return 'subscription';
  }
  if (available.apiKey) {
    return 'api-key';
  }
  throw new CredentialChoiceError(
    'There is nothing to read with. Sign in to Claude Code with a subscription ' +
      '(`claude auth login`), or put an API key in ANTHROPIC_API_KEY.',
  );
}
