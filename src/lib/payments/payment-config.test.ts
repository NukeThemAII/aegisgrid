import { describe, expect, it } from 'vitest';

describe('payment configuration', () => {
  it('maps configured Stripe products to price IDs and fulfillment metadata', async () => {
    process.env.STRIPE_PRICE_PRO_MONTHLY = 'price_monthly';
    process.env.STRIPE_PRICE_PRO_YEARLY = 'price_yearly';
    process.env.STRIPE_PRICE_REPORT_PACK = 'price_pack';
    process.env.STRIPE_REPORT_PACK_CREDITS = '25';
    const { stripeProductConfig } = await import('./payment-config');

    expect(stripeProductConfig('pro_monthly')).toMatchObject({
      priceId: 'price_monthly',
      mode: 'subscription',
      capability: 'premium',
    });
    expect(stripeProductConfig('report_pack')).toMatchObject({
      priceId: 'price_pack',
      mode: 'payment',
      credits: 25,
    });
  });

  it('rejects unknown checkout products and unsafe redirect paths', async () => {
    const { parseCheckoutRequest } = await import('./payment-config');

    expect(parseCheckoutRequest({ product: 'lifetime_root', success_path: 'https://evil.test' })).toEqual({
      ok: false,
      code: 'INVALID_PRODUCT',
      error: 'Unsupported checkout product.',
    });
    expect(parseCheckoutRequest({ product: 'pro_monthly', success_path: '//evil.test' })).toEqual({
      ok: false,
      code: 'INVALID_REDIRECT_PATH',
      error: 'Redirect paths must be local absolute paths.',
    });
  });

  it('derives safe app URLs from request origin or configured public URL', async () => {
    const { resolveAppUrl } = await import('./payment-config');

    process.env.NEXT_PUBLIC_APP_URL = 'https://aegisgrid.example';
    expect(resolveAppUrl(new Request('http://localhost/api/billing/checkout')).toString()).toBe('https://aegisgrid.example/');
    delete process.env.NEXT_PUBLIC_APP_URL;
    expect(resolveAppUrl(new Request('http://localhost:3000/api/billing/checkout')).toString()).toBe('http://localhost:3000/');
  });
});
