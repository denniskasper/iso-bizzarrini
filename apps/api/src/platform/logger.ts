import { pino, type Logger as PinoLogger } from 'pino';
import type { AppConfig } from '../config/config.js';

export type Logger = PinoLogger;

/**
 * Logs carry no member data. Sign-in attempts, invitation links and roster imports all pass
 * through this process, and a log file is one more place personal data would otherwise
 * accumulate outside the retention rules.
 */
export function createLogger(config: AppConfig): Logger {
  return pino({
    level: config.logLevel,
    base: { environment: config.environmentName },
    redact: {
      paths: [
        'req.headers.cookie',
        'req.headers.authorization',
        'res.headers["set-cookie"]',
        '*.email',
        '*.password',
      ],
      remove: true,
    },
  });
}
