import { afterEach, describe, expect, it, vi } from 'vitest';

function clearBillingEnv() {
  delete process.env.FEATURE_PREMIUM;
  delete process.env.AUTH_USER_TOKENS;
  delete process.env.AUTH_ADMIN_TOKEN;
  delete process.env.AUTH_USER_ENTITLEMENTS;
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_PRICE_PRO_MONTHLY;
  delete process.env.X402_ENABLED;
  delete process.env.X402_RECEIVING_ADDRESS;
  delete process.env.X402_FACILITATOR_URL;
}

function makeRequest(token?: string): Request {
  const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
  return new Request('http://localhost/api/reports', { headers });
}

afterEach(() => {
  vi.restoreAllMocks();
  clearBillingEnv();
});

describe('premium billing guard', () => {
  it('fails closed for anonymous subjects', async () => {
    vi.resetModules();
    process.env.FEATURE_PREMIUM = 'true';
    const { parseAppSubject } = await import('../auth/app-auth');
    const { verifyPremiumAccess } = await import('./guard');

    const decision = await verifyPremiumAccess(parseAppSubject(makeRequest()), 'ai_report');

    expect(decision).toMatchObject({
      allowed: false,
      status: 401,
      code: 'AUTH_REQUIRED',
    });
  });

  it('denies authenticated users when premium features are disabled', async () => {
    vi.resetModules();
    process.env.FEATURE_PREMIUM = 'false';
    process.env.AUTH_USER_TOKENS = 'alice:token';
    process.env.AUTH_USER_ENTITLEMENTS = 'alice:premium';
    const { parseAppSubject } = await import('../auth/app-auth');
    const { verifyPremiumAccess } = await import('./guard');

    const decision = await verifyPremiumAccess(parseAppSubject(makeRequest('token')), 'ai_report');

    expect(decision).toMatchObject({
      allowed: false,
      status: 403,
      code: 'PREMIUM_DISABLED',
    });
  });

  it('allows explicit static entitlements only when premium features are enabled', async () => {
    vi.resetModules();
    process.env.FEATURE_PREMIUM = 'true';
    process.env.AUTH_USER_TOKENS = 'alice:token,bob:bob-token';
    process.env.AUTH_USER_ENTITLEMENTS = 'alice:ai_report,bob:premium';
    const { parseAppSubject } = await import('../auth/app-auth');
    const { verifyPremiumAccess } = await import('./guard');

    await expect(verifyPremiumAccess(parseAppSubject(makeRequest('token')), 'ai_report'))
      .resolves.toMatchObject({ allowed: true, source: 'static_entitlement' });
    await expect(verifyPremiumAccess(parseAppSubject(makeRequest('bob-token')), 'ai_report'))
      .resolves.toMatchObject({ allowed: true, source: 'static_entitlement' });
  });

  it('allows admin token holders without relying on client-side premium flags', async () => {
    vi.resetModules();
    process.env.AUTH_ADMIN_TOKEN = 'admin-token';
    const { parseAppSubject } = await import('../auth/app-auth');
    const { verifyPremiumAccess } = await import('./guard');

    const decision = await verifyPremiumAccess(parseAppSubject(makeRequest('admin-token')), 'ai_report');

    expect(decision).toMatchObject({ allowed: true, source: 'admin' });
  });

  it('returns payment required instead of falling open when no entitlement provider approves access', async () => {
    vi.resetModules();
    process.env.FEATURE_PREMIUM = 'true';
    process.env.AUTH_USER_TOKENS = 'alice:token';
    process.env.STRIPE_SECRET_KEY = 'sk_test_should_not_leak';
    process.env.X402_ENABLED = 'true';
    process.env.X402_RECEIVING_ADDRESS = '0x0000000000000000000000000000000000000001';
    const { parseAppSubject } = await import('../auth/app-auth');
    const { verifyPremiumAccess } = await import('./guard');

    const decision = await verifyPremiumAccess(parseAppSubject(makeRequest('token')), 'ai_report');

    expect(decision).toMatchObject({
      allowed: false,
      status: 402,
      code: 'ENTITLEMENT_REQUIRED',
    });
    expect(JSON.stringify(decision)).not.toContain('sk_test_should_not_leak');
  });
});
