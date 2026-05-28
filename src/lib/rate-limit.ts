/**
 * AEGISGRID — Per-Route Rate Limiter
 *
 * In-memory sliding-window rate limiter for API routes. Shares the same
 * design as the SSRF guard's rate limiter but adds route-aware config,
 * 429 responses with Retry-After headers, and identifier extraction.
 *
 * IMPORTANT: This is per-process (not shared across instances). For
 * production multi-instance deployments, replace with Redis-backed
 * counting once the Redis job queue foundation is in place.
 */

import { NextResponse } from 'next/server';

// ── Types ───────────────────────────────────────────────────────────

export interface RateLimitConfig {
  /** Unique key for this route (e.g. 'earthquakes', 'flights') */
  route: string;
  /** Max requests allowed in the window */
  maxRequests: number;
  /** Window duration in milliseconds */
  windowMs: number;
}

interface RateEntry {
  count: number;
  resetAt: number;
}

// ── State ───────────────────────────────────────────────────────────

const rateMap = new Map<string, RateEntry>();

// Periodic cleanup to prevent memory leak from abandoned keys
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateMap) {
    if (now > entry.resetAt) rateMap.delete(key);
  }
}, 60_000).unref(); // don't keep the process alive

// ── Public API ──────────────────────────────────────────────────────

/**
 * Check whether a request should be rate-limited.
 * Returns `{ allowed: true }` or `{ allowed: false, retryAfter: number }`.
 */
export function checkRateLimit(
  config: RateLimitConfig,
  identifier: string,
): { allowed: true } | { allowed: false; retryAfter: number } {
  const now = Date.now();
  const key = `${config.route}:${identifier}`;
  const entry = rateMap.get(key);

  if (!entry || now > entry.resetAt) {
    rateMap.set(key, { count: 1, resetAt: now + config.windowMs });
    return { allowed: true };
  }

  entry.count++;
  if (entry.count > config.maxRequests) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    return { allowed: false, retryAfter };
  }

  return { allowed: true };
}

/**
 * Extract a rate-limit identifier from a Request.
 * Uses X-Forwarded-For (first entry), X-Real-IP, or falls back to 'unknown'.
 */
export function getRateLimitIdentifier(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  return forwarded?.split(',')[0]?.trim()
    || req.headers.get('x-real-ip')
    || 'unknown';
}

/**
 * Convenience: check rate limit and return a 429 response if exceeded.
 * Returns null if the request is allowed (caller proceeds normally).
 */
export function enforceRateLimit(
  config: RateLimitConfig,
  req: Request,
): NextResponse | null {
  const identifier = getRateLimitIdentifier(req);
  const result = checkRateLimit(config, identifier);

  if (!result.allowed) {
    return NextResponse.json(
      {
        error: 'too_many_requests',
        message: `Rate limit exceeded for ${config.route}. Try again in ${result.retryAfter}s.`,
        retryAfter: result.retryAfter,
      },
      {
        status: 429,
        headers: {
          'Retry-After': String(result.retryAfter),
        },
      },
    );
  }

  return null;
}

// ── Preset Configs ──────────────────────────────────────────────────

/**
 * Default rate limits per route — tuned for free-tier upstream APIs.
 * These are generous for single-user dashboards; tighten for production.
 */
export const RATE_LIMITS = {
  earthquakes:   { route: 'earthquakes',   maxRequests: 30,  windowMs: 60_000 },  // USGS — free, generous
  fires:         { route: 'fires',         maxRequests: 20,  windowMs: 60_000 },  // NASA FIRMS — keyless CSV
  flights:       { route: 'flights',       maxRequests: 20,  windowMs: 60_000 },  // OpenSky — limited free tier
  satellites:    { route: 'satellites',    maxRequests: 20,  windowMs: 60_000 },  // CelesTrak — free
  'space-weather': { route: 'space-weather', maxRequests: 30, windowMs: 60_000 }, // NOAA SWPC — free
  gdelt:         { route: 'gdelt',         maxRequests: 15,  windowMs: 60_000 },  // GDELT — free but heavy
  news:          { route: 'news',          maxRequests: 20,  windowMs: 60_000 },  // RSS feeds — lightweight
  weather:       { route: 'weather',       maxRequests: 30,  windowMs: 60_000 },  // Open-Meteo — free
  'air-quality': { route: 'air-quality',   maxRequests: 20,  windowMs: 60_000 },  // OpenAQ — free tier
  maritime:      { route: 'maritime',      maxRequests: 20,  windowMs: 60_000 },
  cctv:          { route: 'cctv',          maxRequests: 15,  windowMs: 60_000 },
  'cyber-threats': { route: 'cyber-threats', maxRequests: 15, windowMs: 60_000 },
  'live-news':   { route: 'live-news',     maxRequests: 15,  windowMs: 60_000 },
  'country-risk':{ route: 'country-risk',  maxRequests: 20,  windowMs: 60_000 },
  'region-dossier':{ route: 'region-dossier', maxRequests: 15, windowMs: 60_000 },
  markets:       { route: 'markets',       maxRequests: 20,  windowMs: 60_000 },
  sentinel:      { route: 'sentinel',      maxRequests: 10,  windowMs: 60_000 },  // satellite imagery — heavier
  infrastructure:{ route: 'infrastructure', maxRequests: 20, windowMs: 60_000 },   // static data
  frontlines:    { route: 'frontlines',    maxRequests: 20,  windowMs: 60_000 },   // static/curated
  osint:         { route: 'osint',         maxRequests: 30,  windowMs: 60_000 },   // passive lookups
} as const satisfies Record<string, RateLimitConfig>;
