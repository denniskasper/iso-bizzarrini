import { resolve } from 'node:path';
import type { EnvironmentMode } from '@ricambi/contracts';
import { z } from 'zod';

/**
 * Configuration is read from the environment and validated once, at the composition root.
 * Nothing environment-specific is compiled in: the same image runs in development, in the
 * non-production system and in production, and differs only by what it is handed here.
 */
/**
 * A variable written in a `.env` file with nothing after the `=` is a variable somebody meant
 * to leave unset — an empty string is not a passphrase and not a signing key.
 */
function blankAsUnset(value: unknown): unknown {
  return typeof value === 'string' && value.trim() === '' ? undefined : value;
}

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

  /**
   * `memory` captures mail for a test to read, `log` writes it whole to the log so a developer
   * can click the link in an invitation, and `none` refuses to send at all.
   */
  EMAIL_TRANSPORT: z.enum(['none', 'memory', 'log']).default('none'),

  /**
   * Where a browser reaches this system, so that the link in an invitation lands on the right
   * host. Nothing else uses it: the application is one origin and the app always talks to
   * `/api` on whatever host it was served from.
   *
   * The default is the development app, which is where a fresh clone's invitations should go.
   * A production environment that has not been told its own address refuses to start rather
   * than mailing a hundred members a link to `localhost`.
   */
  PUBLIC_URL: z.url('PUBLIC_URL must be a URL').default('http://localhost:5173'),

  /**
   * Whether a password a member chooses is checked against a known-breached-password range API
   * (ADR 0003). **The default is the real check**, so a deployment gets it without anybody
   * remembering to ask; `none` is how a laptop on a train opts out, in writing.
   *
   * The password itself never leaves this process either way — see `breached-passwords.ts`.
   */
  BREACHED_PASSWORD_CHECK: z.enum(['range-api', 'none']).default('range-api'),

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

  /**
   * The **stand-in** Editor gate: one shared passphrase, which is the whole of M1's
   * "single hard-coded admin login". Accounts, Memberships, invitations and per-person
   * passwords arrive with ticket 14 and replace this entirely.
   *
   * Unset means nobody can sign in, and therefore nobody can reach a scan. That is the safe
   * direction: an archive that refuses everyone is a nuisance, an archive that admits everyone
   * is the promise the Club made to its members, broken.
   *
   * The application refuses to start in **production** while this is set, so the stand-in
   * cannot become the thing that guards the real archive by nobody getting round to it.
   */
  EDITOR_PASSWORD: z.preprocess(
    blankAsUnset,
    z.string().min(10, 'EDITOR_PASSWORD must be at least 10 characters').optional(),
  ),

  /**
   * Signs the session cookie. Unset means one is generated at startup, so sessions simply do
   * not survive a restart — which is right for a laptop and obvious in a deployment. There is
   * deliberately no default value to leave in place by accident.
   */
  SESSION_SECRET: z.preprocess(
    blankAsUnset,
    z.string().min(32, 'SESSION_SECRET must be at least 32 characters').optional(),
  ),

  /**
   * Where scans and their derived images are written. A directory, not a URL and not inside
   * anything served statically: the archive's images are reachable only through the
   * authenticated route (ADR 0006).
   */
  FILE_STORAGE_PATH: z.string().min(1).default('.data/files'),

  /**
   * The largest scan ingest will accept. An A3 sheet scanned at 600 dpi and kept uncompressed
   * is around 100 MB, which is the most anyone has suggested this archive might hold.
   */
  MAX_SCAN_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(100 * 1024 * 1024),

  /**
   * The largest photograph of a Part the archive will accept. **A quarter of what a scan may
   * be**, and the gap is the point: a scan is an A3 sheet somebody put on a flatbed once, at a
   * resolution the position numbers have to survive, while a photograph is whatever a phone in a
   * garage produced. 25 MB is already a generous phone photograph; anything above it is a camera
   * setting rather than something the archive needs, and it is refused before it is read into
   * memory rather than after.
   */
  MAX_PHOTOGRAPH_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(25 * 1024 * 1024),

  /**
   * Whether the application applies its own migrations before it starts listening.
   *
   * On by default, and that direction is deliberate too: a deployment whose schema has not
   * been applied does not fail loudly, it answers every request with a 500 against tables that
   * are not there. There is one container (ADR 0009), so nothing races it.
   */
  MIGRATE_ON_START: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),

  /**
   * Whether an **empty** practice system writes itself an invented catalog at startup, so that
   * a preview deployment has something in it to open. Off unless it says otherwise, and
   * refused outright by `assertSeedable` outside a declared non-production environment.
   *
   * It never truncates: a redeployment must not take away what an Editor recorded.
   */
  SEED_PRACTICE_ARCHIVE: z
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
  /** Where a browser reaches this system. Only ever used to build a link for an e-mail. */
  publicUrl: string;
  logLevel: Environment['LOG_LEVEL'];
  email: {
    transport: Environment['EMAIL_TRANSPORT'];
  };
  passwords: {
    breachCheck: Environment['BREACHED_PASSWORD_CHECK'];
  };
  payments: {
    provider: Environment['PAYMENT_PROVIDER'];
  };
  /**
   * Read by the environment guard now, and by the reminder run at ticket 17 — which, if it does
   * not go through `createApp`, owes `assertSafeForEnvironment` a call of its own (ADR 0012).
   */
  remindersEnabled: boolean;
  /** The stand-in Editor gate. `password` unset means nobody can sign in. */
  editorGate: {
    password: string | undefined;
    sessionSecret: string | undefined;
  };
  files: {
    /** Absolute, so nothing depends on where the process happens to have been started. */
    storagePath: string;
    maxScanBytes: number;
    maxPhotographBytes: number;
  };
  migrateOnStart: boolean;
  seedPracticeArchive: boolean;
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
    publicUrl: env.PUBLIC_URL,
    logLevel: env.LOG_LEVEL,
    email: {
      transport: env.EMAIL_TRANSPORT,
    },
    passwords: {
      breachCheck: env.BREACHED_PASSWORD_CHECK,
    },
    payments: {
      provider: env.PAYMENT_PROVIDER,
    },
    remindersEnabled: env.REMINDERS_ENABLED,
    editorGate: {
      password: env.EDITOR_PASSWORD,
      sessionSecret: env.SESSION_SECRET,
    },
    files: {
      storagePath: resolve(env.FILE_STORAGE_PATH),
      maxScanBytes: env.MAX_SCAN_BYTES,
      maxPhotographBytes: env.MAX_PHOTOGRAPH_BYTES,
    },
    migrateOnStart: env.MIGRATE_ON_START,
    seedPracticeArchive: env.SEED_PRACTICE_ARCHIVE,
  };
}
