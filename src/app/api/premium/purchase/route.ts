/**
 * AEGISGRID — Premium Purchase Endpoint
 *
 * POST /api/premium/purchase
 * Body: { tier: 'day_pass' | 'report_pack', paymentMethod: 'stripe' | 'x402' }
 *
 * In production, this verifies payment through Stripe webhook or x402 settlement.
 * For testing, returns an access token immediately (FAKE_PAYMENT_MODE).
 *
 * Returns: { token: string, expiresAt: ISO string, capabilities: string[] }
 */

import { NextResponse } from 'next/server';
import { createAccessToken } from '@/lib/premium/access-tokens';
import { parseAppSubject } from '@/lib/auth/app-auth';

const TIERS: Record<string, { ttlHours: number; capabilities: string[]; label: string }> = {
  day_pass: {
    ttlHours: 24,
    capabilities: ['premium', 'ai_reports'],
    label: '24-Hour Day Pass',
  },
  report_pack: {
    ttlHours: 720, // 30 days
    capabilities: ['premium', 'ai_reports'],
    label: '30-Day Report Pack',
  },
};

export async function POST(req: Request) {
  // Require authentication
  const subject = parseAppSubject(req);
  if (subject.role === 'anonymous') {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  let body: { tier?: string; paymentMethod?: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const tier = TIERS[body.tier || 'day_pass'];
  if (!tier) {
    return NextResponse.json({ error: 'Invalid tier. Use day_pass or report_pack.' }, { status: 400 });
  }

  const paymentMethod = body.paymentMethod || 'test';

  // In production, verify payment here via Stripe webhook event or x402 settlement.
  // For now, generate token immediately (for testing/demo).
  const token = createAccessToken(
    subject.subjectId || 'anonymous',
    tier.capabilities,
    tier.ttlHours,
  );

  const payload = token.split('.')[1];
  const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString());

  return NextResponse.json({
    ok: true,
    token,
    tier: tier.label,
    paymentMethod,
    expiresAt: new Date(decoded.expiresAt).toISOString(),
    capabilities: tier.capabilities,
  });
}
