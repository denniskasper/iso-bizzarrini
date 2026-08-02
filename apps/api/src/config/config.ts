import type { EnvironmentMode } from '@ricambi/contracts';
import { z } from 'zod';

/**
 * Configuration is read from the environment and validated once, at the composition root.
 * Nothing environment-specific is compiled in: the same image runs in development, in the
 * non-production system and in production, and differs only by what it is handed here.
 */
const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  /**
   * Which deployment this is. Shown to the operator. A free string, not an enum, because
   * naming environments is an operations decision rather than a code change.
   */
  ENVIRONMENT_NAME: z.string().min(1).default('development'),
  /**
   * Whether this is the real archive.
   *
   * **The default is `non-production`, and that direction is deliberate.** An environment that
   * has not said which it is gets marked as practice: a production system wearing a demo banner
   * is embarrassing and instantly visible, whereas a demo quietly passing itself off as the
   * archive is the failure this whole ticket exists to prevent. Production is opt-in, in
   * writing, once.
   */
  ENVIRONMENT_MODE: z.enum(['production', 'non-production']).default('non-production'),
  PORT: z.coerce.number().int().positive().max(65535).default(3000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  /** Where the built single-page app lives. Unset means the API serves no static files. */
  WEB_DIST_PATH: z.string().min(1).optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  /** `memory` captures mail for inspection; `none` refuses to send at all. */
  EMAIL_TRANSPORT: z.enum(['none', 'memory']).default('none'),

  /** `none` refuses every webhook delivery. Stripe arrives with ticket 18. */
  PAYMENT_PROVIDER: z.enum(['none']).default('none'),

  /**
   * Whether this environment may send renewal reminders. Off unless it says otherwise, because
   * the first roster import must not be able to mail the whole membership (story 126), and a
   * non-production environment may not turn it on at all.
   */
  REMINDERS_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
});

export type Environment = z.infer<typeof environmentSchema>;

export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  environmentName: string;
  environmentMode: EnvironmentMode;
  /**
   * Whether `ENVIRONMENT_MODE` was actually set, rather than defaulted.
   *
   * Reading the mode defaults to the safe answer; *destroying* data on the strength of it may
   * not. Seeding truncates, so it demands an environment that has said what it is out loud —
   * an unset variable is silence, and silence is not permission to empty a table.
   */
  environmentModeDeclared: boolean;
  port: number;
  databaseUrl: string;
  webDistPath: string | undefined;
  logLevel: Environment['LOG_LEVEL'];
  email: {
    transport: Environment['EMAIL_TRANSPORT'];
  };
  payments: {
    provider: Environment['PAYMENT_PROVIDER'];
  };
  /**
   * Read by the environment guard now, and by the reminder run at ticket 17 — which, if it does
   * not go through `createApp`, owes `assertSafeForEnvironment` a call of its own (ADR 0012).
   */
  remindersEnabled: boolean;
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
    environmentMode: env.ENVIRONMENT_MODE,
    environmentModeDeclared: typeof source.ENVIRONMENT_MODE === 'string',
    port: env.PORT,
    databaseUrl: env.DATABASE_URL,
    webDistPath: env.WEB_DIST_PATH,
    logLevel: env.LOG_LEVEL,
    email: {
      transport: env.EMAIL_TRANSPORT,
    },
    payments: {
      provider: env.PAYMENT_PROVIDER,
    },
    remindersEnabled: env.REMINDERS_ENABLED,
  };
}
