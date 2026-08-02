import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import type { Logger } from '../platform/logger.js';

/**
 * One error shape for the whole API, so the browser never has to guess and a member never sees
 * an HTML stack trace where JSON was expected.
 */
export interface ErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

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

    logger.error({ err: error }, 'Unhandled error');
    response.status(500).json(body('internal_error', 'Something went wrong.'));
  };
}

function body(code: string, message: string, details?: unknown): ErrorBody {
  return { error: details === undefined ? { code, message } : { code, message, details } };
}
