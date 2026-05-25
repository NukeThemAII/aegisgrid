import Stripe from 'stripe';
import { resolveAppUrl, stripeProductConfig, type StripeProduct } from './payment-config';

export interface CheckoutSessionInput {
  subjectId: string;
  product: StripeProduct;
  successPath: string;
  cancelPath: string;
  request: Request;
}

export interface CheckoutSessionResult {
  id: string;
  url: string;
}

export interface PortalSessionInput {
  customerId: string;
  returnPath: string;
  request: Request;
}

export interface PortalSessionResult {
  id: string;
  url: string;
}

let stripeClient: Stripe | null = null;

function stripeSecretKey(): string {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) throw new Error('STRIPE_SECRET_KEY is not configured');
  return key;
}

function webhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET is not configured');
  return secret;
}

export function getStripeClient(): Stripe {
  if (!stripeClient) {
    stripeClient = new Stripe(stripeSecretKey(), {
      appInfo: {
        name: 'AegisGrid',
        version: '0.1.0',
        url: 'https://github.com/NukeThemAII/aegisgrid',
      },
    });
  }
  return stripeClient;
}

export async function createCheckoutSession(input: CheckoutSessionInput): Promise<CheckoutSessionResult> {
  const product = stripeProductConfig(input.product);
  if (!product.priceId) throw new Error(`Stripe price is not configured for ${input.product}`);

  const baseUrl = resolveAppUrl(input.request);
  const successUrl = new URL(input.successPath, baseUrl).toString();
  const cancelUrl = new URL(input.cancelPath, baseUrl).toString();
  const metadata = {
    subject_id: input.subjectId,
    product: input.product,
    ...(product.credits ? { credits: String(product.credits) } : {}),
  };

  const session = await getStripeClient().checkout.sessions.create({
    mode: product.mode,
    line_items: [{ price: product.priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    client_reference_id: input.subjectId,
    metadata,
    ...(product.mode === 'subscription' ? { subscription_data: { metadata } } : {}),
  });

  if (!session.url) throw new Error('Stripe did not return a checkout URL');
  return { id: session.id, url: session.url };
}

export async function createPortalSession(input: PortalSessionInput): Promise<PortalSessionResult> {
  const returnUrl = new URL(input.returnPath, resolveAppUrl(input.request)).toString();
  const session = await getStripeClient().billingPortal.sessions.create({
    customer: input.customerId,
    return_url: returnUrl,
  });
  return { id: session.id, url: session.url };
}

export function constructStripeWebhookEvent(payload: string, signature: string): Stripe.Event {
  return getStripeClient().webhooks.constructEvent(payload, signature, webhookSecret());
}
