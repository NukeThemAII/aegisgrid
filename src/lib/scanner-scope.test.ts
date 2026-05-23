import { describe, it, expect } from 'vitest';
import {
  normalizeAllowlistEntry,
  normalizeTarget,
  isAllowedTarget,
  parseAllowlist,
  parseRequireVerification,
} from './scanner-scope';

// ── normalizeAllowlistEntry ──────────────────────────────────────────

describe('normalizeAllowlistEntry', () => {
  it('returns empty string for empty/whitespace input', () => {
    expect(normalizeAllowlistEntry('')).toBe('');
    expect(normalizeAllowlistEntry('   ')).toBe('');
  });

  it('lowercases and trims plain hostnames', () => {
    expect(normalizeAllowlistEntry('  Example.COM  ')).toBe('example.com');
  });

  it('strips one trailing dot', () => {
    expect(normalizeAllowlistEntry('example.com.')).toBe('example.com');
  });

  it('preserves wildcard entries', () => {
    expect(normalizeAllowlistEntry('*.Example.COM')).toBe('*.example.com');
  });

  it('extracts hostname from a full URL', () => {
    expect(normalizeAllowlistEntry('https://Example.COM/path?q=1')).toBe('example.com');
  });

  it('extracts hostname from URL with port', () => {
    expect(normalizeAllowlistEntry('http://Example.COM:8080')).toBe('example.com');
  });

  it('passes through bare IPs', () => {
    expect(normalizeAllowlistEntry('192.168.1.1')).toBe('192.168.1.1');
  });
});

// ── normalizeTarget ──────────────────────────────────────────────────

describe('normalizeTarget', () => {
  it('lowercases, trims, and strips trailing dot', () => {
    expect(normalizeTarget('  Example.COM.  ')).toBe('example.com');
  });

  it('strips surrounding brackets (IPv6)', () => {
    expect(normalizeTarget('[::1]')).toBe('::1');
  });
});

// ── parseRequireVerification ─────────────────────────────────────────

describe('parseRequireVerification', () => {
  it('defaults to true when undefined', () => {
    expect(parseRequireVerification(undefined)).toBe(true);
  });

  it('defaults to true for empty string', () => {
    expect(parseRequireVerification('')).toBe(true);
  });

  it('is true for "true"', () => {
    expect(parseRequireVerification('true')).toBe(true);
  });

  it('is true for "1"', () => {
    expect(parseRequireVerification('1')).toBe(true);
  });

  it('is false only for exactly "false"', () => {
    expect(parseRequireVerification('false')).toBe(false);
  });

  it('is true for "FALSE" (case-sensitive check)', () => {
    expect(parseRequireVerification('FALSE')).toBe(true);
  });
});

// ── parseAllowlist ───────────────────────────────────────────────────

describe('parseAllowlist', () => {
  it('splits on commas and normalizes', () => {
    expect(parseAllowlist('example.com, *.test.org')).toEqual([
      'example.com',
      '*.test.org',
    ]);
  });

  it('filters out blank entries', () => {
    expect(parseAllowlist(',,  ,example.com,,')).toEqual(['example.com']);
  });

  it('returns empty array for empty string', () => {
    expect(parseAllowlist('')).toEqual([]);
  });
});

// ── isAllowedTarget ─────────────────────────────────────────────────

describe('isAllowedTarget', () => {
  it('allows any target when requireVerification is false', () => {
    expect(isAllowedTarget('anything.evil.com', [], false)).toBe(true);
  });

  it('denies all targets when allowlist is empty and verification required', () => {
    expect(isAllowedTarget('example.com', [], true)).toBe(false);
  });

  // ── Exact match ──

  it('matches exact hostname (case-insensitive)', () => {
    const list = parseAllowlist('example.com');
    expect(isAllowedTarget('Example.COM', list, true)).toBe(true);
  });

  it('matches exact hostname with trailing dot stripped', () => {
    const list = parseAllowlist('example.com');
    expect(isAllowedTarget('example.com.', list, true)).toBe(true);
  });

  it('rejects non-matching hostname', () => {
    const list = parseAllowlist('example.com');
    expect(isAllowedTarget('evil.com', list, true)).toBe(false);
  });

  it('matches exact IP', () => {
    const list = parseAllowlist('10.0.0.1');
    expect(isAllowedTarget('10.0.0.1', list, true)).toBe(true);
  });

  it('rejects non-matching IP', () => {
    const list = parseAllowlist('10.0.0.1');
    expect(isAllowedTarget('10.0.0.2', list, true)).toBe(false);
  });

  // ── Wildcard match ──

  it('wildcard matches immediate subdomain', () => {
    const list = parseAllowlist('*.example.com');
    expect(isAllowedTarget('foo.example.com', list, true)).toBe(true);
  });

  it('wildcard matches deep subdomain', () => {
    const list = parseAllowlist('*.example.com');
    expect(isAllowedTarget('deep.foo.example.com', list, true)).toBe(true);
  });

  it('wildcard does NOT match the base domain itself', () => {
    const list = parseAllowlist('*.example.com');
    expect(isAllowedTarget('example.com', list, true)).toBe(false);
  });

  it('wildcard does NOT match a sibling domain (evil-example.com)', () => {
    const list = parseAllowlist('*.example.com');
    expect(isAllowedTarget('evil-example.com', list, true)).toBe(false);
  });

  // ── Allowlist-only semantics (no DNS resolution) ──

  it('does NOT match a hostname just because its IP is allowlisted', () => {
    // If 10.0.0.1 is allowlisted, submitting "server.local" (which might
    // resolve to 10.0.0.1) must NOT be allowed — the route forwards the
    // original target string, not the resolved IP.
    const list = parseAllowlist('10.0.0.1');
    expect(isAllowedTarget('server.local', list, true)).toBe(false);
  });

  // ── Mixed allowlist ──

  it('matches any entry in a multi-entry allowlist', () => {
    const list = parseAllowlist('a.com, *.b.org, 1.2.3.4');
    expect(isAllowedTarget('a.com', list, true)).toBe(true);
    expect(isAllowedTarget('sub.b.org', list, true)).toBe(true);
    expect(isAllowedTarget('1.2.3.4', list, true)).toBe(true);
    expect(isAllowedTarget('c.com', list, true)).toBe(false);
  });

  // ── URL-form allowlist entries ──

  it('handles allowlist entries specified as full URLs', () => {
    const list = parseAllowlist('https://example.com/some/path');
    expect(isAllowedTarget('example.com', list, true)).toBe(true);
  });
});
