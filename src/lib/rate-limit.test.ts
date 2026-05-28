import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { checkRateLimit, enforceRateLimit, getRateLimitIdentifier, RATE_LIMITS } from '@/lib/rate-limit';

// ── getRateLimitIdentifier ──────────────────────────────────────────

describe('getRateLimitIdentifier', () => {
  function req(headers: Record<string, string>): Request {
    return { headers: new Headers(headers) } as Request;
  }

  it('extracts from x-forwarded-for (first entry)', () => {
    expect(getRateLimitIdentifier(req({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' }))).toBe('1.2.3.4');
  });

  it('falls back to x-real-ip', () => {
    expect(getRateLimitIdentifier(req({ 'x-real-ip': '10.0.0.1' }))).toBe('10.0.0.1');
  });

  it('prefers x-forwarded-for over x-real-ip', () => {
    expect(getRateLimitIdentifier(req({
      'x-forwarded-for': '1.1.1.1',
      'x-real-ip': '2.2.2.2',
    }))).toBe('1.1.1.1');
  });

  it('returns "unknown" when no headers present', () => {
    expect(getRateLimitIdentifier(req({}))).toBe('unknown');
  });

  it('trims whitespace from x-forwarded-for', () => {
    expect(getRateLimitIdentifier(req({ 'x-forwarded-for': '  9.9.9.9  , 8.8.8.8' }))).toBe('9.9.9.9');
  });
});

// ── checkRateLimit ──────────────────────────────────────────────────

describe('checkRateLimit', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const config = { route: 'test-route', maxRequests: 3, windowMs: 60_000 };

  it('allows requests up to the limit', () => {
    for (let i = 0; i < 3; i++) {
      const r = checkRateLimit(config, 'client-a');
      expect(r.allowed).toBe(true);
    }
  });

  it('blocks requests exceeding the limit', () => {
    for (let i = 0; i < 3; i++) checkRateLimit(config, 'client-b');
    const r = checkRateLimit(config, 'client-b');
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.retryAfter).toBeGreaterThan(0);
  });

  it('tracks different identifiers independently', () => {
    for (let i = 0; i < 3; i++) checkRateLimit(config, 'client-c');
    const blocked = checkRateLimit(config, 'client-c');
    expect(blocked.allowed).toBe(false);

    const allowed = checkRateLimit(config, 'client-d');
    expect(allowed.allowed).toBe(true);
  });

  it('resets after the window expires', () => {
    for (let i = 0; i < 3; i++) checkRateLimit(config, 'client-e');
    expect(checkRateLimit(config, 'client-e').allowed).toBe(false);

    vi.advanceTimersByTime(61_000);
    expect(checkRateLimit(config, 'client-e').allowed).toBe(true);
  });

  it('isolates different routes', () => {
    const configB = { route: 'other-route', maxRequests: 1, windowMs: 60_000 };
    checkRateLimit(config, 'client-f');
    checkRateLimit(config, 'client-f');
    // client-f still has room on config (limit 3)
    expect(checkRateLimit(config, 'client-f').allowed).toBe(true);
    // But should be blocked on configB (limit 1)
    checkRateLimit(configB, 'client-f');
    expect(checkRateLimit(configB, 'client-f').allowed).toBe(false);
  });
});

// ── enforceRateLimit ────────────────────────────────────────────────

describe('enforceRateLimit', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function req(ip: string): Request {
    return { headers: new Headers({ 'x-forwarded-for': ip }) } as Request;
  }

  it('returns null when within limit', () => {
    const r = enforceRateLimit(RATE_LIMITS.earthquakes, req('1.1.1.1'));
    expect(r).toBeNull();
  });

  it('returns 429 when limit exceeded', () => {
    for (let i = 0; i < RATE_LIMITS.earthquakes.maxRequests; i++) {
      enforceRateLimit(RATE_LIMITS.earthquakes, req('2.2.2.2'));
    }
    const r = enforceRateLimit(RATE_LIMITS.earthquakes, req('2.2.2.2'));
    expect(r).not.toBeNull();
    expect(r!.status).toBe(429);
  });

  it('includes Retry-After header in 429 response', async () => {
    for (let i = 0; i < RATE_LIMITS.earthquakes.maxRequests; i++) {
      enforceRateLimit(RATE_LIMITS.earthquakes, req('3.3.3.3'));
    }
    const r = enforceRateLimit(RATE_LIMITS.earthquakes, req('3.3.3.3'));
    expect(r!.headers.get('Retry-After')).toBeTruthy();
  });

  it('429 response body contains error details', async () => {
    for (let i = 0; i < RATE_LIMITS.earthquakes.maxRequests; i++) {
      enforceRateLimit(RATE_LIMITS.earthquakes, req('4.4.4.4'));
    }
    const r = enforceRateLimit(RATE_LIMITS.earthquakes, req('4.4.4.4'));
    const body = await r!.json();
    expect(body.error).toBe('too_many_requests');
    expect(body.retryAfter).toBeGreaterThan(0);
  });
});

// ── Preset configs ──────────────────────────────────────────────────

describe('RATE_LIMITS presets', () => {
  it('has configs for all expected routes', () => {
    const expected = [
      'earthquakes', 'fires', 'flights', 'satellites', 'space-weather',
      'gdelt', 'news', 'weather', 'air-quality', 'maritime', 'cctv',
      'cyber-threats', 'live-news', 'country-risk', 'region-dossier',
      'markets', 'sentinel', 'infrastructure', 'frontlines', 'osint',
    ];
    for (const key of expected) {
      const cfg = (RATE_LIMITS as Record<string, unknown>)[key];
      expect(cfg, `missing RATE_LIMITS.${key}`).toBeDefined();
    }
  });

  it('every preset has valid maxRequests and windowMs', () => {
    for (const [key, cfg] of Object.entries(RATE_LIMITS)) {
      expect(cfg.maxRequests, `${key}: maxRequests must be positive`).toBeGreaterThan(0);
      expect(cfg.windowMs, `${key}: windowMs must be positive`).toBeGreaterThan(0);
      expect(cfg.route, `${key}: route must match key`).toBe(key);
    }
  });
});
