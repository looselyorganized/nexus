import { describe, it, expect, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import { NexusApiError } from '../../client';
import { withErrorHandling } from '../../helpers';

// ---------------------------------------------------------------------------
// We need to mock process.exit so it doesn't actually terminate the test runner.
// We throw a sentinel error so we can detect that process.exit was called.
// ---------------------------------------------------------------------------

class ProcessExitError extends Error {
  code: number;
  constructor(code: number) {
    super(`process.exit(${code})`);
    this.name = 'ProcessExitError';
    this.code = code;
  }
}

let exitSpy: ReturnType<typeof spyOn>;
let errorSpy: ReturnType<typeof spyOn>;

beforeEach(() => {
  exitSpy = spyOn(process, 'exit').mockImplementation((code?: number | string | null | undefined) => {
    throw new ProcessExitError(typeof code === 'number' ? code : 1);
  });
  errorSpy = spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  exitSpy.mockRestore();
  errorSpy.mockRestore();
});

// ---------------------------------------------------------------------------
// withErrorHandling — successful action
// ---------------------------------------------------------------------------

describe('withErrorHandling', () => {
  it('calls the wrapped action with the provided arguments', async () => {
    const actionMock = mock(async (a: string, b: number) => {});
    const wrapped = withErrorHandling('fallback', actionMock);

    await wrapped('hello', 42);

    expect(actionMock).toHaveBeenCalledTimes(1);
    expect(actionMock).toHaveBeenCalledWith('hello', 42);
  });

  it('does not call process.exit when the action succeeds', async () => {
    const wrapped = withErrorHandling('fallback', async () => {});

    await wrapped();

    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('does not log to console.error when the action succeeds', async () => {
    const wrapped = withErrorHandling('fallback', async () => {});

    await wrapped();

    expect(errorSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// withErrorHandling — NexusApiError
// ---------------------------------------------------------------------------

describe('withErrorHandling with NexusApiError', () => {
  it('logs error message with status code', async () => {
    const wrapped = withErrorHandling('fallback', async () => {
      throw new NexusApiError('Unauthorized', 401);
    });

    try {
      await wrapped();
    } catch (e) {
      // process.exit throws our sentinel
    }

    expect(errorSpy).toHaveBeenCalledWith('Error: Unauthorized (401)');
  });

  it('logs details when NexusApiError has details', async () => {
    const details = { field: 'email', issue: 'required' };
    const wrapped = withErrorHandling('fallback', async () => {
      throw new NexusApiError('Validation error', 400, 'VALIDATION', details);
    });

    try {
      await wrapped();
    } catch (e) {
      // process.exit throws our sentinel
    }

    expect(errorSpy).toHaveBeenCalledWith('Error: Validation error (400)');
    expect(errorSpy).toHaveBeenCalledWith('Details:', JSON.stringify(details, null, 2));
  });

  it('calls process.exit(1) on NexusApiError', async () => {
    const wrapped = withErrorHandling('fallback', async () => {
      throw new NexusApiError('Server error', 500);
    });

    try {
      await wrapped();
    } catch (e) {
      expect(e).toBeInstanceOf(ProcessExitError);
      expect((e as ProcessExitError).code).toBe(1);
    }

    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('does not log details when NexusApiError has no details', async () => {
    const wrapped = withErrorHandling('fallback', async () => {
      throw new NexusApiError('Not found', 404);
    });

    try {
      await wrapped();
    } catch (e) {
      // sentinel
    }

    // console.error should have been called once with the error message only
    const detailsCalls = (errorSpy as any).mock.calls.filter(
      (call: any[]) => call[0] === 'Details:'
    );
    expect(detailsCalls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// withErrorHandling — generic Error
// ---------------------------------------------------------------------------

describe('withErrorHandling with generic Error', () => {
  it('logs fallback message with error message', async () => {
    const wrapped = withErrorHandling('Something failed', async () => {
      throw new Error('connection refused');
    });

    try {
      await wrapped();
    } catch (e) {
      // sentinel
    }

    expect(errorSpy).toHaveBeenCalledWith('Something failed: connection refused');
  });

  it('calls process.exit(1)', async () => {
    const wrapped = withErrorHandling('failed', async () => {
      throw new Error('oops');
    });

    try {
      await wrapped();
    } catch (e) {
      expect(e).toBeInstanceOf(ProcessExitError);
    }

    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});

// ---------------------------------------------------------------------------
// withErrorHandling — non-Error thrown value
// ---------------------------------------------------------------------------

describe('withErrorHandling with non-Error thrown value', () => {
  it('logs only the fallback message when a string is thrown', async () => {
    const wrapped = withErrorHandling('Operation failed', async () => {
      throw 'some string';
    });

    try {
      await wrapped();
    } catch (e) {
      // sentinel
    }

    expect(errorSpy).toHaveBeenCalledWith('Operation failed');
  });

  it('logs only the fallback message when null is thrown', async () => {
    const wrapped = withErrorHandling('Crash', async () => {
      throw null;
    });

    try {
      await wrapped();
    } catch (e) {
      // sentinel
    }

    expect(errorSpy).toHaveBeenCalledWith('Crash');
  });

  it('calls process.exit(1)', async () => {
    const wrapped = withErrorHandling('fail', async () => {
      throw 42;
    });

    try {
      await wrapped();
    } catch (e) {
      expect(e).toBeInstanceOf(ProcessExitError);
    }

    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});

// ---------------------------------------------------------------------------
// NexusApiError (standalone property checks, complementing client.test.ts)
// ---------------------------------------------------------------------------

describe('NexusApiError properties', () => {
  it('has correct name, message, statusCode, errorCode, details', () => {
    const err = new NexusApiError('Bad request', 400, 'BAD_REQ', { x: 1 });
    expect(err.name).toBe('NexusApiError');
    expect(err.message).toBe('Bad request');
    expect(err.statusCode).toBe(400);
    expect(err.errorCode).toBe('BAD_REQ');
    expect(err.details).toEqual({ x: 1 });
  });

  it('defaults errorCode and details to undefined', () => {
    const err = new NexusApiError('fail', 500);
    expect(err.errorCode).toBeUndefined();
    expect(err.details).toBeUndefined();
  });
});
