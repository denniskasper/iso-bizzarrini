import type { ApiErrorBody } from '@ricambi/contracts';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import type { Logger } from '../platform/logger.js';

/**
 * One error shape for the whole API, so the browser never has to guess and a member never sees
 * an HTML stack trace where JSON was expected. The shape itself lives in `@ricambi/contracts`.
 */
export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export class NotFoundError extends HttpError {
  constructor(message = 'Not found.') {
    super(404, 'not_found', message);
  }
}

export class ValidationError extends HttpError {
  constructor(message: string, details?: unknown) {
    super(400, 'validation_failed', message, details);
  }
}

/**
 * Nobody is signed in. The archive is members-only, so this is the answer to a request for a
 * scan from a browser that has not been through the gate.
 */
export class NotSignedInError extends HttpError {
  constructor(message = 'Sign in to reach the archive.') {
    super(401, 'not_signed_in', message);
  }
}

/**
 * We know who this is, and they may not. Distinct from `NotSignedInError` in exactly the way
 * authorisation is distinct from authentication: signing in again would not help.
 */
export class ForbiddenError extends HttpError {
  constructor(message: string) {
    super(403, 'forbidden', message);
  }
}

/**
 * The member is who they say they are, and their Membership has run out.
 *
 * **Authenticated, and therefore told plainly.** They have proved who they are, so naming the
 * date discloses nothing to anybody else — and "your Membership ran out on the 3rd" is a sentence
 * somebody can act on, where a sign-in error is a sentence they telephone the Club about. Ticket
 * 15 gives it a screen carrying the amount, the bank details and the reference.
 */
export class MembershipLapsedError extends HttpError {
  constructor(paidThrough: string | null) {
    super(
      403,
      'membership_lapsed',
      paidThrough === null
        ? 'The Club has no Membership recorded for you. Contact the Club office.'
        : `Your Membership ran out on ${paidThrough}.`,
      { paidThrough },
    );
  }
}

/**
 * Too many attempts, too quickly. A 429 rather than a refusal, and it says the same thing to an
 * address on the roster and one nobody has heard of — the lockout must not become the disclosure
 * the sign-in form refuses to be.
 */
export class TooManyAttemptsError extends HttpError {
  constructor(message: string) {
    super(429, 'too_many_attempts', message);
  }
}

/**
 * The person is on the roster and the letter did not get out.
 *
 * **A refusal that is also a half-success**, which is why it says both halves. The alternative
 * shapes are both worse: a 500 leaves an Administrator retrying an address that is now taken, and
 * a silent success leaves somebody on the roster waiting for an e-mail that was never sent.
 *
 * 502 rather than 500, because what failed is somebody else's service rather than this one.
 */
export class InvitationNotSentError extends HttpError {
  constructor(email: string) {
    super(
      502,
      'invitation_not_sent',
      `${email} is on the roster, but the invitation could not be sent. ` +
        'Use \u201cSend the invitation again\u201d once e-mail is working.',
    );
  }
}

/** The request contradicts something already recorded — a Tavola number used twice on a Model. */
export class ConflictError extends HttpError {
  constructor(message: string, details?: unknown) {
    super(409, 'conflict', message, details);
  }
}

/** The request carried something we cannot make sense of — a scan that is not an image. */
export class UnsupportedMediaTypeError extends HttpError {
  constructor(message: string) {
    super(415, 'unsupported_media_type', message);
  }
}

export const notFoundHandler: RequestHandler = (_request, _response, next) => {
  next(new NotFoundError());
};

export function createErrorHandler(logger: Logger): ErrorRequestHandler {
  return (error, _request, response, _next) => {
    if (error instanceof ZodError) {
      response.status(400).json(
        body('validation_failed', 'The request was not valid.', {
          issues: error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        }),
      );
      return;
    }

    if (error instanceof HttpError) {
      response.status(error.status).json(body(error.code, error.message, error.details));
      return;
    }

    // Body parsers refuse before a handler ever sees the request, and the two ways they refuse
    // are both the sender's fault rather than ours: an oversized upload and unreadable JSON.
    // Without this they arrive here indistinguishable from a bug and are answered with a 500.
    if (isBodyParserRefusal(error, 'entity.too.large')) {
      response
        .status(413)
        .json(body('payload_too_large', 'That was larger than this archive accepts.'));
      return;
    }
    if (isBodyParserRefusal(error, 'entity.parse.failed')) {
      response.status(400).json(body('validation_failed', 'That request body was not valid JSON.'));
      return;
    }

    logger.error({ err: error }, 'Unhandled error');
    response.status(500).json(body('internal_error', 'Something went wrong.'));
  };
}

function isBodyParserRefusal(error: unknown, type: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'type' in error &&
    (error as { type: unknown }).type === type
  );
}

function body(code: string, message: string, details?: unknown): ApiErrorBody {
  return { error: details === undefined ? { code, message } : { code, message, details } };
}
