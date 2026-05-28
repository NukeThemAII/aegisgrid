/**
 * AEGISGRID — Premium Status Endpoint
 *
 * Reports which premium features are configured and which are missing.
 * Frontend uses this to show proper UI: Upgrade buttons when configured,
 * setup instructions when not, and graceful fallback in all states.
 *
 * No authentication required — this is a public readiness check.
 * Does NOT expose secret keys, only boolean configured/not status.
 */

import { NextResponse } from 'next/server';

export async function GET() {
  const stripeConfigured = Boolean(
    process.env.STRIPE_SECRET_KEY &&
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY &&
    process.env.STRIPE_WEBHOOK_SECRET &&
    process.env.STRIPE_PRICE_PRO_MONTHLY,
  );

  const stripeLiveMode = process.env.STRIPE_LIVE_MODE === 'true';

  const x402Configured = Boolean(
    (process.env.X402_ENABLED === 'true' || process.env.FEATURE_X402 === 'true') &&
    process.env.X402_RECEIVING_ADDRESS &&
    process.env.X402_FACILITATOR_URL,
  );

  const aiConfigured = Boolean(
    process.env.FEATURE_AI_REPORTS === 'true' && (
      process.env.AI_PROVIDER === 'deterministic' ||
      (process.env.AI_PROVIDER === 'openai' && process.env.OPENAI_API_KEY) ||
      (process.env.AI_PROVIDER === 'deepseek' && process.env.DEEPSEEK_API_KEY) ||
      (process.env.AI_PROVIDER === 'gemini' && process.env.GEMINI_API_KEY) ||
      (process.env.AI_PROVIDER === 'hermes' && process.env.HERMES_API_KEY && process.env.HERMES_API_URL)
    ),
  );

  const premiumEnabled = process.env.FEATURE_PREMIUM === 'true';

  const authConfigured = Boolean(
    process.env.AUTH_USER_TOKENS ||
    process.env.AUTH_GITHUB_ID ||
    process.env.AUTH_GOOGLE_ID,
  );

  const dbConfigured = Boolean(process.env.DATABASE_URL);

  return NextResponse.json({
    status: 'ok',
    premium_enabled: premiumEnabled,
    features: {
      stripe: {
        configured: stripeConfigured,
        live_mode: stripeLiveMode,
        // What's needed for stripe to work
        missing: stripeConfigured ? [] : [
          !process.env.STRIPE_SECRET_KEY && 'STRIPE_SECRET_KEY',
          !process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY && 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
          !process.env.STRIPE_WEBHOOK_SECRET && 'STRIPE_WEBHOOK_SECRET',
          !process.env.STRIPE_PRICE_PRO_MONTHLY && 'STRIPE_PRICE_PRO_MONTHLY',
        ].filter(Boolean),
      },
      x402: {
        configured: x402Configured,
        missing: x402Configured ? [] : [
          (!process.env.X402_ENABLED && !process.env.FEATURE_X402) && 'X402_ENABLED or FEATURE_X402',
          !process.env.X402_RECEIVING_ADDRESS && 'X402_RECEIVING_ADDRESS',
          !process.env.X402_FACILITATOR_URL && 'X402_FACILITATOR_URL',
        ].filter(Boolean),
      },
      ai_reports: {
        configured: aiConfigured,
        provider: process.env.AI_PROVIDER || 'none',
        missing: aiConfigured ? [] : [
          process.env.FEATURE_AI_REPORTS !== 'true' && 'FEATURE_AI_REPORTS=true',
          process.env.AI_PROVIDER === 'openai' && !process.env.OPENAI_API_KEY && 'OPENAI_API_KEY',
          process.env.AI_PROVIDER === 'hermes' && !process.env.HERMES_API_KEY && 'HERMES_API_KEY',
          process.env.AI_PROVIDER === 'hermes' && !process.env.HERMES_API_URL && 'HERMES_API_URL',
        ].filter(Boolean),
      },
    },
    infrastructure: {
      database: dbConfigured,
      auth: authConfigured,
    },
    next_steps: !premiumEnabled
      ? 'Set FEATURE_PREMIUM=true in .env.local to enable premium features, then configure Stripe and/or x402.'
      : !stripeConfigured && !x402Configured
        ? 'Premium is enabled but no payment provider is configured. Set STRIPE_SECRET_KEY and related vars for Stripe, or X402_RECEIVING_ADDRESS for USDC payments.'
        : 'Premium is partially configured. Check the features.missing arrays above for what still needs setup.',
  }, {
    headers: {
      'Cache-Control': 'no-store',
    },
  });
}
