import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('postgres client configuration', () => {
  it('uses safe numeric defaults when pool env vars are malformed', async () => {
    vi.stubEnv('DATABASE_POOL_MAX', 'not-a-number');
    vi.stubEnv('DATABASE_CONNECT_TIMEOUT_MS', 'NaN');
    vi.stubEnv('DATABASE_IDLE_TIMEOUT_MS', '-1');
    const { parsePositiveIntEnv } = await import('./postgres');

    expect(parsePositiveIntEnv('DATABASE_POOL_MAX', 5)).toBe(5);
    expect(parsePositiveIntEnv('DATABASE_CONNECT_TIMEOUT_MS', 3000)).toBe(3000);
    expect(parsePositiveIntEnv('DATABASE_IDLE_TIMEOUT_MS', 30000)).toBe(30000);
  });

  it('accepts positive integer pool env vars', async () => {
    vi.stubEnv('DATABASE_POOL_MAX', '12');
    const { parsePositiveIntEnv } = await import('./postgres');

    expect(parsePositiveIntEnv('DATABASE_POOL_MAX', 5)).toBe(12);
  });
});
