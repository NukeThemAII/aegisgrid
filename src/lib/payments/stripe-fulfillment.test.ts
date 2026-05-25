import { describe, expect, it, vi } from 'vitest';
import type Stripe from 'stripe';
import type { PaymentRepository } from './stripe-fulfillment';

function repo(overrides: Partial<PaymentRepository> = {}): PaymentRepository {
  return {
    claimPaymentEvent: vi.fn(async () => 'claimed' as const),
    markPaymentEventProcessed: vi.fn(async () => undefined),
    releasePaymentEventClaim: vi.fn(async () => undefined),
    upsertBillingUser: vi.fn(async () => 'user_1'),
    upsertEntitlementForExternalRef: vi.fn(async () => ({ id: 'ent_1' })),
    recordCreditLedgerEntry: vi.fn(async () => ({ id: 'ledger_1', inserted: true })),
    ...overrides,
  };
}

function checkoutSession(overrides: Partial<Stripe.Checkout.Session> = {}): Stripe.Checkout.Session {
  return {
    id: 'cs_test_123',
    object: 'checkout.session',
    mode: 'subscription',
    customer: 'cus_123',
    subscription: 'sub_123',
    metadata: { subject_id: 'alice', product: 'pro_monthly' },
    payment_status: 'paid',
    ...overrides,
  } as Stripe.Checkout.Session;
}

function subscription(overrides: Partial<Stripe.Subscription> = {}): Stripe.Subscription {
  return {
    id: 'sub_123',
    object: 'subscription',
    customer: 'cus_123',
    status: 'active',
    metadata: { subject_id: 'alice', product: 'pro_monthly' },
    current_period_end: Math.floor(new Date('2026-06-25T00:00:00.000Z').getTime() / 1000),
    ...overrides,
  } as Stripe.Subscription;
}

describe('Stripe fulfillment', () => {
  it('claim-before-process grants subscription entitlements idempotently', async () => {
    const paymentRepo = repo();
    const { fulfillStripeEvent } = await import('./stripe-fulfillment');

    const result = await fulfillStripeEvent({
      id: 'evt_1',
      type: 'checkout.session.completed',
      livemode: false,
      data: { object: checkoutSession() },
    } as Stripe.Event, paymentRepo);

    expect(result).toEqual({ status: 'processed', action: 'subscription_entitlement_granted' });
    expect(paymentRepo.claimPaymentEvent).toHaveBeenCalledWith('stripe', 'evt_1', 'checkout.session.completed', expect.any(Object));
    expect(paymentRepo.upsertBillingUser).toHaveBeenCalledWith({ subjectId: 'alice', stripeCustomerId: 'cus_123' });
    expect(paymentRepo.upsertEntitlementForExternalRef).toHaveBeenCalledWith(expect.objectContaining({
      subjectId: 'alice',
      capability: 'premium',
      source: 'stripe',
      status: 'active',
      externalRef: 'stripe:subscription:sub_123',
    }));
    expect(paymentRepo.markPaymentEventProcessed).toHaveBeenCalledWith('stripe', 'evt_1', expect.any(Object));
  });

  it('credits report pack purchases once and does not create browser-trust entitlements', async () => {
    const paymentRepo = repo();
    const { fulfillStripeEvent } = await import('./stripe-fulfillment');

    const result = await fulfillStripeEvent({
      id: 'evt_pack',
      type: 'checkout.session.completed',
      livemode: false,
      data: { object: checkoutSession({ mode: 'payment', subscription: null, metadata: { subject_id: 'alice', product: 'report_pack', credits: '7' } }) },
    } as Stripe.Event, paymentRepo);

    expect(result).toEqual({ status: 'processed', action: 'report_pack_credited' });
    expect(paymentRepo.recordCreditLedgerEntry).toHaveBeenCalledWith(expect.objectContaining({
      subjectId: 'alice',
      creditsDelta: 7,
      externalRef: 'stripe:checkout:cs_test_123',
      reason: 'stripe_report_pack',
    }));
    expect(paymentRepo.upsertEntitlementForExternalRef).not.toHaveBeenCalled();
  });

  it('updates subscription entitlement status from subscription webhooks', async () => {
    const paymentRepo = repo();
    const { fulfillStripeEvent } = await import('./stripe-fulfillment');

    const result = await fulfillStripeEvent({
      id: 'evt_sub',
      type: 'customer.subscription.updated',
      livemode: false,
      data: { object: subscription({ status: 'past_due' }) },
    } as Stripe.Event, paymentRepo);

    expect(result).toEqual({ status: 'processed', action: 'subscription_entitlement_updated' });
    expect(paymentRepo.upsertEntitlementForExternalRef).toHaveBeenCalledWith(expect.objectContaining({
      status: 'past_due',
      validUntil: '2026-06-25T00:00:00.000Z',
    }));
  });

  it('returns duplicate without processing when an event is already claimed or processed', async () => {
    const paymentRepo = repo({ claimPaymentEvent: vi.fn(async () => 'duplicate_processed' as const) });
    const { fulfillStripeEvent } = await import('./stripe-fulfillment');

    const result = await fulfillStripeEvent({
      id: 'evt_dup',
      type: 'checkout.session.completed',
      livemode: false,
      data: { object: checkoutSession() },
    } as Stripe.Event, paymentRepo);

    expect(result).toEqual({ status: 'duplicate', action: 'already_processed' });
    expect(paymentRepo.upsertEntitlementForExternalRef).not.toHaveBeenCalled();
  });

  it('returns retry when an event is already processing so Stripe will deliver again', async () => {
    const paymentRepo = repo({ claimPaymentEvent: vi.fn(async () => 'duplicate_processing' as const) });
    const { fulfillStripeEvent } = await import('./stripe-fulfillment');

    const result = await fulfillStripeEvent({
      id: 'evt_processing',
      type: 'checkout.session.completed',
      livemode: false,
      data: { object: checkoutSession() },
    } as Stripe.Event, paymentRepo);

    expect(result).toEqual({ status: 'retry', action: 'already_processing' });
    expect(paymentRepo.upsertEntitlementForExternalRef).not.toHaveBeenCalled();
    expect(paymentRepo.markPaymentEventProcessed).not.toHaveBeenCalled();
  });

  it('releases the event claim when fulfillment throws so Stripe can retry', async () => {
    const paymentRepo = repo({ upsertBillingUser: vi.fn(async () => { throw new Error('db down'); }) });
    const { fulfillStripeEvent } = await import('./stripe-fulfillment');

    await expect(fulfillStripeEvent({
      id: 'evt_fail',
      type: 'checkout.session.completed',
      livemode: false,
      data: { object: checkoutSession() },
    } as Stripe.Event, paymentRepo)).rejects.toThrow('db down');

    expect(paymentRepo.releasePaymentEventClaim).toHaveBeenCalledWith('stripe', 'evt_fail');
    expect(paymentRepo.markPaymentEventProcessed).not.toHaveBeenCalled();
  });
});
