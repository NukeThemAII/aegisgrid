import { describe, it, expect } from 'vitest';
import { validateCsrf, isCsrfExempt } from '@/lib/csrf';

describe('isCsrfExempt', () => {
  it('exempts billing webhook', () => {
    expect(isCsrfExempt('/api/billing/webhook')).toBe(true);
  });

  it('exempts x402 report', () => {
    expect(isCsrfExempt('/api/x402/report')).toBe(true);
  });

  it('exempts x402 enrich', () => {
    expect(isCsrfExempt('/api/x402/enrich')).toBe(true);
  });

  it('exempts auth routes', () => {
    expect(isCsrfExempt('/api/auth/signin')).toBe(true);
    expect(isCsrfExempt('/api/auth/callback/github')).toBe(true);
  });

  it('does NOT exempt billing checkout', () => {
    expect(isCsrfExempt('/api/billing/checkout')).toBe(false);
  });

  it('does NOT exempt reports', () => {
    expect(isCsrfExempt('/api/reports')).toBe(false);
  });
});

describe('validateCsrf', () => {
  function req(method: string, headers: Record<string, string> = {}): Request {
    return {
      method,
      headers: new Headers(headers),
    } as Request;
  }

  it('allows GET requests', () => {
    expect(validateCsrf(req('GET')).allowed).toBe(true);
  });

  it('allows HEAD requests', () => {
    expect(validateCsrf(req('HEAD')).allowed).toBe(true);
  });

  it('allows OPTIONS requests', () => {
    expect(validateCsrf(req('OPTIONS')).allowed).toBe(true);
  });

  it('allows POST from allowed origin', () => {
    const r = req('POST', { origin: 'http://localhost:3000' });
    expect(validateCsrf(r).allowed).toBe(true);
  });

  it('allows POST from VPS IP origin', () => {
    const r = req('POST', { origin: 'http://94.16.122.69:3004' });
    expect(validateCsrf(r).allowed).toBe(true);
  });

  it('blocks POST from unknown origin', () => {
    const r = req('POST', { origin: 'https://evil.example.com' });
    const result = validateCsrf(r);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('CSRF');
  });

  it('allows server-to-server POST with JSON content-type and no Origin', () => {
    const r = req('POST', { 'content-type': 'application/json' });
    expect(validateCsrf(r).allowed).toBe(true);
  });

  it('uses Referer as fallback', () => {
    const r = req('POST', { referer: 'http://localhost:3000/page' });
    expect(validateCsrf(r).allowed).toBe(true);
  });

  it('blocks POST with no Origin, no Referer, and non-JSON content-type', () => {
    const r = req('POST', { 'content-type': 'application/x-www-form-urlencoded' });
    expect(validateCsrf(r).allowed).toBe(false);
  });

  it('allows PUT from allowed origin', () => {
    const r = req('PUT', { origin: 'http://localhost:3000' });
    expect(validateCsrf(r).allowed).toBe(true);
  });

  it('allows DELETE from allowed origin', () => {
    const r = req('DELETE', { origin: 'http://localhost:3000' });
    expect(validateCsrf(r).allowed).toBe(true);
  });
});
