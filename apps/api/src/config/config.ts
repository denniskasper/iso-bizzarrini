import { resolve } from 'node:path';
import type { EnvironmentMode, RetentionTerms } from '@ricambi/contracts';
import { z } from 'zod';
import type { SmtpSettings } from '../platform/smtp-email.js';

/**
 * Configuration is read from the environment and validated once, at the composition root.
 * Nothing environment-specific is compiled in: the same image runs in development, in the
 * non-production system and in production, and differs only by what it is handed here.
 */
/**
 * A variable written in a `.env` file with nothing after the `=` is a variable somebody meant
 * to leave unset — an empty string is not a signing key.
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
   * can click the link in an invitation, and `none` refuses to send at all. `smtp` delivers, and
   * needs every `SMTP_` variable below and `EMAIL_FROM_ADDRESS` (issue #16).
   */
  EMAIL_TRANSPORT: z.enum(['none', 'memory', 'log', 'smtp']).default('none'),

  SMTP_HOST: z.preprocess(blankAsUnset, z.string().min(1).optional()),
  SMTP_PORT: z.preprocess(blankAsUnset, z.coerce.number().int().positive().max(65535).optional()),
  /**
   * `true` for a connection that is TLS from the first byte (usually port 465); `false` for one
   * that upgrades with STARTTLS (usually 587). There is no plaintext option: a server that will
   * not upgrade is refused.
   */
  SMTP_SECURE: z.preprocess(blankAsUnset, z.enum(['true', 'false']).optional()),
  SMTP_USER: z.preprocess(blankAsUnset, z.string().min(1).optional()),
  SMTP_PASSWORD: z.preprocess(blankAsUnset, z.string().min(1).optional()),
  /** The address letters are sent from. Its domain is the one SPF, DKIM and DMARC are set on. */
  EMAIL_FROM_ADDRESS: z.preprocess(
    blankAsUnset,
    z.email('EMAIL_FROM_ADDRESS must be an e-mail address').optional(),
  ),
  /** The name letters are sent in. The platform's, not the Club's (issue #3). */
  EMAIL_FROM_NAME: z.preprocess(blankAsUnset, z.string().min(1).default('Ricambi')),

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

  /**
   * Who collects the fee when a member pays through the platform (ADR 0004). `none` offers
   * nobody a way to pay online and refuses every webhook delivery, which is right for a laptop
   * and for a preview; `stripe` needs both of the keys below.
   */
  PAYMENT_PROVIDER: z.enum(['none', 'stripe']).default('none'),

  /**
   * Stripe's secret key. **Whether it is a test key or a live one is read off the key itself**,
   * and a non-production environment refuses to start with a live one.
   */
  STRIPE_SECRET_KEY: z.preprocess(blankAsUnset, z.string().min(1).optional()),

  /** The signing secret of the webhook endpoint Stripe delivers to (`whsec_…`). */
  STRIPE_WEBHOOK_SECRET: z.preprocess(blankAsUnset, z.string().min(1).optional()),

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
   * How many years an Account is kept after its last Membership ran out, before the retention
   * sweep deletes it (ADR 0007). Three is the proposal; **the association confirms the figure**,
   * and changing it is this variable rather than a deployment.
   */
  RETENTION_YEARS: z.coerce.number().int().min(1).max(50).default(3),

  /**
   * How many days past the Paid-through a member whose Subscription renews itself may go on
   * reading, while the bank confirms the renewal payment (issue #17). A SEPA debit takes days,
   * and without this a renewing member would meet the renewal screen for those days every year.
   * Grace changes who may read, never what was paid for: the Paid-through does not move.
   */
  RENEWAL_GRACE_DAYS: z.coerce.number().int().min(0).max(60).default(14),

  /**
   * How many full calendar years a payment record outlives the year the money arrived — the
   * statutory accounting period, which no erasure shortens. Ten is a cautious default and not
   * advice: the figure is whatever the association's accountant says it is.
   */
  PAYMENT_RECORD_RETENTION_YEARS: z.coerce.number().int().min(1).max(50).default(10),

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
   * **Development only: every request without a session is this Account.** An e-mail address on
   * the roster, so `pnpm dev` on a machine only its owner can reach opens straight into the
   * archive instead of the sign-in form. Refused outside `NODE_ENV=development`, refused in
   * production, and while it is set the API listens on loopback alone (`main.ts`).
   */
  DEV_SIGN_IN_AS: z.preprocess(blankAsUnset, z.string().email().optional()),

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
   * The largest screenshot somebody proposing may show (issue #154). A phone's or a laptop's
   * screen as a PNG is a few megabytes; anything past this is not a screenshot.
   */
  MAX_SCREENSHOT_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(10 * 1024 * 1024),

  /**
   * The largest catalog PDF an Administrator may upload to be read (issue #57). The factory's
   * catalog scanned whole runs to a few hundred pages of A3, so this one upload is allowed far
   * more than a scan of one sheet.
   */
  MAX_CATALOG_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(500 * 1024 * 1024),

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

  /**
   * **What this server reads the factory catalog with** (ADR 0018, issue #55): exactly one of
   * `subscription`, `api-key` or `fake`. Unset means none, and no reading can start. `fake`
   * invents what it reads, for a practice system and the tests, and production refuses it.
   */
  READING_METHOD: z.preprocess(
    blankAsUnset,
    z.enum(['subscription', 'api-key', 'fake']).optional(),
  ),
  /**
   * The subscription's login, as a secret: the long-lived token `claude setup-token` prints,
   * which Claude Code in the image signs in with. Never shown, logged or written anywhere.
   */
  CLAUDE_CODE_OAUTH_TOKEN: z.preprocess(blankAsUnset, z.string().min(1).optional()),
  /** The Anthropic API key, as a secret. Billed per use. Never shown, logged or written. */
  ANTHROPIC_API_KEY: z.preprocess(blankAsUnset, z.string().min(1).optional()),

  /**
   * **What a Proposal's conversation is had with** (issue #152), on a practice system only:
   * `api-key`, Claude through PROPOSALS_ANTHROPIC_API_KEY (issue #155), or `fake`, which answers
   * fixed text. Unset, the key decides: with it the conversation is `api-key`, without it there is
   * none and nobody is shown Propose.
   */
  PROPOSALS_METHOD: z.preprocess(blankAsUnset, z.enum(['api-key', 'fake']).optional()),
  /**
   * The conversation's own Anthropic API key, kept in a workspace of its own with a monthly limit.
   * **Production refuses to start with it** (ADR 0012, as amended). Never shown, logged or written.
   */
  PROPOSALS_ANTHROPIC_API_KEY: z.preprocess(blankAsUnset, z.string().min(1).optional()),
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
  email: { transport: 'none' | 'memory' | 'log' } | { transport: 'smtp'; smtp: SmtpSettings };
  passwords: {
    breachCheck: Environment['BREACHED_PASSWORD_CHECK'];
  };
  payments:
    | { provider: 'none' }
    | { provider: 'stripe'; stripe: { secretKey: string; webhookSecret: string } };
  /**
   * Read by the environment guard, and by the reminder run (issue #3) — which, if it ever does
   * not go through `createApp`, owes `assertSafeForEnvironment` a call of its own (ADR 0012).
   */
  remindersEnabled: boolean;
  /**
   * The gate. Every person who reaches the archive is an Account with a password of their own
   * (ticket 14), so the only thing configuration decides here is what signs their cookie.
   */
  session: {
    secret: string | undefined;
    /** Who a request without a session is, in development. See `DEV_SIGN_IN_AS`. */
    devSignInAs: string | undefined;
  };
  files: {
    /** Absolute, so nothing depends on where the process happens to have been started. */
    storagePath: string;
    maxScanBytes: number;
    maxPhotographBytes: number;
    maxScreenshotBytes: number;
    maxCatalogBytes: number;
  };
  /** What the retention sweep applies and the privacy statement quotes (ADR 0007). */
  retention: RetentionTerms;
  /** Days a renewing member reads past their Paid-through while the payment is confirmed. */
  renewalGraceDays: number;
  migrateOnStart: boolean;
  seedPracticeArchive: boolean;
  /**
   * The Reading method named, and the two credentials as they were found. Which of them may read
   * is `composition/reading.ts`'s to decide, so that none and both are reported rather than
   * refused at startup: the rest of the archive does not depend on reading.
   */
  reading: ReadingSettings;
  /**
   * The conversation method named, and its credential as it was found. Which may talk is
   * `composition/conversation.ts`'s to decide; that Production holds no credential is
   * `assertSafeForEnvironment`'s.
   */
  proposals: ProposalSettings;
}

export type ConversationMethodKind = NonNullable<Environment['PROPOSALS_METHOD']>;

export interface ProposalSettings {
  method: ConversationMethodKind | undefined;
  apiKey: string | undefined;
}

export type ReadingMethodKind = NonNullable<Environment['READING_METHOD']>;

export interface ReadingSettings {
  method: ReadingMethodKind | undefined;
  subscriptionToken: string | undefined;
  apiKey: string | undefined;
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

  if (env.DEV_SIGN_IN_AS !== undefined && env.NODE_ENV !== 'development') {
    throw new ConfigurationError(
      `DEV_SIGN_IN_AS is set and NODE_ENV is ${env.NODE_ENV}. It signs in everybody who can ` +
        'reach the API, and is only for `pnpm dev` on a machine nobody else can reach.',
    );
  }

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
    email: emailFrom(env),
    passwords: {
      breachCheck: env.BREACHED_PASSWORD_CHECK,
    },
    payments: paymentsFrom(env),
    remindersEnabled: env.REMINDERS_ENABLED,
    session: {
      secret: env.SESSION_SECRET,
      devSignInAs: env.DEV_SIGN_IN_AS,
    },
    files: {
      storagePath: resolve(env.FILE_STORAGE_PATH),
      maxScanBytes: env.MAX_SCAN_BYTES,
      maxPhotographBytes: env.MAX_PHOTOGRAPH_BYTES,
      maxScreenshotBytes: env.MAX_SCREENSHOT_BYTES,
      maxCatalogBytes: env.MAX_CATALOG_BYTES,
    },
    retention: {
      accountYears: env.RETENTION_YEARS,
      paymentRecordYears: env.PAYMENT_RECORD_RETENTION_YEARS,
    },
    renewalGraceDays: env.RENEWAL_GRACE_DAYS,
    migrateOnStart: env.MIGRATE_ON_START,
    seedPracticeArchive: env.SEED_PRACTICE_ARCHIVE,
    reading: {
      method: env.READING_METHOD,
      subscriptionToken: env.CLAUDE_CODE_OAUTH_TOKEN,
      apiKey: env.ANTHROPIC_API_KEY,
    },
    proposals: {
      method: env.PROPOSALS_METHOD,
      apiKey: env.PROPOSALS_ANTHROPIC_API_KEY,
    },
  };
}

/**
 * A transport and everything it needs, or a refusal to start naming what is missing — the same
 * rule as the payment provider's below, for the same reason.
 */
function emailFrom(env: Environment): AppConfig['email'] {
  if (env.EMAIL_TRANSPORT !== 'smtp') {
    return { transport: env.EMAIL_TRANSPORT };
  }

  const { SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASSWORD, EMAIL_FROM_ADDRESS } = env;
  if (
    SMTP_HOST === undefined ||
    SMTP_PORT === undefined ||
    SMTP_SECURE === undefined ||
    SMTP_USER === undefined ||
    SMTP_PASSWORD === undefined ||
    EMAIL_FROM_ADDRESS === undefined
  ) {
    const missing = Object.entries({
      SMTP_HOST,
      SMTP_PORT,
      SMTP_SECURE,
      SMTP_USER,
      SMTP_PASSWORD,
      EMAIL_FROM_ADDRESS,
    })
      .filter(([, value]) => value === undefined)
      .map(([name]) => name);
    throw new ConfigurationError(
      'Invalid environment configuration:\n' +
        `  EMAIL_TRANSPORT=smtp needs ${missing.join(', ')}.`,
    );
  }

  return {
    transport: 'smtp',
    smtp: {
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE === 'true',
      user: SMTP_USER,
      password: SMTP_PASSWORD,
      from: { address: EMAIL_FROM_ADDRESS, name: env.EMAIL_FROM_NAME },
    },
  };
}

/**
 * A provider and everything it needs, or a refusal to start. Half-configured is the state to
 * rule out: a system that offers members a button and then cannot verify what comes back.
 */
function paymentsFrom(env: Environment): AppConfig['payments'] {
  if (env.PAYMENT_PROVIDER === 'none') {
    return { provider: 'none' };
  }

  if (env.STRIPE_SECRET_KEY === undefined || env.STRIPE_WEBHOOK_SECRET === undefined) {
    throw new ConfigurationError(
      'Invalid environment configuration:\n' +
        '  PAYMENT_PROVIDER=stripe needs both STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET.',
    );
  }

  return {
    provider: 'stripe',
    stripe: { secretKey: env.STRIPE_SECRET_KEY, webhookSecret: env.STRIPE_WEBHOOK_SECRET },
  };
}
