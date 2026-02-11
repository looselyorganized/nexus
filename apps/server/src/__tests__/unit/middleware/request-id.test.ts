import { describe, it, expect } from 'bun:test';
import { Hono } from 'hono';
import { requestIdMiddleware, REQUEST_ID_HEADER } from '../../../middleware/request-id';

// ---------------------------------------------------------------------------
// Build a minimal Hono app with the request-id middleware
// ---------------------------------------------------------------------------

const testApp = new Hono();
testApp.use('*', requestIdMiddleware);
testApp.get('/test', (c) => c.json({ requestId: c.get('requestId') }));

// UUID v4 pattern (8-4-4-4-12 hex digits)
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('requestIdMiddleware', () => {
  describe('when no X-Request-ID header is provided', () => {
    it('generates a request ID and sets it on the context', async () => {
      const res = await testApp.request('/test');
      const body: any = await res.json();

      expect(body.requestId).toBeDefined();
      expect(typeof body.requestId).toBe('string');
      expect(body.requestId.length).toBeGreaterThan(0);
    });

    it('includes the X-Request-ID header in the response', async () => {
      const res = await testApp.request('/test');
      const header = res.headers.get(REQUEST_ID_HEADER);

      expect(header).not.toBeNull();
    });

    it('generates a value that matches the UUID v4 format', async () => {
      const res = await testApp.request('/test');
      const header = res.headers.get(REQUEST_ID_HEADER);

      expect(header).toMatch(UUID_RE);
    });

    it('returns a body requestId that matches the response header', async () => {
      const res = await testApp.request('/test');
      const header = res.headers.get(REQUEST_ID_HEADER);
      const body: any = await res.json();

      expect(body.requestId).toBe(header);
    });
  });

  describe('when an X-Request-ID header is provided', () => {
    const customId = 'custom-request-id-abc-123';

    it('uses the caller-supplied request ID', async () => {
      const res = await testApp.request('/test', {
        headers: { [REQUEST_ID_HEADER]: customId },
      });
      const body: any = await res.json();

      expect(body.requestId).toBe(customId);
    });

    it('echoes the caller-supplied request ID in the response header', async () => {
      const res = await testApp.request('/test', {
        headers: { [REQUEST_ID_HEADER]: customId },
      });
      const header = res.headers.get(REQUEST_ID_HEADER);

      expect(header).toBe(customId);
    });

    it('body requestId matches the provided header value', async () => {
      const res = await testApp.request('/test', {
        headers: { [REQUEST_ID_HEADER]: customId },
      });
      const header = res.headers.get(REQUEST_ID_HEADER);
      const body: any = await res.json();

      expect(body.requestId).toBe(header);
    });
  });

  it('generates unique IDs across multiple requests', async () => {
    const res1 = await testApp.request('/test');
    const res2 = await testApp.request('/test');

    const id1 = res1.headers.get(REQUEST_ID_HEADER);
    const id2 = res2.headers.get(REQUEST_ID_HEADER);

    expect(id1).not.toBe(id2);
  });
});
