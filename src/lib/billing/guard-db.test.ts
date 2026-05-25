import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppSubject } from '@/lib/auth/app-auth';

const aliceWithStaticEntitlement: AppSubject = {
  role: 'authenticated',
  subjectId: 'alice',
  entitlements: ['ai_report'],
};

const aliceWithoutStaticEntitlement: AppSubject = {
  role: 'authenticated',
  subjectId: 'alice',
  entitlements: [],
};

function clearBillingEnv() {
  for (const key of ['FEATURE_PREMIUM', 'DATABASE_URL', 'AUTH_STATIC_ENTITLEMENTS_FALLBACK']) {
    delete (process.env as Record<string, string | undefined>)[key];
  }
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  clearBillingEnv();
});

describe('premium billing guard with database-backed entitlements', () => {
  it('allows active database entitlements before consulting static env entitlements', async () => {
    vi.resetModules();
    process.env.FEATURE_PREMIUM = 'true';
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/aegisgrid';
    const repository = {
      findActiveEntitlement: vi.fn(async () => ({
        id: 'ent_1',
        capability: 'ai_report',
        source: 'stripe' as const,
        status: 'active' as const,
        valid_until: null,
      })),
    };
    const { verifyPremiumAccess } = await import('./guard');

    const decision = await verifyPremiumAccess(aliceWithoutStaticEntitlement, 'ai_report', { repository });

    expect(decision).toMatchObject({ allowed: true, source: 'db_entitlement' });
    expect(repository.findActiveEntitlement).toHaveBeenCalledWith('alice', 'ai_report', expect.any(Date));
  });

  it('does not fall back to static entitlements when DATABASE_URL is configured by default', async () => {
    vi.resetModules();
    process.env.FEATURE_PREMIUM = 'true';
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/aegisgrid';
    const repository = { findActiveEntitlement: vi.fn(async () => null) };
    const { verifyPremiumAccess } = await import('./guard');

    const decision = await verifyPremiumAccess(aliceWithStaticEntitlement, 'ai_report', { repository });

    expect(decision).toMatchObject({
      allowed: false,
      status: 402,
      code: 'ENTITLEMENT_REQUIRED',
      source: 'none',
    });
  });

  it('does not allow static fallback in production even when DATABASE_URL is missing', async () => {
    vi.resetModules();
    process.env.FEATURE_PREMIUM = 'true';
    vi.stubEnv('NODE_ENV', 'production');
    const { verifyPremiumAccess } = await import('./guard');

    const decision = await verifyPremiumAccess(aliceWithStaticEntitlement, 'ai_report');

    expect(decision).toMatchObject({
      allowed: false,
      status: 402,
      code: 'ENTITLEMENT_REQUIRED',
      source: 'none',
    });
  });

  it('allows explicit static fallback only outside production', async () => {
    vi.resetModules();
    process.env.FEATURE_PREMIUM = 'true';
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/aegisgrid';
    process.env.AUTH_STATIC_ENTITLEMENTS_FALLBACK = 'true';
    vi.stubEnv('NODE_ENV', 'development');
    const repository = { findActiveEntitlement: vi.fn(async () => null) };
    const { verifyPremiumAccess } = await import('./guard');

    await expect(verifyPremiumAccess(aliceWithStaticEntitlement, 'ai_report', { repository }))
      .resolves.toMatchObject({ allowed: true, source: 'static_entitlement' });
  });

  it('fails closed on database entitlement errors even if static entitlements are present', async () => {
    vi.resetModules();
    process.env.FEATURE_PREMIUM = 'true';
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/aegisgrid';
    const repository = { findActiveEntitlement: vi.fn(async () => { throw new Error('db down'); }) };
    const { verifyPremiumAccess } = await import('./guard');

    const decision = await verifyPremiumAccess(aliceWithStaticEntitlement, 'ai_report', { repository });

    expect(decision).toMatchObject({
      allowed: false,
      status: 402,
      code: 'BILLING_CHECK_FAILED',
      source: 'error',
    });
  });
});
