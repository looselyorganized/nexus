import { describe, it, expect } from 'bun:test';
import {
  generateApiKey,
  computeKeyPrefix,
  isValidApiKeyFormat,
  API_KEY_PREFIX,
  API_KEY_LENGTH,
} from '../../../lib/api-key';

describe('generateApiKey', () => {
  it('returns a string starting with the nexus_eng_ prefix', () => {
    const key = generateApiKey();
    expect(key.startsWith(API_KEY_PREFIX)).toBe(true);
  });

  it('returns a string of exactly 74 characters', () => {
    const key = generateApiKey();
    expect(key.length).toBe(API_KEY_LENGTH);
  });

  it('contains valid hex characters after the prefix', () => {
    const key = generateApiKey();
    const hexPart = key.slice(API_KEY_PREFIX.length);
    expect(hexPart).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produces unique keys on successive calls', () => {
    const key1 = generateApiKey();
    const key2 = generateApiKey();
    expect(key1).not.toBe(key2);
  });
});

describe('computeKeyPrefix', () => {
  it('returns a string of exactly 16 characters', () => {
    const prefix = computeKeyPrefix('some-key');
    expect(prefix.length).toBe(16);
  });

  it('returns consistent results for the same input', () => {
    const a = computeKeyPrefix('deterministic-input');
    const b = computeKeyPrefix('deterministic-input');
    expect(a).toBe(b);
  });

  it('returns different results for different inputs', () => {
    const a = computeKeyPrefix('key-alpha');
    const b = computeKeyPrefix('key-bravo');
    expect(a).not.toBe(b);
  });

  it('returns valid hexadecimal characters', () => {
    const prefix = computeKeyPrefix('hex-check');
    expect(prefix).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe('isValidApiKeyFormat', () => {
  it('returns true for a correctly formatted key', () => {
    const key = generateApiKey();
    expect(isValidApiKeyFormat(key)).toBe(true);
  });

  it('returns false when the prefix is wrong', () => {
    const key = 'wrong_pfx_' + 'a'.repeat(64);
    expect(isValidApiKeyFormat(key)).toBe(false);
  });

  it('returns false when the key is too short', () => {
    const key = API_KEY_PREFIX + 'abcd';
    expect(isValidApiKeyFormat(key)).toBe(false);
  });

  it('returns false when the key is too long', () => {
    const key = API_KEY_PREFIX + 'a'.repeat(65);
    expect(isValidApiKeyFormat(key)).toBe(false);
  });

  it('returns false for an empty string', () => {
    expect(isValidApiKeyFormat('')).toBe(false);
  });

  it('returns false for the prefix alone', () => {
    expect(isValidApiKeyFormat(API_KEY_PREFIX)).toBe(false);
  });
});
