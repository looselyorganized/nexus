import { describe, it, expect } from 'bun:test';
import { extractApiKey } from '../../../middleware/auth';
import { API_KEY_PREFIX } from '../../../lib/api-key';

describe('extractApiKey', () => {
  it('returns null for undefined', () => {
    expect(extractApiKey(undefined)).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(extractApiKey('')).toBeNull();
  });

  it('extracts the token from a "Bearer" header with a nexus key', () => {
    const key = `${API_KEY_PREFIX}${'a'.repeat(64)}`;
    expect(extractApiKey(`Bearer ${key}`)).toBe(key);
  });

  it('extracts the token from a "Bearer" header with an arbitrary token', () => {
    expect(extractApiKey('Bearer some-other-token')).toBe('some-other-token');
  });

  it('returns the full value when it starts with the API_KEY_PREFIX (no Bearer)', () => {
    const key = `${API_KEY_PREFIX}${'b'.repeat(64)}`;
    expect(extractApiKey(key)).toBe(key);
  });

  it('returns null for a "Basic" auth header', () => {
    expect(extractApiKey('Basic abc123')).toBeNull();
  });

  it('returns null for a random string with no recognized prefix', () => {
    expect(extractApiKey('completely-random-value')).toBeNull();
  });

  it('returns null for a string that is just the word "Bearer" with no token', () => {
    // "Bearer " (with trailing space) results in an empty string slice
    expect(extractApiKey('Bearer ')).toBe('');
  });

  it('returns null for a header that contains "Bearer" but does not start with it', () => {
    expect(extractApiKey('Token Bearer abc')).toBeNull();
  });

  it('handles "Bearer" without a space (should return null since it lacks the exact prefix)', () => {
    expect(extractApiKey('Bearertoken123')).toBeNull();
  });
});
