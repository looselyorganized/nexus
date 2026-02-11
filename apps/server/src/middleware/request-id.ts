import { createMiddleware } from 'hono/factory';
import { randomUUID } from 'crypto';

export const REQUEST_ID_HEADER = 'X-Request-ID';

declare module 'hono' {
  interface ContextVariableMap {
    requestId: string;
  }
}

export const requestIdMiddleware = createMiddleware(async (c, next) => {
  const requestId = c.req.header(REQUEST_ID_HEADER) || randomUUID();
  c.set('requestId', requestId);
  c.header(REQUEST_ID_HEADER, requestId);
  await next();
});
