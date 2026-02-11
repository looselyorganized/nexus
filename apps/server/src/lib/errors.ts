import { ErrorCodes, type ErrorCode } from '@nexus/shared';

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly statusCode: number = 500,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(ErrorCodes.VALIDATION_ERROR, message, 400, details);
    this.name = 'ValidationError';
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized', code: ErrorCode = ErrorCodes.UNAUTHORIZED) {
    super(code, message, 401);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Forbidden', code: ErrorCode = ErrorCodes.FORBIDDEN) {
    super(code, message, 403);
    this.name = 'ForbiddenError';
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    const message = id ? `${resource} with id '${id}' not found` : `${resource} not found`;
    super(ErrorCodes.NOT_FOUND, message, 404);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends AppError {
  constructor(message: string, code: ErrorCode = ErrorCodes.ALREADY_EXISTS, details?: unknown) {
    super(code, message, 409, details);
    this.name = 'ConflictError';
  }
}

export class RateLimitError extends AppError {
  constructor(message: string = 'Rate limit exceeded') {
    super(ErrorCodes.RATE_LIMITED, message, 429);
    this.name = 'RateLimitError';
  }
}
