import { afterEach, describe, expect, it, vi } from 'vitest';
import type Stripe from 'stripe';

function clearBillingEnv() {
  for (const key of ['DATABASE_URL', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_LIVE_MODE']) delete process.env[key];
}

function webhookRequest(payload: string, signature?: string): Request {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (signature) headers.set('stripe-signature', signature);
  return new Request('http://localhost/api/billing/webhook', {
    method: 'POST',
    headers,
    body: payload,
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.doUnmock('@/lib/payments/stripe-client');
  vi.doUnmock('@/lib/payments/stripe-fulfillment');
  clearBillingEnv();
});

describe('/api/billing/webhook', () => {
  it('rejects missing signature before parsing payload', async () => {
    vi.resetModules();
    process.env.DATABASE_URL = 'postgresql://user:***@localhost:5432/aegisgrid';
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_123';
    const { POST } = await import('./route');

    const res = await POST(webhookRequest('{"id":"evt_1"}'));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe('STRIPE_SIGNATURE_REQUIRED');
  });

  it('rejects live/test mode mismatches after official signature verification', async () => {
    vi.resetModules();
    process.env.DATABASE_URL = 'postgresql://user:***@localhost:5432/aegisgrid';
    process.env.STRIPE_SECRET_KEY = 'sk_live_123';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_123';
    process.env.STRIPE_LIVE_MODE = 'true';
    vi.doMock('@/lib/payments/stripe-client', () => ({
      constructStripeWebhookEvent: vi.fn(() => ({ id: 'evt_test', type: 'checkout.session.completed', livemode: false, data: { object: { object: 'checkout.session' } } } as Stripe.Event)),
    }));
    const { POST } = await import('./route');

    const res = await POST(webhookRequest('{"id":"evt_test"}', 'sig'));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe('STRIPE_MODE_MISMATCH');
  });

  it('fulfills verified webhook events through claim-before-process fulfillment', async () => {
    vi.resetModules();
    process.env.DATABASE_URL = 'postgresql://user:***@localhost:5432/aegisgrid';
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_123';
    vi.doMock('@/lib/payments/stripe-client', () => ({
      constructStripeWebhookEvent: vi.fn(() => ({ id: 'evt_1', type: 'checkout.session.completed', livemode: false, data: { object: { object: 'checkout.session' } } } as Stripe.Event)),
    }));
    vi.doMock('@/lib/payments/stripe-fulfillment', () => ({
      fulfillStripePayment: vi.fn(async () => ({ status: 'processed', action: 'subscription_entitlement_granted' })),
    }));
    const { fulfillStripePayment } = await import('@/lib/payments/stripe-fulfillment');
    const { POST } = await import('./route');

    const res = await POST(webhookRequest('{"id":"evt_1"}', 'sig'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true, status: 'processed', action: 'subscription_entitlement_granted' });
    expect(fulfillStripePayment).toHaveBeenCalled();
    expect(JSON.stringify(body)).not.toContain('whsec');
  });

  it('asks Stripe to retry when a duplicate delivery is still processing', async () => {
    vi.resetModules();
    process.env.DATABASE_URL = 'postgresql://user:***@localhost:5432/aegisgrid';
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_123';
    vi.doMock('@/lib/payments/stripe-client', () => ({
      constructStripeWebhookEvent: vi.fn(() => ({ id: 'evt_processing', type: 'checkout.session.completed', livemode: false, data: { object: { object: 'checkout.session' } } } as Stripe.Event)),
    }));
    vi.doMock('@/lib/payments/stripe-fulfillment', () => ({
      fulfillStripePayment: vi.fn(async () => ({ status: 'retry', action: 'already_processing' })),
    }));
    const { POST } = await import('./route');

    const res = await POST(webhookRequest('{"id":"evt_processing"}', 'sig'));
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(res.headers.get('Retry-After')).toBe('30');
    expect(body).toEqual({ ok: false, status: 'retry', action: 'already_processing' });
  });
});
