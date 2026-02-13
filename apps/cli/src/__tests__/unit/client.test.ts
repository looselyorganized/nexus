import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { NexusApiError, NexusClient } from '../../client';

// ---------------------------------------------------------------------------
// Mock fetch globally
// ---------------------------------------------------------------------------

let fetchMock: ReturnType<typeof mock>;

function mockFetchResponse(status: number, body: unknown, ok?: boolean) {
  fetchMock = mock(() =>
    Promise.resolve({
      ok: ok ?? (status >= 200 && status < 300),
      status,
      json: () => Promise.resolve(body),
    })
  );
  globalThis.fetch = fetchMock as any;
}

function mockFetchJsonError(status: number, body: unknown) {
  mockFetchResponse(status, body, false);
}

// ---------------------------------------------------------------------------
// NexusApiError
// ---------------------------------------------------------------------------

describe('NexusApiError', () => {
  it('stores the message', () => {
    const err = new NexusApiError('Not found', 404);
    expect(err.message).toBe('Not found');
  });

  it('stores the statusCode', () => {
    const err = new NexusApiError('Unauthorized', 401);
    expect(err.statusCode).toBe(401);
  });

  it('stores the optional errorCode', () => {
    const err = new NexusApiError('Bad request', 400, 'VALIDATION_ERROR');
    expect(err.errorCode).toBe('VALIDATION_ERROR');
  });

  it('stores the optional details', () => {
    const details = { field: 'email', issue: 'invalid' };
    const err = new NexusApiError('Validation', 400, undefined, details);
    expect(err.details).toEqual(details);
  });

  it('has name set to NexusApiError', () => {
    const err = new NexusApiError('err', 500);
    expect(err.name).toBe('NexusApiError');
  });

  it('is an instance of Error', () => {
    const err = new NexusApiError('err', 500);
    expect(err instanceof Error).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// NexusClient constructor
// ---------------------------------------------------------------------------

describe('NexusClient constructor', () => {
  it('strips trailing slash from serverUrl', () => {
    // We verify this indirectly by calling a method and checking the URL
    mockFetchResponse(200, { data: {} });
    const client = new NexusClient({ serverUrl: 'http://test:3000/', token: 'tok' });
    client.getMe();
    // fetch should be called with a URL that doesn't have double slashes
    const calledUrl = (fetchMock as any).mock.calls[0][0] as string;
    expect(calledUrl).toBe('http://test:3000/api/auth/me');
  });

  it('keeps serverUrl unchanged when there is no trailing slash', () => {
    mockFetchResponse(200, { data: {} });
    const client = new NexusClient({ serverUrl: 'http://test:3000', token: 'tok' });
    client.getMe();
    const calledUrl = (fetchMock as any).mock.calls[0][0] as string;
    expect(calledUrl).toBe('http://test:3000/api/auth/me');
  });
});

// ---------------------------------------------------------------------------
// Auth methods
// ---------------------------------------------------------------------------

describe('NexusClient.register', () => {
  beforeEach(() => {
    mockFetchResponse(200, { data: { engineer: { id: 'e1' }, apiKey: 'key123' } });
  });

  it('sends POST to /api/auth/register', async () => {
    const client = new NexusClient({ serverUrl: 'http://test:3000' });
    await client.register({ name: 'Alice', email: 'alice@example.com' });

    const [url, opts] = (fetchMock as any).mock.calls[0];
    expect(url).toBe('http://test:3000/api/auth/register');
    expect(opts.method).toBe('POST');
  });

  it('sends the correct body', async () => {
    const client = new NexusClient({ serverUrl: 'http://test:3000' });
    await client.register({ name: 'Alice', email: 'alice@example.com' });

    const [, opts] = (fetchMock as any).mock.calls[0];
    const body = JSON.parse(opts.body);
    expect(body).toEqual({ name: 'Alice', email: 'alice@example.com' });
  });

  it('does not send an Authorization header (unauthenticated)', async () => {
    const client = new NexusClient({ serverUrl: 'http://test:3000' });
    await client.register({ name: 'Alice', email: 'alice@example.com' });

    const [, opts] = (fetchMock as any).mock.calls[0];
    expect(opts.headers['Authorization']).toBeUndefined();
  });

  it('returns the data payload', async () => {
    const client = new NexusClient({ serverUrl: 'http://test:3000' });
    const result = await client.register({ name: 'Alice', email: 'alice@example.com' });
    expect(result).toEqual({ engineer: { id: 'e1' }, apiKey: 'key123' });
  });
});

describe('NexusClient.getMe', () => {
  beforeEach(() => {
    mockFetchResponse(200, { data: { id: 'eng-1', name: 'Alice' } });
  });

  it('sends GET to /api/auth/me', async () => {
    const client = new NexusClient({ serverUrl: 'http://test:3000', token: 'my-token' });
    await client.getMe();

    const [url, opts] = (fetchMock as any).mock.calls[0];
    expect(url).toBe('http://test:3000/api/auth/me');
    expect(opts.method).toBeUndefined(); // GET is the default
  });

  it('includes the Authorization header', async () => {
    const client = new NexusClient({ serverUrl: 'http://test:3000', token: 'my-token' });
    await client.getMe();

    const [, opts] = (fetchMock as any).mock.calls[0];
    expect(opts.headers['Authorization']).toBe('Bearer my-token');
  });

  it('throws NexusApiError when no token is set', async () => {
    const client = new NexusClient({ serverUrl: 'http://test:3000' });
    expect(client.getMe()).rejects.toThrow(NexusApiError);
  });
});

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

describe('NexusClient.createProject', () => {
  beforeEach(() => {
    mockFetchResponse(200, { data: { id: 'proj-1', name: 'My Project' } });
  });

  it('sends POST to /api/projects with correct body', async () => {
    const client = new NexusClient({ serverUrl: 'http://test:3000', token: 'tok' });
    await client.createProject({ name: 'My Project', slug: 'my-project' });

    const [url, opts] = (fetchMock as any).mock.calls[0];
    expect(url).toBe('http://test:3000/api/projects');
    expect(opts.method).toBe('POST');
    const body = JSON.parse(opts.body);
    expect(body.name).toBe('My Project');
    expect(body.slug).toBe('my-project');
  });
});

describe('NexusClient.listProjects', () => {
  beforeEach(() => {
    mockFetchResponse(200, { data: [{ id: 'p1' }, { id: 'p2' }] });
  });

  it('sends GET to /api/projects', async () => {
    const client = new NexusClient({ serverUrl: 'http://test:3000', token: 'tok' });
    await client.listProjects();

    const [url] = (fetchMock as any).mock.calls[0];
    expect(url).toBe('http://test:3000/api/projects');
  });
});

// ---------------------------------------------------------------------------
// Features (requires projectId for projectPath)
// ---------------------------------------------------------------------------

describe('NexusClient.listFeatures', () => {
  beforeEach(() => {
    mockFetchResponse(200, { data: [] });
  });

  it('sends GET to the project-scoped features endpoint', async () => {
    const client = new NexusClient({
      serverUrl: 'http://test:3000',
      token: 'tok',
      projectId: 'proj-123',
    });
    await client.listFeatures();

    const [url] = (fetchMock as any).mock.calls[0];
    expect(url).toBe('http://test:3000/api/projects/proj-123/features');
  });

  it('appends query params when provided', async () => {
    const client = new NexusClient({
      serverUrl: 'http://test:3000',
      token: 'tok',
      projectId: 'proj-123',
    });
    await client.listFeatures({ status: 'active', limit: 10 });

    const [url] = (fetchMock as any).mock.calls[0];
    expect(url).toContain('status=active');
    expect(url).toContain('limit=10');
  });

  it('omits undefined query params', async () => {
    const client = new NexusClient({
      serverUrl: 'http://test:3000',
      token: 'tok',
      projectId: 'proj-123',
    });
    await client.listFeatures({ status: 'draft', lane: undefined });

    const [url] = (fetchMock as any).mock.calls[0];
    expect(url).toContain('status=draft');
    expect(url).not.toContain('lane');
  });

  it('throws NexusApiError when no projectId is set', () => {
    const client = new NexusClient({ serverUrl: 'http://test:3000', token: 'tok' });
    expect(client.listFeatures()).rejects.toThrow(NexusApiError);
  });
});

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

describe('NexusClient error handling', () => {
  it('throws NexusApiError with statusCode on non-ok response', async () => {
    mockFetchJsonError(401, { message: 'Unauthorized' });
    const client = new NexusClient({ serverUrl: 'http://test:3000', token: 'tok' });

    try {
      await client.getMe();
      expect(true).toBe(false); // Should not reach here
    } catch (err) {
      expect(err).toBeInstanceOf(NexusApiError);
      expect((err as NexusApiError).statusCode).toBe(401);
    }
  });

  it('extracts message from error body', async () => {
    mockFetchJsonError(400, { message: 'Validation failed' });
    const client = new NexusClient({ serverUrl: 'http://test:3000', token: 'tok' });

    try {
      await client.getMe();
      expect(true).toBe(false);
    } catch (err) {
      expect((err as NexusApiError).message).toBe('Validation failed');
    }
  });

  it('extracts error.message when error object is nested', async () => {
    mockFetchJsonError(422, {
      error: { message: 'Invalid input', code: 'INVALID', details: { field: 'slug' } },
    });
    const client = new NexusClient({ serverUrl: 'http://test:3000', token: 'tok' });

    try {
      await client.getMe();
      expect(true).toBe(false);
    } catch (err) {
      const apiErr = err as NexusApiError;
      expect(apiErr.message).toBe('Invalid input');
      expect(apiErr.errorCode).toBe('INVALID');
      expect(apiErr.details).toEqual({ field: 'slug' });
    }
  });

  it('uses fallback message when response body is not JSON', async () => {
    fetchMock = mock(() =>
      Promise.resolve({
        ok: false,
        status: 500,
        json: () => Promise.reject(new Error('not json')),
      })
    );
    globalThis.fetch = fetchMock as any;

    const client = new NexusClient({ serverUrl: 'http://test:3000', token: 'tok' });

    try {
      await client.getMe();
      expect(true).toBe(false);
    } catch (err) {
      const apiErr = err as NexusApiError;
      expect(apiErr.statusCode).toBe(500);
      expect(apiErr.message).toContain('500');
    }
  });

  it('throws NexusApiError with 401 when requireAuth and no token', async () => {
    const client = new NexusClient({ serverUrl: 'http://test:3000' });

    try {
      await client.getMe();
      expect(true).toBe(false);
    } catch (err) {
      const apiErr = err as NexusApiError;
      expect(apiErr.statusCode).toBe(401);
      expect(apiErr.message).toContain('Not authenticated');
    }
  });
});

// ---------------------------------------------------------------------------
// buildQuery (tested indirectly through listFeatures)
// ---------------------------------------------------------------------------

describe('buildQuery (indirect via listFeatures)', () => {
  beforeEach(() => {
    mockFetchResponse(200, { data: [] });
  });

  it('produces empty query string when no params given', async () => {
    const client = new NexusClient({
      serverUrl: 'http://test:3000',
      token: 'tok',
      projectId: 'proj-123',
    });
    await client.listFeatures();

    const [url] = (fetchMock as any).mock.calls[0];
    // Should end with /features and have no ?
    expect(url).toBe('http://test:3000/api/projects/proj-123/features');
  });

  it('produces empty query string when all param values are undefined', async () => {
    const client = new NexusClient({
      serverUrl: 'http://test:3000',
      token: 'tok',
      projectId: 'proj-123',
    });
    await client.listFeatures({ status: undefined, lane: undefined });

    const [url] = (fetchMock as any).mock.calls[0];
    expect(url).not.toContain('?');
  });

  it('encodes query param values', async () => {
    const client = new NexusClient({
      serverUrl: 'http://test:3000',
      token: 'tok',
      projectId: 'proj-123',
    });
    await client.listFeatures({ status: 'in progress' });

    const [url] = (fetchMock as any).mock.calls[0];
    expect(url).toContain('status=in%20progress');
  });
});
