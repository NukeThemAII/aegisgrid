import type { AppSubject } from '@/lib/auth/app-auth';

export type PremiumCapability = 'ai_report' | 'api_access' | 'premium';

export interface PremiumAccessDecision {
  allowed: boolean;
  status: number;
  code: 'OK' | 'AUTH_REQUIRED' | 'PREMIUM_DISABLED' | 'ENTITLEMENT_REQUIRED' | 'BILLING_CHECK_FAILED';
  reason: string;
  source: 'admin' | 'static_entitlement' | 'none' | 'error';
}

function flagEnabled(value: string | undefined): boolean {
  return value === 'true';
}

function hasEntitlement(subject: AppSubject, capability: PremiumCapability): boolean {
  if (subject.entitlements.includes('*')) return true;
  if (subject.entitlements.includes('premium')) return true;
  return subject.entitlements.includes(capability);
}

function hasAnyPaidProviderConfigured(): boolean {
  const stripeConfigured = Boolean(
    process.env.STRIPE_SECRET_KEY?.trim()
      && (process.env.STRIPE_PRICE_PRO_MONTHLY?.trim() || process.env.STRIPE_PRICE_REPORT_PACK?.trim()),
  );
  const x402Configured = flagEnabled(process.env.X402_ENABLED) && Boolean(
    process.env.X402_RECEIVING_ADDRESS?.trim() && process.env.X402_FACILITATOR_URL?.trim(),
  );
  return stripeConfigured || x402Configured;
}

export async function verifyPremiumAccess(
  subject: AppSubject,
  capability: PremiumCapability,
): Promise<PremiumAccessDecision> {
  try {
    if (subject.role === 'anonymous' || !subject.subjectId) {
      return {
        allowed: false,
        status: 401,
        code: 'AUTH_REQUIRED',
        reason: 'Authentication is required for premium AegisGrid features.',
        source: 'none',
      };
    }

    if (subject.role === 'admin') {
      return {
        allowed: true,
        status: 200,
        code: 'OK',
        reason: 'Admin subject authorized.',
        source: 'admin',
      };
    }

    if (!flagEnabled(process.env.FEATURE_PREMIUM)) {
      return {
        allowed: false,
        status: 403,
        code: 'PREMIUM_DISABLED',
        reason: 'Premium features are disabled on this deployment.',
        source: 'none',
      };
    }

    if (hasEntitlement(subject, capability)) {
      return {
        allowed: true,
        status: 200,
        code: 'OK',
        reason: 'Static entitlement authorized the request.',
        source: 'static_entitlement',
      };
    }

    // Stripe and x402 verification will be wired after database-backed
    // entitlement persistence exists. Until then, configured providers never
    // cause a fail-open approval; they only affect operator status metadata.
    hasAnyPaidProviderConfigured();

    return {
      allowed: false,
      status: 402,
      code: 'ENTITLEMENT_REQUIRED',
      reason: 'No active premium entitlement was found for this subject.',
      source: 'none',
    };
  } catch {
    return {
      allowed: false,
      status: 402,
      code: 'BILLING_CHECK_FAILED',
      reason: 'Billing verification failed closed.',
      source: 'error',
    };
  }
}
