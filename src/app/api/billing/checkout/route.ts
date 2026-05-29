import { NextResponse } from 'next/server';
import { parseAppSubject } from '@/lib/auth/app-auth';
import { isDatabaseConfigured } from '@/lib/db/postgres';
import { parseCheckoutRequest, isStripeCheckoutConfigured } from '@/lib/payments/payment-config';
import { createCheckoutSession } from '@/lib/payments/stripe-client';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  // Allow anonymous checkout — Stripe handles payment collection.
  // The webhook auto-grants access after successful payment.
  const subject = parseAppSubject(req);
  const subjectId = subject.subjectId || `anon_${Date.now()}`;

  // Database is optional for checkout — webhook fulfillment needs it
  if (!isDatabaseConfigured()) {
    // Allow checkout without DB — purchase flow handles token generation
  }

  let input: unknown;
  try {
    input = await req.json();
  } catch {
    return NextResponse.json({
      error: 'Request body must be valid JSON.',
      code: 'INVALID_JSON',
    }, { status: 400 });
  }

  const parsed = parseCheckoutRequest(input);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error, code: parsed.code }, { status: 400 });
  }

  if (!isStripeCheckoutConfigured(parsed.value.product)) {
    return NextResponse.json({
      error: 'Stripe checkout is not configured for this product.',
      code: 'STRIPE_CHECKOUT_NOT_CONFIGURED',
    }, { status: 503 });
  }

  try {
    const checkout = await createCheckoutSession({
      subjectId: subjectId,
      product: parsed.value.product,
      successPath: parsed.value.successPath,
      cancelPath: parsed.value.cancelPath,
      request: req,
    });
    return NextResponse.json({ ok: true, checkout }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({
      error: 'Stripe checkout session creation failed.',
      code: 'STRIPE_CHECKOUT_FAILED',
    }, { status: 502 });
  }
}
