/**
 * AEGISGRID — CSRF Protection
 *
 * Lightweight origin/referer validation for state-changing API routes.
 * JSON-only POST/PUT/DELETE routes are already partially protected by
 * CORS preflight, but this adds an explicit origin check as defense-in-depth.
 *
 * Webhook routes (Stripe, x402) are exempt — they use their own signature
 * verification. Auth.js routes are handled by the library.
 */

import { NextResponse } from 'next/server';

// ── Configuration ───────────────────────────────────────────────────

/** Allowed origins. In production, set to your actual domain. */
function getAllowedOrigins(): string[] {
  const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  return [base, 'http://94.16.122.69:3004', 'http://94.16.122.69:3000', 'https://cipherops.shop:3443', 'https://cipherops.shop'];
}

// ── Helpers ─────────────────────────────────────────────────────────

function normalizeOrigin(origin: string): string {
  return origin.replace(/\/$/, '').toLowerCase();
}

function originAllowed(origin: string): boolean {
  const normalized = normalizeOrigin(origin);
  return getAllowedOrigins().some(allowed => normalizeOrigin(allowed) === normalized);
}

function extractOrigin(req: Request): string | null {
  return req.headers.get('origin');
}

function extractReferer(req: Request): string | null {
  const ref = req.headers.get('referer');
  if (!ref) return null;
  try {
    const url = new URL(ref);
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

// ── Public API ──────────────────────────────────────────────────────

export interface CsrfCheckResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Validate that a state-changing request originates from an allowed origin.
 * Returns `{ allowed: true }` or `{ allowed: false, reason: '...' }`.
 *
 * Call this at the top of POST/PUT/DELETE handlers.
 */
export function validateCsrf(req: Request): CsrfCheckResult {
  // GET/HEAD/OPTIONS are safe — skip
  const method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return { allowed: true };
  }

  const origin = extractOrigin(req);
  const referer = extractReferer(req);

  // Browser-originated requests should have an Origin header
  if (origin) {
    if (!originAllowed(origin)) {
      return {
        allowed: false,
        reason: `Origin "${origin}" is not allowed. CSRF check failed. Use the application UI to make state-changing requests.`,
      };
    }
    return { allowed: true };
  }

  // No Origin header — could be a server-to-server request or a same-origin
  // form POST without Origin. Check Referer as fallback.
  if (referer) {
    if (!originAllowed(referer)) {
      return {
        allowed: false,
        reason: `Referer "${referer}" is not allowed. CSRF check failed.`,
      };
    }
    return { allowed: true };
  }

  // No Origin and no Referer — likely server-to-server (e.g., curl, scripts).
  // Allow JSON requests (typical for API clients), block form-encoded.
  const contentType = req.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return { allowed: true };
  }
  return { allowed: false, reason: 'CSRF check: missing Origin and Referer headers for non-JSON request.' };
}

/**
 * Convenience: validate CSRF and return a 403 if check fails.
 * Returns null if allowed (caller proceeds).
 */
export function enforceCsrf(req: Request): NextResponse | null {
  const result = validateCsrf(req);
  if (!result.allowed) {
    return NextResponse.json(
      {
        error: 'csrf_validation_failed',
        message: result.reason,
      },
      { status: 403 },
    );
  }
  return null;
}

/** Routes that skip CSRF — webhooks with their own verification. */
const CSRF_EXEMPT_PATHS = new Set([
  '/api/billing/webhook',
  '/api/x402/report',   // x402 protocol has its own settlement verification
  '/api/x402/enrich',
  '/api/auth',          // Auth.js handles its own CSRF
]);

/**
 * Check if a request path is exempt from CSRF validation.
 */
export function isCsrfExempt(pathname: string): boolean {
  for (const exempt of CSRF_EXEMPT_PATHS) {
    if (pathname.startsWith(exempt)) return true;
  }
  return false;
}
