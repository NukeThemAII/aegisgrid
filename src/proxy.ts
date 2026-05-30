import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * AegisGrid — Next.js Proxy (Middleware)
 *
 * Next.js 16 uses `proxy.ts` instead of the legacy `middleware.ts`.
 * This module handles:
 *  1. CSRF protection for state-changing API routes.
 *  2. Security headers on ALL responses (pages + API).
 *  3. Rate limiting for /api/* routes.
 */

// ── Rate Limiting ───────────────────────────────────────────────

// In-memory store for rate limiting.
// Note: in Edge/serverless environments this is per-isolate.
// For fully distributed limiting, Redis/Vercel KV should be used.
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 100;

// ── CSRF Protection ──────────────────────────────────────────────

/** Paths exempt from CSRF — webhooks and auth callbacks. */
const CSRF_EXEMPT_PREFIXES = [
  '/api/billing/webhook',  // Stripe signature verification
  '/api/x402/report',      // x402 protocol settlement
  '/api/x402/enrich',      // x402 protocol settlement
  '/api/auth',             // Auth.js handles its own CSRF
];

function isCsrfExempt(pathname: string): boolean {
  return CSRF_EXEMPT_PREFIXES.some(prefix => pathname.startsWith(prefix));
}

/** Validate Origin/Referer for state-changing requests. */
function validateCsrf(request: NextRequest): { allowed: boolean; reason?: string } {
  const method = request.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return { allowed: true };
  }

  const origin = request.headers.get('origin');
  const referer = request.headers.get('referer');

  // Allow same-origin requests (Origin matches our app URL)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const allowedOrigins = [
    appUrl,
    'http://94.16.122.69:3004',
    'http://94.16.122.69:3000',
    'https://cipherops.shop:3443',
    'https://cipherops.shop',
  ];

  const checkOrigin = (val: string | null): boolean => {
    if (!val) return false;
    try {
      const u = new URL(val);
      // Compare without port for flexibility (covers 3443, 3004, etc.)
      const originBase = `${u.protocol}//${u.hostname}${u.port ? ':' + u.port : ''}`;
      return allowedOrigins.some(a => {
        try {
          const au = new URL(a);
          const allowedBase = `${au.protocol}//${au.hostname}${au.port ? ':' + au.port : ''}`;
          return originBase === allowedBase;
        } catch { return false; }
      });
    } catch { return false; }
  };

  if (origin && checkOrigin(origin)) return { allowed: true };
  if (referer && checkOrigin(referer)) return { allowed: true };

  // Allow the request's own host as a valid origin (self-referencing)
  const reqHost = request.headers.get('host');
  if (reqHost && (origin || referer)) {
    try {
      const originUrl = new URL(origin || referer || '');
      if (originUrl.hostname === reqHost.split(':')[0]) return { allowed: true };
    } catch {}
  }

  // Server-to-server requests (no Origin/Referer, JSON content-type): allow
  const contentType = request.headers.get('content-type') || '';
  if (!origin && !referer && contentType.includes('application/json')) {
    return { allowed: true };
  }

  // No Origin, no Referer, not JSON — block form-encoded CSRF attempts
  return {
    allowed: false,
    reason: 'CSRF validation failed. Use the application UI to make state-changing requests.',
  };
}

// ── Security Headers ────────────────────────────────────────────

/** Apply security headers to every response. */
function applySecurityHeaders(
  response: NextResponse,
  request: NextRequest,
): void {
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set(
    'Referrer-Policy',
    'strict-origin-when-cross-origin',
  );
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(self)',
  );
  response.headers.set('X-DNS-Prefetch-Control', 'off');

  // HSTS only makes sense over real TLS — skip for localhost / dev.
  const host = request.headers.get('host') ?? '';
  const isLocalhost =
    host.startsWith('localhost') || host.startsWith('127.0.0.1');

  if (!isLocalhost) {
    response.headers.set(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains',
    );
  }
}

// ── Proxy Entry Point ───────────────────────────────────────────

export function proxy(request: NextRequest) {
  const isApiRoute = request.nextUrl.pathname.startsWith('/api');

  // Non-API routes: pass through with security headers only.
  if (!isApiRoute) {
    const response = NextResponse.next();
    applySecurityHeaders(response, request);
    return response;
  }

  // ── API Rate Limiting ──
  // CSRF check for state-changing methods (before rate limit)
  if (!isCsrfExempt(request.nextUrl.pathname)) {
    const csrf = validateCsrf(request);
    if (!csrf.allowed) {
      const response = new NextResponse(
        JSON.stringify({ error: 'csrf_validation_failed', message: csrf.reason }),
        { status: 403, headers: { 'Content-Type': 'application/json' } },
      );
      applySecurityHeaders(response, request);
      return response;
    }
  }

  // Use proxy-provided headers when deployed behind Vercel or another trusted
  // reverse proxy. Local/custom deployments fall back to `unknown`.
  const forwarded = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip')?.trim();
  const ip = realIp || (forwarded ? forwarded.split(',')[0].trim() : 'unknown');
  const now = Date.now();

  let limitData = rateLimitMap.get(ip);

  // Clean up expired entry
  if (limitData && now > limitData.resetTime) {
    limitData = undefined;
  }

  if (!limitData) {
    limitData = { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS };
    rateLimitMap.set(ip, limitData);
  } else {
    limitData.count++;
  }

  // Periodic cleanup of the Map to prevent memory leaks in long-running isolates
  if (Math.random() < 0.01) { // 1% chance to run cleanup on request
    for (const [key, value] of rateLimitMap.entries()) {
      if (now > value.resetTime) {
        rateLimitMap.delete(key);
      }
    }
  }

  if (limitData.count > MAX_REQUESTS_PER_WINDOW) {
    const retryAfter = Math.ceil((limitData.resetTime - now) / 1000);
    const response = new NextResponse(
      JSON.stringify({
        error: 'Too Many Requests',
        code: 'RATE_LIMIT_EXCEEDED',
        message: `Rate limit exceeded. Try again in ${retryAfter} seconds.`,
      }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': retryAfter.toString(),
        },
      }
    );
    // Security headers on 429 responses too
    applySecurityHeaders(response, request);
    return response;
  }

  const response = NextResponse.next();

  // Attach rate limit headers
  response.headers.set('X-RateLimit-Limit', MAX_REQUESTS_PER_WINDOW.toString());
  response.headers.set('X-RateLimit-Remaining', Math.max(0, MAX_REQUESTS_PER_WINDOW - limitData.count).toString());
  response.headers.set('X-RateLimit-Reset', limitData.resetTime.toString());

  // Security headers on all API responses
  applySecurityHeaders(response, request);

  return response;
}

export const config = {
  matcher: '/api/:path*',
};
