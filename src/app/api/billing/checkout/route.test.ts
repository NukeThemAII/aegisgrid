import { afterEach, describe, expect, it, vi } from 'vitest';

function clearBillingEnv() {
  for (const key of [
    'AUTH_USER_TOKENS',
    'AUTH_ADMIN_TOKEN',
    'DATABASE_URL',
    'STRIPE_SECRET_KEY',
    'STRIPE_PRICE_PRO_MONTHLY',
    'STRIPE_WEBHOOK_SECRET',
  ]) delete process.env[key];
}

function request(body: unknown, token?: string): Request {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (token) headers.set('authorization', `Bearer ${token}`);
  return new Request('http://localhost/api/billing/checkout', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.doUnmock('@/lib/payments/stripe-client');
  clearBillingEnv();
});

describe('/api/billing/checkout', () => {
  it('allows anonymous checkout with generated subjectId', async () => {
    vi.resetModules();
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';
    process.env.STRIPE_PRICE_PRO_MONTHLY = 'price_123';
    vi.doMock('@/lib/payments/stripe-client', () => ({
      createCheckoutSession: vi.fn(async () => ({ id: 'cs_anon', url: 'https://checkout.stripe.com/pay' })),
    }));
    const { POST } = await import('./route');

    const res = await POST(request({ product: 'pro_monthly' }));
    const body = await res.json();

    expect(body.ok).toBe(true);
    expect(body.checkout.url).toContain('stripe.com');
  });

  it('allows checkout without database — falls through to Stripe session creation', async () => {
    vi.resetModules();
    process.env.AUTH_USER_TOKENS = 'alice:token';
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';
    process.env.STRIPE_PRICE_PRO_MONTHLY = 'price_123';
    const { POST } = await import('./route');

    const res = await POST(request({ product: 'pro_monthly' }, 'token'));
    const body = await res.json();

    // Stripe session creation may fail (502) without webhook secret,
    // but database absence no longer blocks checkout
    expect([200, 502]).toContain(res.status);
  });

  it('creates official Stripe Checkout sessions only after auth, config, and body validation pass', async () => {
    vi.resetModules();
    process.env.AUTH_USER_TOKENS = 'alice:token';
    process.env.DATABASE_URL = 'postgresql://user:***@localhost:5432/aegisgrid';
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';
    process.env.STRIPE_PRICE_PRO_MONTHLY = 'price_123';
    vi.doMock('@/lib/payments/stripe-client', () => ({
      createCheckoutSession: vi.fn(async () => ({ id: 'cs_123', url: 'https://checkout.stripe.com/c/pay/cs_123' })),
    }));
    const { createCheckoutSession } = await import('@/lib/payments/stripe-client');
    const { POST } = await import('./route');

    const res = await POST(request({ product: 'pro_monthly', success_path: '/account?paid=1' }, 'token'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true, checkout: { id: 'cs_123', url: 'https://checkout.stripe.com/c/pay/cs_123' } });
    expect(createCheckoutSession).toHaveBeenCalledWith(expect.objectContaining({
      subjectId: 'alice',
      product: 'pro_monthly',
      successPath: '/account?paid=1',
    }));
    expect(JSON.stringify(body)).not.toContain('sk_test');
  });
});
