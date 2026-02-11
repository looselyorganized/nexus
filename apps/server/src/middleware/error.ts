import type { Context } from 'hono';
import { AppError } from '../lib/errors';
import { ErrorCodes, type ApiError } from '@nexus/shared';
import { ZodError } from 'zod';
import { logger } from '../lib/logger';

function formatError(code: string, message: string, details?: unknown, requestId?: string): ApiError {
  return {
    error: {
      code,
      message,
      ...(details !== undefined && { details }),
      ...(requestId && { requestId }),
    },
  };
}

export function errorHandler(err: Error, c: Context) {
  const requestId = c.get('requestId');

  if (err instanceof AppError) {
    return c.json(formatError(err.code, err.message, err.details, requestId), err.statusCode as 400);
  }

  if (err instanceof ZodError) {
    const details = err.flatten();
    return c.json(formatError(ErrorCodes.VALIDATION_ERROR, 'Validation failed', details, requestId), 400);
  }

  logger.error({ err, requestId }, 'Unexpected error');

  return c.json(
    formatError(ErrorCodes.INTERNAL_ERROR, 'Internal server error', undefined, requestId),
    500
  );
}

export function notFoundHandler(c: Context) {
  const requestId = c.get('requestId');
  return c.json(formatError(ErrorCodes.NOT_FOUND, `Route ${c.req.path} not found`, undefined, requestId), 404);
}
