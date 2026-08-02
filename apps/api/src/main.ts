import { createApp } from './app.js';
import { createEmailSender, createPaymentProvider } from './composition/platform.js';
import { loadConfig } from './config/config.js';
import { loadEnvFile } from './config/env-file.js';
import { createDatabase } from './db/client.js';
import { systemClock } from './platform/clock.js';
import { createLogger } from './platform/logger.js';

/**
 * The composition root. The only place that reads the environment, knows the real time, opens
 * a database connection or chooses an implementation for an external edge.
 */
loadEnvFile();

const config = loadConfig();
const logger = createLogger(config);

const database = createDatabase(config.databaseUrl);

const app = createApp({
  config,
  clock: systemClock,
  db: database.db,
  emailSender: createEmailSender(config),
  paymentProvider: createPaymentProvider(config),
  logger,
});

const server = app.listen(config.port, () => {
  logger.info({ port: config.port, environment: config.environmentName }, 'Ricambi API listening');
});

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    logger.info({ signal }, 'Shutting down');
    server.close(() => {
      void database.close().then(() => process.exit(0));
    });
  });
}
