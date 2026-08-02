import type { ErrorEvent } from '@sentry/node';
import { describe, expect, it } from 'vitest';
import { ConfigurationError } from '../src/config/config.js';
import { assertEuDataRegion, scrubPersonalData } from '../src/platform/error-reporting.js';

/**
 * These two rules have no HTTP surface — one refuses to start the process, the other runs on
 * the way out to a third party — so they cannot be reached from the primary seam. They are
 * tested directly because the association is the controller for its members' personal data and
 * both rules are promises made on its behalf.
 */
describe('where error reports are allowed to go', () => {
  it("accepts a DSN in Sentry's EU data region", () => {
    expect(() =>
      assertEuDataRegion('https://examplekey@o000000.ingest.de.sentry.io/1234567'),
    ).not.toThrow();
  });

  it('refuses to start against a US DSN, rather than quietly sending member data abroad', () => {
    expect(() =>
      assertEuDataRegion('https://examplekey@o000000.ingest.us.sentry.io/1234567'),
    ).toThrow(ConfigurationError);
  });

  it('refuses a region-less sentry.io DSN, which is the easy mistake', () => {
    expect(() => assertEuDataRegion('https://examplekey@o000000.ingest.sentry.io/1234567')).toThrow(
      ConfigurationError,
    );
  });

  it('lets a self-hosted installation through, since it is not Sentry that hosts it', () => {
    // The limit of this check, stated out loud: where a self-hosted Sentry lives is an
    // operations decision this code cannot see.
    expect(() => assertEuDataRegion('https://examplekey@sentry.example.org/1')).not.toThrow();
  });
});

describe('what an error report is allowed to carry', () => {
  it('strips everything that could identify a member before the event leaves', () => {
    const event: ErrorEvent = {
      type: undefined,
      user: { id: 'account-1', email: 'member@example.org', ip_address: '203.0.113.9' },
      server_name: 'ricambi-01',
      request: {
        url: 'https://ricambi.example.org/api/models?brand=Iso',
        query_string: 'brand=Iso',
        cookies: { session: 'a-real-session-cookie' },
        headers: { cookie: 'session=a-real-session-cookie', authorization: 'Bearer token' },
        data: { password: 'the-members-password' },
      },
      breadcrumbs: [{ message: 'sign-in', data: { email: 'member@example.org' } }],
    };

    const scrubbed = scrubPersonalData(event);

    expect(scrubbed.user).toBeUndefined();
    expect(scrubbed.server_name).toBeUndefined();
    expect(scrubbed.request?.cookies).toBeUndefined();
    expect(scrubbed.request?.headers).toBeUndefined();
    expect(scrubbed.request?.data).toBeUndefined();
    expect(scrubbed.request?.query_string).toBeUndefined();
    expect(scrubbed.breadcrumbs?.[0]?.data).toBeUndefined();
  });

  it('keeps the path, so a report still says which route failed', () => {
    const event: ErrorEvent = {
      type: undefined,
      request: { url: 'https://ricambi.example.org/api/models?brand=Iso' },
    };

    expect(scrubPersonalData(event).request?.url).toBe('https://ricambi.example.org/api/models');
  });
});
