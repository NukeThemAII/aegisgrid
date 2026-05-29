import { NextResponse } from 'next/server';
import { getDefaultAppRepository } from '@/lib/db/app-repository';
import { isDatabaseConfigured } from '@/lib/db/postgres';
import { isStripeConfigured, stripeLiveModeExpected } from '@/lib/payments/payment-config';
import { constructStripeWebhookEvent } from '@/lib/payments/stripe-client';
import { fulfillStripePayment } from '@/lib/payments/stripe-fulfillment';

export const runtime = 'nodejs';

const MAX_WEBHOOK_BYTES = 256 * 1024;

function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

export async function POST(req: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({
      error: 'Database persistence is required before Stripe webhooks can be enabled.',
      code: 'BILLING_DATABASE_REQUIRED',
    }, { status: 503 });
  }

  if (!isStripeConfigured()) {
    return NextResponse.json({
      error: 'Stripe webhook handling is not configured.',
      code: 'STRIPE_WEBHOOK_NOT_CONFIGURED',
    }, { status: 503 });
  }

  const signature = req.headers.get('stripe-signature')?.trim();
  if (!signature) {
    return NextResponse.json({
      error: 'Stripe signature header is required.',
      code: 'STRIPE_SIGNATURE_REQUIRED',
    }, { status: 400 });
  }

  const payload = await req.text();
  if (byteLength(payload) > MAX_WEBHOOK_BYTES) {
    return NextResponse.json({
      error: 'Stripe webhook payload is too large.',
      code: 'STRIPE_PAYLOAD_TOO_LARGE',
    }, { status: 413 });
  }

  let event;
  try {
    event = constructStripeWebhookEvent(payload, signature);
  } catch {
    return NextResponse.json({
      error: 'Stripe webhook signature verification failed.',
      code: 'STRIPE_SIGNATURE_INVALID',
    }, { status: 400 });
  }

  if (event.livemode !== stripeLiveModeExpected()) {
    return NextResponse.json({
      error: 'Stripe event mode does not match deployment configuration.',
      code: 'STRIPE_MODE_MISMATCH',
    }, { status: 400 });
  }

  try {
    const result = await fulfillStripePayment(event, getDefaultAppRepository());
    if (result.status === 'retry') {
      return NextResponse.json({ ok: false, status: result.status, action: result.action }, {
        status: 503,
        headers: { 'Cache-Control': 'no-store', 'Retry-After': '30' },
      });
    }
    return NextResponse.json({
      ok: true,
      status: result.status,
      action: result.action,
      ...(result.token ? {
        token: result.token,
        expiresAt: result.expiresAt,
        capabilities: result.capabilities,
      } : {}),
    }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch {
    return NextResponse.json({
      error: 'Stripe webhook fulfillment failed; Stripe may retry delivery.',
      code: 'STRIPE_FULFILLMENT_FAILED',
    }, { status: 500 });
  }
}
