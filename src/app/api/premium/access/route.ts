/**
 * AEGISGRID — Premium Access Check
 *
 * Called by the /premium page to determine access level.
 * Checks in order: 1) token auth entitlements, 2) DB entitlements,
 * 3) time-limited access tokens, 4) static fallback.
 *
 * Returns { granted: true, source, entitlements } or { granted: false, reason }.
 */

import { NextResponse } from 'next/server';
import { parseAppSubject } from '@/lib/auth/app-auth';
import { verifyPremiumAccess } from '@/lib/billing/guard';
import { verifyAccessToken } from '@/lib/premium/access-tokens';

export async function GET(req: Request) {
  // Check bearer token auth (existing system)
  const subject = parseAppSubject(req);
  if (subject.role !== 'anonymous') {
    const access = await verifyPremiumAccess(subject, 'premium');
    if (access.allowed) {
      return NextResponse.json({
        granted: true,
        source: access.source,
        role: subject.role,
        entitlements: subject.entitlements,
      }, { headers: { 'Cache-Control': 'no-store' } });
    }
  }

  // Check time-limited access token (from x402/Stripe purchase)
  const url = new URL(req.url);
  const accessToken = url.searchParams.get('token');
  if (accessToken) {
    const payload = verifyAccessToken(accessToken);
    if (payload) {
      return NextResponse.json({
        granted: true,
        source: 'access_token',
        role: 'authenticated',
        entitlements: payload.capabilities,
        expiresAt: new Date(payload.expiresAt).toISOString(),
      }, { headers: { 'Cache-Control': 'no-store' } });
    }
    return NextResponse.json({
      granted: false,
      reason: 'access_token_expired_or_invalid',
    }, { headers: { 'Cache-Control': 'no-store' } });
  }

  // Not authenticated, no access token
  return NextResponse.json({
    granted: false,
    reason: 'authentication_required',
    paymentOptions: {
      stripeEnabled: process.env.FEATURE_STRIPE === 'true' || process.env.FEATURE_PREMIUM === 'true',
      x402Enabled: process.env.FEATURE_X402 === 'true' || process.env.X402_ENABLED === 'true',
    },
  }, { headers: { 'Cache-Control': 'no-store' } });
}
