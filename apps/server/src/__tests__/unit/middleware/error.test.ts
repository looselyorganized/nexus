import { describe, it, expect } from 'bun:test';
import { Hono } from 'hono';
import { z } from 'zod';
import { errorHandler, notFoundHandler } from '../../../middleware/error';
import {
  AppError,
  ValidationError,
  UnauthorizedError,
  NotFoundError,
  ForbiddenError,
  ConflictError,
  RateLimitError,
} from '../../../lib/errors';
import { ErrorCodes } from '@nexus/shared';

// ---------------------------------------------------------------------------
// Build a minimal Hono app that exercises the error handler
// ---------------------------------------------------------------------------

const testApp = new Hono();

testApp.get('/throw-app-error', () => {
  throw new AppError(ErrorCodes.INTERNAL_ERROR, 'generic app error', 503);
});

testApp.get('/throw-validation-error', () => {
  throw new ValidationError('bad input', { field: 'name' });
});

testApp.get('/throw-unauthorized-error', () => {
  throw new UnauthorizedError();
});

testApp.get('/throw-not-found-error', () => {
  throw new NotFoundError('Widget', '42');
});

testApp.get('/throw-forbidden-error', () => {
  throw new ForbiddenError();
});

testApp.get('/throw-conflict-error', () => {
  throw new ConflictError('already exists', ErrorCodes.ALREADY_EXISTS, { id: '1' });
});

testApp.get('/throw-rate-limit-error', () => {
  throw new RateLimitError();
});

testApp.get('/throw-zod-error', (c) => {
  z.object({ name: z.string() }).parse({});
  return c.json({});
});

testApp.get('/throw-generic-error', () => {
  throw new Error('boom');
});

testApp.onError(errorHandler);
testApp.notFound(notFoundHandler);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('errorHandler', () => {
  it('returns the correct status code and error code for a plain AppError', async () => {
    const res = await testApp.request('/throw-app-error');
    expect(res.status).toBe(503);

    const body: any = await res.json();
    expect(body.error.code).toBe(ErrorCodes.INTERNAL_ERROR);
    expect(body.error.message).toBe('generic app error');
  });

  it('returns 400 with VALIDATION_ERROR and details for a ValidationError', async () => {
    const res = await testApp.request('/throw-validation-error');
    expect(res.status).toBe(400);

    const body: any = await res.json();
    expect(body.error.code).toBe(ErrorCodes.VALIDATION_ERROR);
    expect(body.error.message).toBe('bad input');
    expect(body.error.details).toEqual({ field: 'name' });
  });

  it('returns 401 with UNAUTHORIZED for an UnauthorizedError', async () => {
    const res = await testApp.request('/throw-unauthorized-error');
    expect(res.status).toBe(401);

    const body: any = await res.json();
    expect(body.error.code).toBe(ErrorCodes.UNAUTHORIZED);
    expect(body.error.message).toBe('Unauthorized');
  });

  it('returns 404 with NOT_FOUND for a NotFoundError', async () => {
    const res = await testApp.request('/throw-not-found-error');
    expect(res.status).toBe(404);

    const body: any = await res.json();
    expect(body.error.code).toBe(ErrorCodes.NOT_FOUND);
    expect(body.error.message).toBe("Widget with id '42' not found");
  });

  it('returns 403 with FORBIDDEN for a ForbiddenError', async () => {
    const res = await testApp.request('/throw-forbidden-error');
    expect(res.status).toBe(403);

    const body: any = await res.json();
    expect(body.error.code).toBe(ErrorCodes.FORBIDDEN);
  });

  it('returns 409 with ALREADY_EXISTS and details for a ConflictError', async () => {
    const res = await testApp.request('/throw-conflict-error');
    expect(res.status).toBe(409);

    const body: any = await res.json();
    expect(body.error.code).toBe(ErrorCodes.ALREADY_EXISTS);
    expect(body.error.details).toEqual({ id: '1' });
  });

  it('returns 429 with RATE_LIMITED for a RateLimitError', async () => {
    const res = await testApp.request('/throw-rate-limit-error');
    expect(res.status).toBe(429);

    const body: any = await res.json();
    expect(body.error.code).toBe(ErrorCodes.RATE_LIMITED);
  });

  it('returns 400 with VALIDATION_ERROR and flattened details for a ZodError', async () => {
    const res = await testApp.request('/throw-zod-error');
    expect(res.status).toBe(400);

    const body: any = await res.json();
    expect(body.error.code).toBe(ErrorCodes.VALIDATION_ERROR);
    expect(body.error.message).toBe('Validation failed');
    // ZodError.flatten() produces { formErrors, fieldErrors }
    expect(body.error.details).toHaveProperty('fieldErrors');
    expect(body.error.details.fieldErrors).toHaveProperty('name');
  });

  it('returns 500 with INTERNAL_ERROR for an unrecognized Error', async () => {
    const res = await testApp.request('/throw-generic-error');
    expect(res.status).toBe(500);

    const body: any = await res.json();
    expect(body.error.code).toBe(ErrorCodes.INTERNAL_ERROR);
    expect(body.error.message).toBe('Internal server error');
  });

  it('does not leak a stack trace for generic errors', async () => {
    const res = await testApp.request('/throw-generic-error');
    const body: any = await res.json();

    expect(body.error.details).toBeUndefined();
    expect(body.error).not.toHaveProperty('stack');
  });

  it('omits the details field when there are no details', async () => {
    const res = await testApp.request('/throw-unauthorized-error');
    const body: any = await res.json();

    expect(body.error).not.toHaveProperty('details');
  });
});

describe('notFoundHandler', () => {
  it('returns 404 with the path in the error message', async () => {
    const res = await testApp.request('/this-route-does-not-exist');
    expect(res.status).toBe(404);

    const body: any = await res.json();
    expect(body.error.code).toBe(ErrorCodes.NOT_FOUND);
    expect(body.error.message).toContain('/this-route-does-not-exist');
  });
});
