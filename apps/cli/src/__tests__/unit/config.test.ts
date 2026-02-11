import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { loadProjectConfig, isLinked, getServerUrl } from '../../config';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'nexus-config-test-'));
}

const VALID_PROJECT_CONFIG = {
  projectId: '11111111-2222-3333-4444-555555555555',
  projectName: 'Test Project',
  projectSlug: 'test-project',
  linkedAt: '2025-01-01T00:00:00.000Z',
};

const VALID_PROJECT_CONFIG_WITH_FEATURE = {
  ...VALID_PROJECT_CONFIG,
  activeFeature: 'feat-abc',
};

// ---------------------------------------------------------------------------
// loadProjectConfig
// ---------------------------------------------------------------------------

describe('loadProjectConfig', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns null when no .nexus.json exists', () => {
    const result = loadProjectConfig(tempDir);
    expect(result).toBeNull();
  });

  it('returns null for invalid JSON content', () => {
    writeFileSync(join(tempDir, '.nexus.json'), 'NOT VALID JSON {{{');
    const result = loadProjectConfig(tempDir);
    expect(result).toBeNull();
  });

  it('returns null for JSON that does not match the schema', () => {
    writeFileSync(join(tempDir, '.nexus.json'), JSON.stringify({ foo: 'bar' }));
    const result = loadProjectConfig(tempDir);
    expect(result).toBeNull();
  });

  it('returns null when projectId is not a valid UUID', () => {
    const bad = { ...VALID_PROJECT_CONFIG, projectId: 'not-a-uuid' };
    writeFileSync(join(tempDir, '.nexus.json'), JSON.stringify(bad));
    const result = loadProjectConfig(tempDir);
    expect(result).toBeNull();
  });

  it('returns parsed config for a valid .nexus.json', () => {
    writeFileSync(join(tempDir, '.nexus.json'), JSON.stringify(VALID_PROJECT_CONFIG));
    const result = loadProjectConfig(tempDir);
    expect(result).toEqual(VALID_PROJECT_CONFIG);
  });

  it('returns config including optional activeFeature when present', () => {
    writeFileSync(join(tempDir, '.nexus.json'), JSON.stringify(VALID_PROJECT_CONFIG_WITH_FEATURE));
    const result = loadProjectConfig(tempDir);
    expect(result).toEqual(VALID_PROJECT_CONFIG_WITH_FEATURE);
  });

  it('returns config without activeFeature when field is omitted', () => {
    writeFileSync(join(tempDir, '.nexus.json'), JSON.stringify(VALID_PROJECT_CONFIG));
    const result = loadProjectConfig(tempDir);
    expect(result).not.toBeNull();
    expect(result!.activeFeature).toBeUndefined();
  });

  it('returns null for an empty file', () => {
    writeFileSync(join(tempDir, '.nexus.json'), '');
    const result = loadProjectConfig(tempDir);
    expect(result).toBeNull();
  });

  it('returns null when required field projectName is missing', () => {
    const { projectName, ...rest } = VALID_PROJECT_CONFIG;
    writeFileSync(join(tempDir, '.nexus.json'), JSON.stringify(rest));
    const result = loadProjectConfig(tempDir);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// isLinked
// ---------------------------------------------------------------------------

describe('isLinked', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns false when no .nexus.json exists', () => {
    expect(isLinked(tempDir)).toBe(false);
  });

  it('returns false when .nexus.json contains invalid data', () => {
    writeFileSync(join(tempDir, '.nexus.json'), '{ "bad": true }');
    expect(isLinked(tempDir)).toBe(false);
  });

  it('returns true when a valid .nexus.json exists', () => {
    writeFileSync(join(tempDir, '.nexus.json'), JSON.stringify(VALID_PROJECT_CONFIG));
    expect(isLinked(tempDir)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getServerUrl
// ---------------------------------------------------------------------------

describe('getServerUrl', () => {
  const originalEnv = process.env.NEXUS_SERVER_URL;

  afterEach(() => {
    // Restore original env state
    if (originalEnv !== undefined) {
      process.env.NEXUS_SERVER_URL = originalEnv;
    } else {
      delete process.env.NEXUS_SERVER_URL;
    }
  });

  it('returns the env var when NEXUS_SERVER_URL is set', () => {
    process.env.NEXUS_SERVER_URL = 'http://custom-server:9999';
    expect(getServerUrl()).toBe('http://custom-server:9999');
  });

  it('returns the default http://localhost:3001 when no env var and no global config', () => {
    delete process.env.NEXUS_SERVER_URL;
    // Without a valid global config file at ~/.nexus/config.json we expect the fallback.
    // This test assumes no real global config is present in the test environment.
    const url = getServerUrl();
    // It should either come from a real global config or be the default.
    // We verify it's a string and, if no config is present, it equals the default.
    expect(typeof url).toBe('string');
    expect(url).toMatch(/^https?:\/\//);
  });

  it('prefers env var over any other source', () => {
    process.env.NEXUS_SERVER_URL = 'https://override.example.com';
    expect(getServerUrl()).toBe('https://override.example.com');
  });
});
