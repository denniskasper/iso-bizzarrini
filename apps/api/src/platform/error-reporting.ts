import * as Sentry from '@sentry/node';
import type { Express } from 'express';
import { ConfigurationError, type AppConfig } from '../config/config.js';

/**
 * Error reporting, in Sentry's EU data region with PII scrubbing on (ADR 0008).
 *
 * The association is the controller for its members' personal data, so error reports must not
 * leave the EU and must not carry the data in the first place. Both are enforced here rather
 * than left to a setting in someone's browser: a non-EU DSN is a startup failure, and every
 * event is stripped before it is sent.
 */

const NON_EU_SENTRY_SUFFIXES = ['.ingest.us.sentry.io', '.ingest.sentry.io', 'sentry.io'];

/** Sentry's EU ingest hosts. Self-hosted installations are not sentry.io and are left alone. */
export function assertEuDataRegion(dsn: string): void {
  let host: string;
  try {
    host = new URL(dsn).hostname.toLowerCase();
  } catch {
    throw new ConfigurationError(`SENTRY_DSN is not a valid URL.`);
  }

  if (host.endsWith('.ingest.de.sentry.io') || host === 'de.sentry.io') {
    return;
  }

  const isSentryHosted = NON_EU_SENTRY_SUFFIXES.some(
    (suffix) => host === suffix || host.endsWith(suffix),
  );

  if (isSentryHosted) {
    throw new ConfigurationError(
      `SENTRY_DSN points at "${host}", which is not Sentry's EU data region. ` +
        'Member data may not leave the EU — create the project in the EU region and use its DSN.',
    );
  }
}

/**
 * Everything an error report does not need. Sentry's own `sendDefaultPii: false` stops it
 * *adding* identifying data; this stops what we would otherwise pass on ourselves.
 *
 * Exported because it is the whole of the promise made to members about what leaves this
 * process, and a promise nobody can test is not one worth making.
 */
export function scrubPersonalData(event: Sentry.ErrorEvent): Sentry.ErrorEvent {
  delete event.user;
  delete event.server_name;

  if (event.request) {
    delete event.request.cookies;
    delete event.request.data;
    delete event.request.headers;
    delete event.request.query_string;
    if (event.request.url) {
      event.request.url = event.request.url.split('?')[0];
    }
  }

  event.breadcrumbs = event.breadcrumbs?.map((breadcrumb) => ({
    ...breadcrumb,
    data: undefined,
  }));

  return event;
}

export function initialiseErrorReporting(config: AppConfig): boolean {
  if (!config.sentry.dsn) {
    return false;
  }

  assertEuDataRegion(config.sentry.dsn);

  Sentry.init({
    dsn: config.sentry.dsn,
    environment: config.environmentName,
    tracesSampleRate: config.sentry.tracesSampleRate,
    sendDefaultPii: false,
    maxValueLength: 2048,
    beforeSend: scrubPersonalData,
    beforeSendTransaction: (transaction) => {
      delete transaction.server_name;
      return transaction;
    },
  });

  return true;
}

export function attachErrorReportingTo(app: Express): void {
  Sentry.setupExpressErrorHandler(app);
}
