import { pino, type DestinationStream, type Logger as PinoLogger } from 'pino';
import type { AppConfig } from '../config/config.js';

export type Logger = PinoLogger;

/**
 * Logs carry no member data. Sign-in attempts, invitation links and roster imports all pass
 * through this process, and a log file is one more place personal data would otherwise
 * accumulate outside the retention rules.
 *
 * `destination` is where the lines go when it is not the process's own output — which is only
 * ever a test reading back what would have been written.
 */
export function createLogger(config: AppConfig, destination?: DestinationStream): Logger {
  return pino(
    {
      level: config.logLevel,
      base: { environment: config.environmentName },
      serializers: { err: describeError },
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
    },
    destination,
  );
}

/** What a logged error is reduced to. Everything here is about the fault and none of it is data. */
export interface DescribedError {
  type: string;
  message: string;
  stack?: string;
  cause?: DescribedError;
  [detail: string]: unknown;
}

/**
 * The facts about a failure that say *where* it happened and *which rule* was broken, and are
 * never a value somebody typed. Named one by one: an error is an open bag of properties, and the
 * way one of them reaches the log has to be that somebody put it on this list.
 *
 * `query` is the statement with its placeholders — `values ($1, $2)` — and is what makes a
 * failed query findable at all. What is deliberately **not** here is what the database layer
 * and the driver put beside it: `params`, the values the statement was run with, and `detail`
 * and `where`, in which Postgres quotes the offending row back.
 */
const ABOUT_THE_FAULT = [
  'code',
  'status',
  'query',
  'constraint',
  'schema',
  'table',
  'column',
  'routine',
  'syscall',
] as const;

/** How far down a chain of causes is followed. Deeper than this is a loop, not a story. */
const DEEPEST_CAUSE = 5;

/**
 * **An error, as the log is allowed to keep it** (issue #9).
 *
 * The default writes down every property an error carries, and a failed query carries the
 * values it was run with — a name, an e-mail address, a password hash — once as a property and
 * once more inside its own message. Nothing sweeps a log file, so that is personal data kept
 * for as long as the file is, by accident, about exactly the people something went wrong for.
 *
 * So this keeps what a fault is found from — the kind of error, where it was raised, the
 * statement, the constraint — and drops what it was about. It is given to pino as the `err`
 * serializer, which makes it true of every line that logs one rather than of the lines whose
 * author remembered.
 *
 * **What it cannot promise** is the wording of a message it did not write. A driver that quotes
 * one malformed value in its own sentence — `invalid input syntax for type uuid: "…"` — is
 * logged as it spoke, because a message with the nouns taken out is no use to anybody.
 */
export function describeError(error: unknown, depth = 0): DescribedError {
  if (!(error instanceof Error)) {
    return { type: typeof error, message: String(error) };
  }

  const message = withoutParameters(error);
  const described: DescribedError = {
    type: error.name,
    message,
    // The stack opens by repeating the message, values and all.
    stack: error.stack?.replace(error.message, message),
  };

  for (const fact of ABOUT_THE_FAULT) {
    const value = (error as unknown as Record<string, unknown>)[fact];
    if (typeof value === 'string' || typeof value === 'number') {
      described[fact] = value;
    }
  }

  if (error.cause !== undefined && depth < DEEPEST_CAUSE) {
    described.cause = describeError(error.cause, depth + 1);
  }

  return described;
}

/**
 * A failed query's message is the statement and then the values on a line of their own. The
 * statement is kept; an error that carries `params` has its message cut where they begin.
 */
function withoutParameters(error: Error): string {
  if (!('params' in error)) {
    return error.message;
  }
  const parameters = error.message.indexOf('\nparams:');
  return parameters === -1 ? error.message : error.message.slice(0, parameters);
}
