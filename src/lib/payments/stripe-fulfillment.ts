import type Stripe from 'stripe';
import type { EntitlementSource, EntitlementStatus, PaymentEventClaimStatus, PremiumCapability } from '@/lib/db/app-repository';
import { stripeProductConfig, type StripeProduct } from './payment-config';
import { createAccessToken } from '@/lib/premium/access-tokens';

export interface PaymentRepository {
  claimPaymentEvent(provider: 'stripe', eventId: string, eventType: string, metadata?: unknown): Promise<PaymentEventClaimStatus>;
  markPaymentEventProcessed(provider: 'stripe', eventId: string, metadata?: unknown): Promise<void>;
  releasePaymentEventClaim(provider: 'stripe', eventId: string): Promise<void>;
  upsertBillingUser(input: { subjectId: string; stripeCustomerId?: string | null }): Promise<string>;
  upsertEntitlementForExternalRef(input: {
    subjectId: string;
    capability: PremiumCapability;
    source: EntitlementSource;
    status: EntitlementStatus;
    externalRef: string;
    validUntil?: string | null;
    metadata?: unknown;
  }): Promise<{ id: string }>;
  recordCreditLedgerEntry(input: {
    subjectId: string;
    direction: 'credit' | 'debit';
    creditsDelta: number;
    reason: string;
    externalRef: string;
    amountUsdc?: string | null;
    metadata?: unknown;
  }): Promise<{ id: string; inserted: boolean }>;
}

export interface StripeFulfillmentResult {
  status: 'processed' | 'duplicate' | 'ignored' | 'retry';
  action: string;
}

type FulfillmentAction = () => Promise<string>;

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function stripeId(value: string | { id?: string } | null | undefined): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value;
  return typeof value.id === 'string' ? value.id : null;
}

function metadataValue(metadata: Stripe.Metadata | null | undefined, key: string): string | null {
  return stringOrNull(metadata?.[key]);
}

function productFromMetadata(metadata: Stripe.Metadata | null | undefined): StripeProduct | null {
  const value = metadataValue(metadata, 'product');
  return value === 'pro_monthly' || value === 'pro_yearly' || value === 'report_pack' ? value : null;
}

function subjectFromMetadata(metadata: Stripe.Metadata | null | undefined): string | null {
  return metadataValue(metadata, 'subject_id') ?? metadataValue(metadata, 'subjectId');
}

function creditsFromMetadata(metadata: Stripe.Metadata | null | undefined, product: StripeProduct): number {
  const parsed = Number(metadataValue(metadata, 'credits'));
  if (Number.isInteger(parsed) && parsed > 0) return parsed;
  return stripeProductConfig(product).credits ?? 0;
}

function subscriptionValidUntil(subscription: Stripe.Subscription): string | null {
  const currentPeriodEnd = (subscription as unknown as { current_period_end?: unknown }).current_period_end;
  return typeof currentPeriodEnd === 'number' && currentPeriodEnd > 0
    ? new Date(currentPeriodEnd * 1000).toISOString()
    : null;
}

function entitlementStatus(status: Stripe.Subscription.Status): EntitlementStatus {
  switch (status) {
    case 'active':
      return 'active';
    case 'trialing':
      return 'trialing';
    case 'past_due':
      return 'past_due';
    case 'canceled':
    case 'unpaid':
    case 'incomplete':
    case 'incomplete_expired':
    case 'paused':
      return 'canceled';
    default:
      return 'canceled';
  }
}

function metadataSummary(event: Stripe.Event): Record<string, unknown> {
  return {
    type: event.type,
    livemode: event.livemode,
    object: event.data.object.object,
  };
}

async function fulfillCheckoutSession(session: Stripe.Checkout.Session, repository: PaymentRepository): Promise<string> {
  const metadata = session.metadata;
  const subjectId = subjectFromMetadata(metadata);
  const product = productFromMetadata(metadata);
  if (!subjectId || !product) return 'checkout_missing_metadata';

  const customerId = stripeId(session.customer);
  await repository.upsertBillingUser({ subjectId, stripeCustomerId: customerId });

  if (product === 'report_pack') {
    await repository.recordCreditLedgerEntry({
      subjectId,
      direction: 'credit',
      creditsDelta: creditsFromMetadata(metadata, product),
      reason: 'stripe_report_pack',
      externalRef: `stripe:checkout:${session.id}`,
      metadata: { checkout_session_id: session.id, product, customer_id: customerId },
    });
    return 'report_pack_credited';
  }

  const subscriptionId = stripeId(session.subscription);
  if (!subscriptionId) return 'checkout_subscription_missing';

  await repository.upsertEntitlementForExternalRef({
    subjectId,
    capability: 'premium',
    source: 'stripe',
    status: 'active',
    externalRef: `stripe:subscription:${subscriptionId}`,
    validUntil: null,
    metadata: { checkout_session_id: session.id, product, customer_id: customerId, subscription_id: subscriptionId },
  });
  return 'subscription_entitlement_granted';
}

async function fulfillSubscription(subscription: Stripe.Subscription, repository: PaymentRepository): Promise<string> {
  const metadata = subscription.metadata;
  const subjectId = subjectFromMetadata(metadata);
  const product = productFromMetadata(metadata);
  if (!subjectId || product === 'report_pack') return 'subscription_missing_metadata';

  await repository.upsertBillingUser({ subjectId, stripeCustomerId: stripeId(subscription.customer) });
  await repository.upsertEntitlementForExternalRef({
    subjectId,
    capability: 'premium',
    source: 'stripe',
    status: entitlementStatus(subscription.status),
    externalRef: `stripe:subscription:${subscription.id}`,
    validUntil: subscriptionValidUntil(subscription),
    metadata: { product, subscription_id: subscription.id, customer_id: stripeId(subscription.customer) },
  });
  return 'subscription_entitlement_updated';
}

function fulfillmentAction(event: Stripe.Event, repository: PaymentRepository): FulfillmentAction | null {
  switch (event.type) {
    case 'checkout.session.completed':
      return () => fulfillCheckoutSession(event.data.object as Stripe.Checkout.Session, repository);
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      return () => fulfillSubscription(event.data.object as Stripe.Subscription, repository);
    default:
      return null;
  }
}

export interface StripePaymentFulfillmentResult extends StripeFulfillmentResult {
  token?: string;
  expiresAt?: string;
  capabilities?: string[];
}

export async function fulfillStripeEvent(event: Stripe.Event, repository: PaymentRepository): Promise<StripeFulfillmentResult> {
  const claim = await repository.claimPaymentEvent('stripe', event.id, event.type, metadataSummary(event));
  if (claim === 'duplicate_processed') {
    return { status: 'duplicate', action: 'already_processed' };
  }
  if (claim === 'duplicate_processing') {
    return { status: 'retry', action: 'already_processing' };
  }

  try {
    const action = fulfillmentAction(event, repository);
    if (!action) {
      await repository.markPaymentEventProcessed('stripe', event.id, { ignored: true, type: event.type });
      return { status: 'ignored', action: 'unsupported_event_type' };
    }

    const actionName = await action();
    await repository.markPaymentEventProcessed('stripe', event.id, { action: actionName, type: event.type });
    return { status: 'processed', action: actionName };
  } catch (error) {
    await repository.releasePaymentEventClaim('stripe', event.id);
    throw error;
  }
}

/**
 * Fulfill a Stripe payment event and generate a premium access token
 * for checkout.session.completed events.
 *
 * Call this from the webhook handler instead of fulfillStripeEvent to
 * receive a 30-day access token that can be returned to the frontend
 * for immediate premium access before database-backed entitlements sync.
 */
export async function fulfillStripePayment(
  event: Stripe.Event,
  repository: PaymentRepository,
): Promise<StripePaymentFulfillmentResult> {
  const result = await fulfillStripeEvent(event, repository);

  // Generate a 30-day access token for successful checkout completions
  if (result.status === 'processed' && event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const subjectId = subjectFromMetadata(session.metadata);
    if (subjectId) {
      const capabilities = ['premium', 'ai_reports'];
      const ttlHours = 720; // 30 days
      const token = createAccessToken(subjectId, capabilities, ttlHours);

      // Decode to get the precise expiresAt timestamp
      const encoded = token.split('.')[1];
      const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString());

      return {
        ...result,
        token,
        expiresAt: new Date(payload.expiresAt).toISOString(),
        capabilities,
      };
    }
  }

  return result;
}
