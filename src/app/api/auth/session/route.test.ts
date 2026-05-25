import { afterEach, describe, expect, it, vi } from 'vitest';

function clearRouteEnv() {
  for (const key of [
    'AUTH_USER_TOKENS',
    'AUTH_ADMIN_TOKEN',
    'AUTH_USER_ENTITLEMENTS',
    'DATABASE_URL',
    'REDIS_URL',
    'FEATURE_AI_REPORTS',
    'AI_PROVIDER',
    'FEATURE_PREMIUM',
    'FEATURE_COMMS',
    'AISSTREAM_API_KEY',
  ]) {
    delete process.env[key];
  }
}

afterEach(() => {
  vi.restoreAllMocks();
  clearRouteEnv();
});

describe('/api/auth/session', () => {
  it('returns an anonymous session without exposing auth configuration', async () => {
    vi.resetModules();
    const { GET } = await import('./route');

    const res = await GET(new Request('http://localhost/api/auth/session'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ authenticated: false, role: 'anonymous', entitlements: [] });
    expect(JSON.stringify(body)).not.toContain('AUTH_USER_TOKENS');
  });

  it('returns authenticated subject metadata without token material', async () => {
    vi.resetModules();
    process.env.AUTH_USER_TOKENS = 'alice:secret-token';
    process.env.AUTH_USER_ENTITLEMENTS = 'alice:premium,alice:ai_report';
    const { GET } = await import('./route');

    const res = await GET(new Request('http://localhost/api/auth/session', {
      headers: { Authorization: 'Bearer secret-token' },
    }));
    const body = await res.json();

    expect(body).toMatchObject({ authenticated: true, role: 'authenticated', subject_id: 'alice' });
    expect(body.entitlements).toEqual(['ai_report', 'premium']);
    expect(JSON.stringify(body)).not.toContain('secret-token');
  });
});
