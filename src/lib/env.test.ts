import { describe, it, expect, afterEach } from 'vitest';
import { parseEnv, resetEnvCache, isProduction, isDatabaseConfigured, isRedisConfigured, isStripeFullyConfigured, isX402Configured, isScannerProxyConfigured, aiProviderName } from './env';

afterEach(() => {
  resetEnvCache();
});

// ---------------------------------------------------------------------------
// parseEnv — core validation
// ---------------------------------------------------------------------------

describe('parseEnv', () => {
  it('parses minimal env with all defaults', () => {
    const env = parseEnv({});
    expect(env.NODE_ENV).toBe('development');
    expect(env.NEXT_PUBLIC_APP_NAME).toBe('AegisGrid');
    expect(env.AI_PROVIDER).toBe('none');
    expect(env.X402_NETWORK).toBe('eip155:8453');
    expect(env.X402_REPORT_PRICE_USDC).toBe('1.00');
    expect(env.SCANNER_V2_HOST).toBe('127.0.0.1');
    expect(env.SCANNER_AUDIT_PERSISTENCE).toBe('file');
  });

  it('trims whitespace from string values', () => {
    const env = parseEnv({ DATABASE_URL: '  postgres://localhost/test  ' });
    expect(env.DATABASE_URL).toBe('postgres://localhost/test');
  });

  it('converts empty strings to undefined for optional fields', () => {
    const env = parseEnv({ DATABASE_URL: '', REDIS_URL: '  ' });
    expect(env.DATABASE_URL).toBeUndefined();
    expect(env.REDIS_URL).toBeUndefined();
  });

  it('parses boolean flags correctly', () => {
    const env = parseEnv({
      FEATURE_AI_REPORTS: 'true',
      FEATURE_COMMS: 'false',
      FEATURE_PREMIUM: 'TRUE',  // not 'true' — should be false
      X402_ENABLED: 'true',
    });
    expect(env.FEATURE_AI_REPORTS).toBe(true);
    expect(env.FEATURE_COMMS).toBe(false);
    expect(env.FEATURE_PREMIUM).toBe(false); // strict equality to 'true'
    expect(env.X402_ENABLED).toBe(true);
  });

  it('defaults boolean flags to false when unset', () => {
    const env = parseEnv({});
    expect(env.FEATURE_AI_REPORTS).toBe(false);
    expect(env.FEATURE_COMMS).toBe(false);
    expect(env.FEATURE_PREMIUM).toBe(false);
    expect(env.FEATURE_X402).toBe(false);
    expect(env.X402_ENABLED).toBe(false);
    expect(env.STRIPE_LIVE_MODE).toBe(false);
  });

  it('validates AI_PROVIDER enum', () => {
    expect(parseEnv({ AI_PROVIDER: 'openai' }).AI_PROVIDER).toBe('openai');
    expect(parseEnv({ AI_PROVIDER: 'hermes' }).AI_PROVIDER).toBe('hermes');
    expect(parseEnv({ AI_PROVIDER: 'deterministic' }).AI_PROVIDER).toBe('deterministic');
    expect(parseEnv({ AI_PROVIDER: 'none' }).AI_PROVIDER).toBe('none');
    expect(() => parseEnv({ AI_PROVIDER: 'invalid' })).toThrow('Environment validation failed');
  });

  it('validates NODE_ENV enum', () => {
    expect(parseEnv({ NODE_ENV: 'production' }).NODE_ENV).toBe('production');
    expect(parseEnv({ NODE_ENV: 'test' }).NODE_ENV).toBe('test');
    expect(() => parseEnv({ NODE_ENV: 'staging' })).toThrow('Environment validation failed');
  });

  it('validates SCANNER_AUDIT_PERSISTENCE enum', () => {
    expect(parseEnv({ SCANNER_AUDIT_PERSISTENCE: 'db' }).SCANNER_AUDIT_PERSISTENCE).toBe('db');
    expect(parseEnv({ SCANNER_AUDIT_PERSISTENCE: 'none' }).SCANNER_AUDIT_PERSISTENCE).toBe('none');
    expect(() => parseEnv({ SCANNER_AUDIT_PERSISTENCE: 'invalid' })).toThrow();
  });

  it('parses positive integer env vars', () => {
    const env = parseEnv({
      STRIPE_REPORT_PACK_CREDITS: '25',
      SCANNER_V2_PORT: '4007',
      DATABASE_POOL_MAX: '10',
    });
    expect(env.STRIPE_REPORT_PACK_CREDITS).toBe(25);
    expect(env.SCANNER_V2_PORT).toBe(4007);
    expect(env.DATABASE_POOL_MAX).toBe(10);
  });

  it('rejects non-positive integers', () => {
    const env = parseEnv({
      STRIPE_REPORT_PACK_CREDITS: '0',
      SCANNER_V2_PORT: '-1',
    });
    expect(env.STRIPE_REPORT_PACK_CREDITS).toBeUndefined();
    expect(env.SCANNER_V2_PORT).toBeUndefined();
  });

  it('rejects non-numeric integer values', () => {
    const env = parseEnv({ STRIPE_REPORT_PACK_CREDITS: 'abc' });
    expect(env.STRIPE_REPORT_PACK_CREDITS).toBeUndefined();
  });

  it('parses enrichment API keys', () => {
    const env = parseEnv({
      SHODAN_API_KEY: 'test-key-123',
      OTX_API_KEY: '  spaced-key  ',
    });
    expect(env.SHODAN_API_KEY).toBe('test-key-123');
    expect(env.OTX_API_KEY).toBe('spaced-key');
  });

  it('caches parsed result on repeated calls without overrides', () => {
    const env1 = parseEnv();
    const env2 = parseEnv();
    expect(env1).toBe(env2); // same frozen reference
  });

  it('overrides update the cache', () => {
    parseEnv({ DATABASE_URL: 'a' });
    const env = parseEnv({ DATABASE_URL: 'b' });
    expect(env.DATABASE_URL).toBe('b');
    // Derived helpers also see the updated value
    expect(isDatabaseConfigured()).toBe(true);
  });

  it('includes variable name in error messages', () => {
    try {
      parseEnv({ AI_PROVIDER: 'bad_value' });
      expect.fail('should have thrown');
    } catch (e) {
      expect((e as Error).message).toContain('AI_PROVIDER');
    }
  });
});

// ---------------------------------------------------------------------------
// Derived helpers
// ---------------------------------------------------------------------------

describe('isProduction', () => {
  it('returns true for NODE_ENV=production', () => {
    parseEnv({ NODE_ENV: 'production' });
    expect(isProduction()).toBe(true);
  });

  it('returns false for NODE_ENV=development', () => {
    parseEnv({ NODE_ENV: 'development' });
    expect(isProduction()).toBe(false);
  });
});

describe('isDatabaseConfigured', () => {
  it('returns true when DATABASE_URL is set', () => {
    parseEnv({ DATABASE_URL: 'postgres://localhost/test' });
    expect(isDatabaseConfigured()).toBe(true);
  });

  it('returns false when DATABASE_URL is empty', () => {
    parseEnv({});
    expect(isDatabaseConfigured()).toBe(false);
  });
});

describe('isRedisConfigured', () => {
  it('returns true when REDIS_URL is set', () => {
    parseEnv({ REDIS_URL: 'redis://localhost:6379' });
    expect(isRedisConfigured()).toBe(true);
  });

  it('returns false when REDIS_URL is unset', () => {
    parseEnv({});
    expect(isRedisConfigured()).toBe(false);
  });
});

describe('isStripeFullyConfigured', () => {
  it('returns true when both secret and webhook secret are set', () => {
    parseEnv({
      STRIPE_SECRET_KEY: 'sk_test_xxx',
      STRIPE_WEBHOOK_SECRET: 'whsec_xxx',
    });
    expect(isStripeFullyConfigured()).toBe(true);
  });

  it('returns false when webhook secret is missing', () => {
    parseEnv({ STRIPE_SECRET_KEY: 'sk_test_xxx' });
    expect(isStripeFullyConfigured()).toBe(false);
  });
});

describe('isX402Configured', () => {
  it('returns true when enabled and fully configured', () => {
    parseEnv({
      X402_ENABLED: 'true',
      X402_RECEIVING_ADDRESS: '0xabc',
      X402_FACILITATOR_URL: 'https://fac.example',
    });
    expect(isX402Configured()).toBe(true);
  });

  it('returns false when disabled', () => {
    parseEnv({
      X402_ENABLED: 'false',
      X402_RECEIVING_ADDRESS: '0xabc',
      X402_FACILITATOR_URL: 'https://fac.example',
    });
    expect(isX402Configured()).toBe(false);
  });

  it('returns false when address is missing', () => {
    parseEnv({ X402_ENABLED: 'true', X402_FACILITATOR_URL: 'https://fac.example' });
    expect(isX402Configured()).toBe(false);
  });
});

describe('isScannerProxyConfigured', () => {
  it('returns true when both URL and key are set', () => {
    parseEnv({ SCANNER_URL: 'http://127.0.0.1:4007', SCANNER_KEY: 'secret' });
    expect(isScannerProxyConfigured()).toBe(true);
  });

  it('returns false when key is missing', () => {
    parseEnv({ SCANNER_URL: 'http://127.0.0.1:4007' });
    expect(isScannerProxyConfigured()).toBe(false);
  });
});

describe('aiProviderName', () => {
  it('returns the configured provider', () => {
    parseEnv({ AI_PROVIDER: 'openai' });
    expect(aiProviderName()).toBe('openai');
  });

  it('defaults to none', () => {
    parseEnv({});
    expect(aiProviderName()).toBe('none');
  });
});
