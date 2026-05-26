import { afterEach, describe, expect, it, vi } from 'vitest';

function clearPlatformEnv() {
  for (const key of [
    'AUTH_USER_TOKENS',
    'AUTH_ADMIN_TOKEN',
    'AUTH_GITHUB_ID',
    'AUTH_GITHUB_SECRET',
    'AUTH_GOOGLE_ID',
    'AUTH_GOOGLE_SECRET',
    'DATABASE_URL',
    'REDIS_URL',
    'FEATURE_AI_REPORTS',
    'AI_PROVIDER',
    'OPENAI_API_KEY',
    'HERMES_API_KEY',
    'FEATURE_PREMIUM',
    'STRIPE_SECRET_KEY',
    'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
    'X402_ENABLED',
    'X402_RECEIVING_ADDRESS',
    'X402_FACILITATOR_URL',
    'FEATURE_COMMS',
    'AISSTREAM_API_KEY',
  ]) {
    delete process.env[key];
  }
}

afterEach(() => {
  vi.restoreAllMocks();
  clearPlatformEnv();
});

describe('platform status', () => {
  it('reports disabled/unconfigured defaults without exposing secrets', async () => {
    vi.resetModules();
    clearPlatformEnv();
    const { getPlatformStatus } = await import('./platform-status');

    const status = getPlatformStatus('2026-05-25T00:00:00.000Z');

    expect(status.generated_at).toBe('2026-05-25T00:00:00.000Z');
    expect(status.auth.token_auth_configured).toBe(false);
    expect(status.database.status).toBe('unconfigured');
    expect(status.redis.status).toBe('memory_fallback');
    expect(status.ai.enabled).toBe(false);
    expect(status.billing.premium_enabled).toBe(false);
    expect(status.feeds.ais.status).toBe('api_key_missing');
  });

  it('summarizes configured services while redacting secret material', async () => {
    vi.resetModules();
    process.env.AUTH_USER_TOKENS = 'alice:supersecret';
    process.env.AUTH_ADMIN_TOKEN = 'adminsecret';
    process.env.AUTH_GITHUB_ID = 'github-id';
    process.env.AUTH_GITHUB_SECRET = 'github-secret';
    process.env.DATABASE_URL = 'postgresql://user:databasepass@localhost:5432/aegisgrid';
    process.env.REDIS_URL = 'redis://:redispass@localhost:6379/0';
    process.env.FEATURE_AI_REPORTS = 'true';
    process.env.AI_PROVIDER = 'openai';
    process.env.OPENAI_API_KEY = 'sk-secret-openai';
    process.env.FEATURE_PREMIUM = 'true';
    process.env.STRIPE_SECRET_KEY = 'sk_live_secret';
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = 'pk_live_public';
    process.env.X402_ENABLED = 'true';
    process.env.X402_RECEIVING_ADDRESS = '0x0000000000000000000000000000000000000001';
    process.env.X402_FACILITATOR_URL = 'https://facilitator.example';
    process.env.FEATURE_COMMS = 'true';
    process.env.AISSTREAM_API_KEY = 'ais-secret';
    const { getPlatformStatus } = await import('./platform-status');

    const status = getPlatformStatus('2026-05-25T00:00:00.000Z');
    const serialized = JSON.stringify(status);

    expect(status.auth.token_auth_configured).toBe(true);
    expect(status.auth.oauth.github_configured).toBe(true);
    expect(status.database).toMatchObject({ status: 'configured', provider: 'postgresql', persistence: 'wired' });
    expect(status.redis).toMatchObject({ status: 'redis_configured', cache: 'wired', queue: 'planned' });
    expect(status.ai).toMatchObject({ enabled: true, provider: 'openai', configured: true });
    expect(status.billing).toMatchObject({ premium_enabled: true, stripe_configured: true, x402_configured: true, entitlement_store: 'database' });
    expect(status.feeds.ais.status).toBe('configured_not_connected');
    expect(status.comms.enabled).toBe(true);
    expect(serialized).not.toContain('supersecret');
    expect(serialized).not.toContain('adminsecret');
    expect(serialized).not.toContain('databasepass');
    expect(serialized).not.toContain('redispass');
    expect(serialized).not.toContain('sk-secret-openai');
    expect(serialized).not.toContain('sk_live_secret');
    expect(serialized).not.toContain('ais-secret');
  });
});
