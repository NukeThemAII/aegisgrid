import type { AppSubject } from '@/lib/auth/app-auth';
import type { AppRepository, PremiumCapability } from '@/lib/db/app-repository';
import { getDefaultAppRepository } from '@/lib/db/app-repository';
import { isDatabaseConfigured } from '@/lib/db/postgres';

export type { PremiumCapability };

export interface PremiumAccessDecision {
  allowed: boolean;
  status: number;
  code: 'OK' | 'AUTH_REQUIRED' | 'PREMIUM_DISABLED' | 'ENTITLEMENT_REQUIRED' | 'BILLING_CHECK_FAILED';
  reason: string;
  source: 'admin' | 'db_entitlement' | 'static_entitlement' | 'none' | 'error';
}

export interface PremiumAccessOptions {
  repository?: Pick<AppRepository, 'findActiveEntitlement'>;
  now?: Date;
}

function flagEnabled(value: string | undefined): boolean {
  return value === 'true';
}

function hasEntitlement(subject: AppSubject, capability: PremiumCapability): boolean {
  if (subject.entitlements.includes('*')) return true;
  if (subject.entitlements.includes('premium')) return true;
  return subject.entitlements.includes(capability);
}

function staticFallbackAllowed(): boolean {
  if (!isDatabaseConfigured() && process.env.AUTH_STATIC_ENTITLEMENTS_FALLBACK === 'true') return true;
  return false;
}

function databaseRepository(options: PremiumAccessOptions): Pick<AppRepository, 'findActiveEntitlement'> | null {
  if (!isDatabaseConfigured()) return null;
  return options.repository ?? getDefaultAppRepository();
}

export async function verifyPremiumAccess(
  subject: AppSubject,
  capability: PremiumCapability,
  options: PremiumAccessOptions = {},
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

    const repository = databaseRepository(options);
    if (repository) {
      const entitlement = await repository.findActiveEntitlement(
        subject.subjectId,
        capability,
        options.now ?? new Date(),
      );
      if (entitlement) {
        return {
          allowed: true,
          status: 200,
          code: 'OK',
          reason: 'Database entitlement authorized the request.',
          source: 'db_entitlement',
        };
      }
    }

    if (staticFallbackAllowed() && hasEntitlement(subject, capability)) {
      return {
        allowed: true,
        status: 200,
        code: 'OK',
        reason: 'Static entitlement authorized the request.',
        source: 'static_entitlement',
      };
    }

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
