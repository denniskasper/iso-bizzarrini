import type { AppConfig } from '../config/config.js';
import {
  InMemoryEmailSender,
  UnconfiguredEmailSender,
  type EmailSender,
} from '../platform/email.js';
import { UnconfiguredPaymentProvider, type PaymentProvider } from '../platform/payments.js';

/**
 * Which implementation of each external edge this environment gets. The choice is
 * configuration, not code: the same image runs everywhere and differs only by what it is told.
 */
export function createEmailSender(config: AppConfig): EmailSender {
  switch (config.email.transport) {
    case 'memory':
      return new InMemoryEmailSender();
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
