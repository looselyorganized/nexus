import { describe, it, expect } from 'bun:test';
import {
  AppError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  RateLimitError,
} from '../../../lib/errors';

describe('AppError', () => {
  it('sets the error code', () => {
    const err = new AppError('SOME_CODE' as any, 'boom');
    expect(err.code).toBe('SOME_CODE' as any);
  });

  it('sets the message', () => {
    const err = new AppError('SOME_CODE' as any, 'something went wrong');
    expect(err.message).toBe('something went wrong');
  });

  it('defaults statusCode to 500', () => {
    const err = new AppError('SOME_CODE' as any, 'boom');
    expect(err.statusCode).toBe(500);
  });

  it('accepts a custom statusCode', () => {
    const err = new AppError('SOME_CODE' as any, 'boom', 418);
    expect(err.statusCode).toBe(418);
  });

  it('stores optional details', () => {
    const details = { field: 'email', issue: 'invalid' };
    const err = new AppError('SOME_CODE' as any, 'boom', 400, details);
    expect(err.details).toEqual(details);
  });

  it('has name set to AppError', () => {
    const err = new AppError('SOME_CODE' as any, 'boom');
    expect(err.name).toBe('AppError');
  });

  it('is an instance of Error', () => {
    const err = new AppError('SOME_CODE' as any, 'boom');
    expect(err).toBeInstanceOf(Error);
  });
});

describe('ValidationError', () => {
  it('has statusCode 400', () => {
    const err = new ValidationError('bad input');
    expect(err.statusCode).toBe(400);
  });

  it('has code VALIDATION_ERROR', () => {
    const err = new ValidationError('bad input');
    expect(err.code).toBe('VALIDATION_ERROR');
  });

  it('has name ValidationError', () => {
    const err = new ValidationError('bad input');
    expect(err.name).toBe('ValidationError');
  });

  it('passes through details', () => {
    const details = [{ field: 'name', message: 'required' }];
    const err = new ValidationError('bad input', details);
    expect(err.details).toEqual(details);
  });

  it('is an instance of AppError', () => {
    const err = new ValidationError('bad input');
    expect(err).toBeInstanceOf(AppError);
  });

  it('is an instance of Error', () => {
    const err = new ValidationError('bad input');
    expect(err).toBeInstanceOf(Error);
  });
});

describe('UnauthorizedError', () => {
  it('has statusCode 401', () => {
    const err = new UnauthorizedError();
    expect(err.statusCode).toBe(401);
  });

  it('has default message Unauthorized', () => {
    const err = new UnauthorizedError();
    expect(err.message).toBe('Unauthorized');
  });

  it('has code UNAUTHORIZED by default', () => {
    const err = new UnauthorizedError();
    expect(err.code).toBe('UNAUTHORIZED');
  });

  it('accepts a custom message', () => {
    const err = new UnauthorizedError('token expired');
    expect(err.message).toBe('token expired');
  });

  it('accepts a custom code', () => {
    const err = new UnauthorizedError('bad token', 'INVALID_TOKEN' as any);
    expect(err.code).toBe('INVALID_TOKEN' as any);
  });

  it('has name UnauthorizedError', () => {
    const err = new UnauthorizedError();
    expect(err.name).toBe('UnauthorizedError');
  });

  it('is an instance of AppError', () => {
    const err = new UnauthorizedError();
    expect(err).toBeInstanceOf(AppError);
  });
});

describe('ForbiddenError', () => {
  it('has statusCode 403', () => {
    const err = new ForbiddenError();
    expect(err.statusCode).toBe(403);
  });

  it('has default message Forbidden', () => {
    const err = new ForbiddenError();
    expect(err.message).toBe('Forbidden');
  });

  it('has code FORBIDDEN by default', () => {
    const err = new ForbiddenError();
    expect(err.code).toBe('FORBIDDEN');
  });

  it('accepts a custom message', () => {
    const err = new ForbiddenError('not allowed');
    expect(err.message).toBe('not allowed');
  });

  it('accepts a custom code', () => {
    const err = new ForbiddenError('nope', 'INSUFFICIENT_PERMISSIONS' as any);
    expect(err.code).toBe('INSUFFICIENT_PERMISSIONS' as any);
  });

  it('has name ForbiddenError', () => {
    const err = new ForbiddenError();
    expect(err.name).toBe('ForbiddenError');
  });

  it('is an instance of AppError', () => {
    const err = new ForbiddenError();
    expect(err).toBeInstanceOf(AppError);
  });
});

describe('NotFoundError', () => {
  it('has statusCode 404', () => {
    const err = new NotFoundError('User');
    expect(err.statusCode).toBe(404);
  });

  it('has code NOT_FOUND', () => {
    const err = new NotFoundError('User');
    expect(err.code).toBe('NOT_FOUND');
  });

  it('builds message with resource and id', () => {
    const err = new NotFoundError('User', 'abc-123');
    expect(err.message).toBe("User with id 'abc-123' not found");
  });

  it('builds message with resource only when no id', () => {
    const err = new NotFoundError('Project');
    expect(err.message).toBe('Project not found');
  });

  it('has name NotFoundError', () => {
    const err = new NotFoundError('User');
    expect(err.name).toBe('NotFoundError');
  });

  it('is an instance of AppError', () => {
    const err = new NotFoundError('User');
    expect(err).toBeInstanceOf(AppError);
  });
});

describe('ConflictError', () => {
  it('has statusCode 409', () => {
    const err = new ConflictError('already exists');
    expect(err.statusCode).toBe(409);
  });

  it('has code ALREADY_EXISTS by default', () => {
    const err = new ConflictError('duplicate');
    expect(err.code).toBe('ALREADY_EXISTS');
  });

  it('accepts a custom code', () => {
    const err = new ConflictError('conflict', 'DUPLICATE_ENTRY' as any);
    expect(err.code).toBe('DUPLICATE_ENTRY' as any);
  });

  it('stores details', () => {
    const details = { field: 'email' };
    const err = new ConflictError('duplicate email', undefined, details);
    expect(err.details).toEqual(details);
  });

  it('has name ConflictError', () => {
    const err = new ConflictError('conflict');
    expect(err.name).toBe('ConflictError');
  });

  it('is an instance of AppError', () => {
    const err = new ConflictError('conflict');
    expect(err).toBeInstanceOf(AppError);
  });
});

describe('RateLimitError', () => {
  it('has statusCode 429', () => {
    const err = new RateLimitError();
    expect(err.statusCode).toBe(429);
  });

  it('has code RATE_LIMITED', () => {
    const err = new RateLimitError();
    expect(err.code).toBe('RATE_LIMITED');
  });

  it('has default message', () => {
    const err = new RateLimitError();
    expect(err.message).toBe('Rate limit exceeded');
  });

  it('accepts a custom message', () => {
    const err = new RateLimitError('slow down');
    expect(err.message).toBe('slow down');
  });

  it('has name RateLimitError', () => {
    const err = new RateLimitError();
    expect(err.name).toBe('RateLimitError');
  });

  it('is an instance of AppError', () => {
    const err = new RateLimitError();
    expect(err).toBeInstanceOf(AppError);
  });

  it('is an instance of Error', () => {
    const err = new RateLimitError();
    expect(err).toBeInstanceOf(Error);
  });
});
