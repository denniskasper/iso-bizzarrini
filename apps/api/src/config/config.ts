import { z } from 'zod';

/**
 * Configuration is read from the environment and validated once, at the composition root.
 * Nothing environment-specific is compiled in: the same image runs in development, in the
 * non-production system and in production, and differs only by what it is handed here.
 */
const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  /**
   * Which deployment this is. Shown to the operator, tagged on error reports, and the hook a
   * non-production environment hangs its banner on. A free string, not an enum, because
   * naming environments is an operations decision rather than a code change.
   */
  ENVIRONMENT_NAME: z.string().min(1).default('development'),
  PORT: z.coerce.number().int().positive().max(65535).default(3000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  /** Where the built single-page app lives. Unset means the API serves no static files. */
  WEB_DIST_PATH: z.string().min(1).optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  SENTRY_DSN: z.string().url().optional(),
  SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0),

  /** `memory` captures mail for inspection; `none` refuses to send at all. */
  EMAIL_TRANSPORT: z.enum(['none', 'memory']).default('none'),

  /** `none` refuses every webhook delivery. Stripe arrives with ticket 18. */
  PAYMENT_PROVIDER: z.enum(['none']).default('none'),
});

export type Environment = z.infer<typeof environmentSchema>;

export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  environmentName: string;
  port: number;
  databaseUrl: string;
  webDistPath: string | undefined;
  logLevel: Environment['LOG_LEVEL'];
  sentry: {
    dsn: string | undefined;
    tracesSampleRate: number;
  };
  email: {
    transport: Environment['EMAIL_TRANSPORT'];
  };
  payments: {
    provider: Environment['PAYMENT_PROVIDER'];
  };
}

export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = environmentSchema.safeParse(source);

  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `  ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new ConfigurationError(`Invalid environment configuration:\n${problems}`);
  }

  const env = parsed.data;

  return {
    nodeEnv: env.NODE_ENV,
    environmentName: env.ENVIRONMENT_NAME,
    port: env.PORT,
    databaseUrl: env.DATABASE_URL,
    webDistPath: env.WEB_DIST_PATH,
    logLevel: env.LOG_LEVEL,
    sentry: {
      dsn: env.SENTRY_DSN,
      tracesSampleRate: env.SENTRY_TRACES_SAMPLE_RATE,
    },
    email: {
      transport: env.EMAIL_TRANSPORT,
    },
    payments: {
      provider: env.PAYMENT_PROVIDER,
    },
  };
}
