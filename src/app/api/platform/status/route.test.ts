import { afterEach, describe, expect, it, vi } from 'vitest';

function clearRouteEnv() {
  for (const key of ['FEATURE_COMMS', 'AISSTREAM_API_KEY', 'DATABASE_URL', 'REDIS_URL', 'STRIPE_SECRET_KEY']) {
    delete process.env[key];
  }
}

afterEach(() => {
  vi.restoreAllMocks();
  clearRouteEnv();
});

describe('/api/platform/status', () => {
  it('returns sanitized readiness metadata', async () => {
    vi.resetModules();
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/aegisgrid';
    process.env.REDIS_URL = 'redis://:redispass@localhost:6379/0';
    process.env.STRIPE_SECRET_KEY = 'sk_secret';
    const { GET } = await import('./route');

    const res = await GET();
    const body = await res.json();
    const serialized = JSON.stringify(body);

    expect(res.status).toBe(200);
    expect(body.database.status).toBe('configured');
    expect(body.redis).toMatchObject({ status: 'redis_configured', cache: 'wired', queue: 'planned' });
    expect(serialized).not.toContain('pass');
    expect(serialized).not.toContain('redispass');
    expect(serialized).not.toContain('sk_secret');
  });
});
