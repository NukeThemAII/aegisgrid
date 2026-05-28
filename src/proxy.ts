import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * AegisGrid — Next.js Proxy (Middleware)
 *
 * Next.js 16 uses `proxy.ts` instead of the legacy `middleware.ts`.
 * This module handles:
 *  1. Security headers on ALL responses (pages + API).
 *  2. Rate limiting for /api/* routes.
 *
 * NOTE — Content-Security-Policy is intentionally deferred.
 * The app relies on MapLibre GL (WebGL, blob:, data:, tile servers),
 * YouTube embeds, HLS.js streams, external fonts (fonts.googleapis.com,
 * fonts.gstatic.com), and Vercel Analytics. A correct CSP policy
 * requires auditing every external origin the client loads. This will
 * be addressed in a dedicated hardening pass (see AGENTS.md §15).
 */

// ── Rate Limiting ───────────────────────────────────────────────

// In-memory store for rate limiting.
// Note: in Edge/serverless environments this is per-isolate.
// For fully distributed limiting, Redis/Vercel KV should be used.
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 100;

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
