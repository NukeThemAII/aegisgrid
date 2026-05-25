import { NextResponse } from 'next/server';
import { parseAppSubject } from '@/lib/auth/app-auth';
import { getDefaultAppRepository } from '@/lib/db/app-repository';
import { isDatabaseConfigured } from '@/lib/db/postgres';
import { portalReturnPath, isStripeConfiguredForPortal } from '@/lib/payments/portal-config';
import { createPortalSession } from '@/lib/payments/stripe-client';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const subject = parseAppSubject(req);
  if (subject.role === 'anonymous' || !subject.subjectId) {
    return NextResponse.json({ error: 'Authentication is required for billing portal access.', code: 'AUTH_REQUIRED' }, { status: 401 });
  }
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: 'Database persistence is required before billing portal can be enabled.', code: 'BILLING_DATABASE_REQUIRED' }, { status: 503 });
  }
  if (!isStripeConfiguredForPortal()) {
    return NextResponse.json({ error: 'Stripe billing portal is not configured.', code: 'STRIPE_PORTAL_NOT_CONFIGURED' }, { status: 503 });
  }

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const returnPath = portalReturnPath(body);
  if (returnPath === null) {
    return NextResponse.json({ error: 'Return path must be a local absolute path.', code: 'INVALID_RETURN_PATH' }, { status: 400 });
  }

  const customerId = await getDefaultAppRepository().findStripeCustomerId(subject.subjectId);
  if (!customerId) {
    return NextResponse.json({ error: 'No Stripe customer is linked to this subject.', code: 'STRIPE_CUSTOMER_NOT_FOUND' }, { status: 404 });
  }

  try {
    const portal = await createPortalSession({ customerId, returnPath, request: req });
    return NextResponse.json({ ok: true, portal }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Stripe billing portal session creation failed.', code: 'STRIPE_PORTAL_FAILED' }, { status: 502 });
  }
}
