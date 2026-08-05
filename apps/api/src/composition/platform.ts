import type { AppConfig } from '../config/config.js';
import {
  RangeApiBreachedPasswords,
  UncheckedPasswords,
  type BreachedPasswordCheck,
} from '../platform/breached-passwords.js';
import {
  InMemoryEmailSender,
  LoggedEmailSender,
  UnconfiguredEmailSender,
  type EmailSender,
} from '../platform/email.js';
import type { Logger } from '../platform/logger.js';
import { UnconfiguredPaymentProvider, type PaymentProvider } from '../platform/payments.js';

/**
 * Which implementation of each external edge this environment gets. The choice is
 * configuration, not code: the same image runs everywhere and differs only by what it is told.
 */
export function createEmailSender(config: AppConfig, logger: Logger): EmailSender {
  switch (config.email.transport) {
    case 'memory':
      return new InMemoryEmailSender();
    case 'log':
      return new LoggedEmailSender(logger);
    case 'none':
      return new UnconfiguredEmailSender();
  }
}

export function createPaymentProvider(config: AppConfig): PaymentProvider {
  switch (config.payments.provider) {
    case 'none':
      return new UnconfiguredPaymentProvider();
  }
}

export function createBreachedPasswordCheck(
  config: AppConfig,
  logger: Logger,
): BreachedPasswordCheck {
  switch (config.passwords.breachCheck) {
    case 'range-api':
      return new RangeApiBreachedPasswords({ logger });
    case 'none':
      return new UncheckedPasswords();
  }
}
