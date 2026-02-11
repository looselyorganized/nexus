import { describe, it, expect } from 'bun:test';
import {
  parseClientMessage,
  serializeServerEvent,
  createErrorEvent,
  createConnectedEvent,
  createJoinedEvent,
  createLeftEvent,
} from '../../../ws/messages';
import type { ServerEvent } from '@nexus/shared';

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';

describe('parseClientMessage', () => {
  describe('valid messages', () => {
    it('parses a valid join message with UUID projectId', () => {
      const result = parseClientMessage(JSON.stringify({ type: 'join', projectId: VALID_UUID }));
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('join');
        expect((result.data as { type: 'join'; projectId: string }).projectId).toBe(VALID_UUID);
      }
    });

    it('parses a valid heartbeat message', () => {
      const result = parseClientMessage(JSON.stringify({ type: 'heartbeat' }));
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('heartbeat');
      }
    });

    it('parses a valid leave message', () => {
      const result = parseClientMessage(JSON.stringify({ type: 'leave' }));
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('leave');
      }
    });
  });

  describe('invalid JSON', () => {
    it('returns error for invalid JSON', () => {
      const result = parseClientMessage('not json');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('Invalid JSON');
      }
    });

    it('returns error for empty string', () => {
      const result = parseClientMessage('');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('Invalid JSON');
      }
    });
  });

  describe('schema validation failures', () => {
    it('returns error when type field is missing', () => {
      const result = parseClientMessage(JSON.stringify({ projectId: VALID_UUID }));
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeTruthy();
      }
    });

    it('returns error for unknown type', () => {
      const result = parseClientMessage(JSON.stringify({ type: 'unknown' }));
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeTruthy();
      }
    });

    it('returns error when join has non-UUID projectId', () => {
      const result = parseClientMessage(JSON.stringify({ type: 'join', projectId: 'not-a-uuid' }));
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeTruthy();
      }
    });

    it('returns error when join is missing projectId', () => {
      const result = parseClientMessage(JSON.stringify({ type: 'join' }));
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeTruthy();
      }
    });
  });
});

describe('serializeServerEvent', () => {
  it('serializes a server event to a JSON string', () => {
    const event: ServerEvent = { type: 'connected', connectionId: 'abc-123' };
    const serialized = serializeServerEvent(event);
    expect(typeof serialized).toBe('string');
    const parsed = JSON.parse(serialized);
    expect(parsed).toEqual(event);
  });

  it('preserves all fields in a roundtrip', () => {
    const event: ServerEvent = { type: 'error', code: 'INVALID', message: 'Something broke' };
    const roundtripped = JSON.parse(serializeServerEvent(event));
    expect(roundtripped.type).toBe('error');
    expect(roundtripped.code).toBe('INVALID');
    expect(roundtripped.message).toBe('Something broke');
  });

  it('handles events with nested data', () => {
    const event: ServerEvent = { type: 'feature_created', data: { id: '1', tags: ['a', 'b'] } };
    const roundtripped = JSON.parse(serializeServerEvent(event));
    expect(roundtripped).toEqual(event);
  });
});

describe('createErrorEvent', () => {
  it('returns an event with type error', () => {
    const event = createErrorEvent('INVALID_MSG', 'bad message');
    expect(event.type).toBe('error');
  });

  it('sets the correct code', () => {
    const event = createErrorEvent('UNAUTHORIZED', 'not allowed');
    expect(event.code).toBe('UNAUTHORIZED');
  });

  it('sets the correct message', () => {
    const event = createErrorEvent('RATE_LIMITED', 'slow down');
    expect(event.message).toBe('slow down');
  });

  it('returns an object matching the expected shape', () => {
    const event = createErrorEvent('TEST_CODE', 'test message');
    expect(event).toEqual({ type: 'error', code: 'TEST_CODE', message: 'test message' });
  });
});

describe('createConnectedEvent', () => {
  it('returns an event with type connected', () => {
    const event = createConnectedEvent('conn-42');
    expect(event.type).toBe('connected');
  });

  it('sets the correct connectionId', () => {
    const event = createConnectedEvent('conn-42');
    expect(event.connectionId).toBe('conn-42');
  });

  it('returns an object matching the expected shape', () => {
    const event = createConnectedEvent('xyz');
    expect(event).toEqual({ type: 'connected', connectionId: 'xyz' });
  });
});

describe('createJoinedEvent', () => {
  it('returns an event with type joined', () => {
    const event = createJoinedEvent('session-1', 'project-1');
    expect(event.type).toBe('joined');
  });

  it('sets the correct sessionId', () => {
    const event = createJoinedEvent('session-abc', 'project-xyz');
    expect(event.sessionId).toBe('session-abc');
  });

  it('sets the correct projectId', () => {
    const event = createJoinedEvent('session-abc', 'project-xyz');
    expect(event.projectId).toBe('project-xyz');
  });

  it('returns an object matching the expected shape', () => {
    const event = createJoinedEvent('s1', 'p1');
    expect(event).toEqual({ type: 'joined', sessionId: 's1', projectId: 'p1' });
  });
});

describe('createLeftEvent', () => {
  it('returns an event with type left', () => {
    const event = createLeftEvent('project-1');
    expect(event.type).toBe('left');
  });

  it('sets the correct projectId', () => {
    const event = createLeftEvent('project-42');
    expect(event.projectId).toBe('project-42');
  });

  it('returns an object matching the expected shape', () => {
    const event = createLeftEvent('proj');
    expect(event).toEqual({ type: 'left', projectId: 'proj' });
  });
});
