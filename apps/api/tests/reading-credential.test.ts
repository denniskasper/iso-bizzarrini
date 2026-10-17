import { describe, expect, it } from 'vitest';
import { chooseCredential } from '../src/reading/choose-method.js';

/**
 * **Which credential reads a catalog** (ADR 0016, issue #38). One there is, is used; with both,
 * the operator says which, so a key that happens to be set never takes over a run meant for the
 * subscription.
 */
describe('choosing what reads a catalog', () => {
  const only = (credential: 'subscription' | 'api-key') => ({
    subscription: credential === 'subscription',
    apiKey: credential === 'api-key',
  });
  const both = { subscription: true, apiKey: true };

  it('uses the subscription login where it is the only one', () => {
    expect(chooseCredential(only('subscription'), undefined)).toBe('subscription');
  });

  it('uses the API key where it is the only one', () => {
    expect(chooseCredential(only('api-key'), undefined)).toBe('api-key');
  });

  it('refuses to choose between the two itself', () => {
    expect(() => chooseCredential(both, undefined)).toThrow(
      'There is both a subscription login and an API key in ANTHROPIC_API_KEY. Say which one ' +
        'reads this catalog: --with subscription, which is not charged, or --with api-key, ' +
        'which is billed per use.',
    );
  });

  it('uses whichever it is told to where there are both', () => {
    expect(chooseCredential(both, 'subscription')).toBe('subscription');
    expect(chooseCredential(both, 'api-key')).toBe('api-key');
  });

  it('refuses a credential that is not there rather than using the other', () => {
    expect(() => chooseCredential(only('api-key'), 'subscription')).toThrow(
      /There is no subscription login/,
    );
    expect(() => chooseCredential(only('subscription'), 'api-key')).toThrow(
      /There is no API key in ANTHROPIC_API_KEY/,
    );
  });

  it('says what to do where there is nothing to read with', () => {
    expect(() => chooseCredential({ subscription: false, apiKey: false }, undefined)).toThrow(
      /There is nothing to read with/,
    );
  });

  it('knows only the two', () => {
    expect(() => chooseCredential(both, 'card')).toThrow(
      '--with is either subscription or api-key.',
    );
  });
});
