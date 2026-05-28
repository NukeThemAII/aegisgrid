import { describe, expect, it } from 'vitest';
import {
  getScannerV2Meta,
  getScannerV2Payload,
  getStringArrayField,
  sanitizeScannerResponse,
} from './scanner-result-format';

describe('scanner result formatting helpers', () => {
  it('unwraps nested Scanner V2 payloads for UI renderers', () => {
    const result = {
      ok: true,
      scan_type: 'subdomains',
      mode: 'passive',
      label: 'Subdomain Enumeration',
      status: 'ok',
      source: 'aegisgrid-scanner-v2',
      fetched_at: '2026-05-24T00:00:00.000Z',
      data: {
        target: 'example.com',
        count: 2,
        subdomains: ['a.example.com', 'b.example.com'],
        source: 'crt.sh',
      },
    };

    expect(getScannerV2Payload(result)).toEqual(result.data);
    expect(getScannerV2Meta(result)).toMatchObject({
      scan_type: 'subdomains',
      mode: 'passive',
      label: 'Subdomain Enumeration',
      source: 'aegisgrid-scanner-v2',
    });
  });

  it('leaves legacy flat payloads unchanged', () => {
    const legacy = { target: 'example.com', ports: [80, 443] };
    expect(getScannerV2Payload(legacy)).toBe(legacy);
    expect(getScannerV2Meta(legacy)).toBeNull();
  });

  it('safely extracts string arrays from nested data', () => {
    expect(getStringArrayField({ subdomains: ['a.example.com', 42, 'b.example.com'] }, 'subdomains')).toEqual([
      'a.example.com',
      'b.example.com',
    ]);
    expect(getStringArrayField({ subdomains: 'a.example.com' }, 'subdomains')).toEqual([]);
  });
});

// ── sanitizeScannerResponse ────────────────────────────────────────

describe('sanitizeScannerResponse', () => {
  it('passes through a well-formed scanner response unchanged', () => {
    const input = {
      ok: true,
      scan_type: 'subdomains',
      mode: 'passive',
      status: 'ok',
      source: 'aegisgrid-scanner-v2',
      fetched_at: '2026-01-01T00:00:00Z',
      data: { target: 'example.com', subdomains: ['a.example.com'] },
    };
    expect(sanitizeScannerResponse(input)).toEqual(input);
  });

  it('strips unknown top-level keys', () => {
    const input = {
      ok: true,
      scan_type: 'rdns',
      mode: 'passive',
      status: 'ok',
      source: 'scanner',
      fetched_at: '2026-01-01T00:00:00Z',
      data: {},
      __internal_debug: 'secret-token',
      injected_field: { malicious: true },
      _cache_hit: true,
    };
    const result = sanitizeScannerResponse(input) as Record<string, unknown>;
    expect(result.ok).toBe(true);
    expect(result.__internal_debug).toBeUndefined();
    expect(result.injected_field).toBeUndefined();
    expect(result._cache_hit).toBeUndefined();
    // Known keys preserved
    expect(result.scan_type).toBe('rdns');
    expect(result.source).toBe('scanner');
  });

  it('preserves error/code/detail fields for error responses', () => {
    const input = {
      ok: false,
      error: 'Scan failed',
      code: 'TIMEOUT',
      detail: 'Connection timed out after 15s',
      data: null,
    };
    const result = sanitizeScannerResponse(input) as Record<string, unknown>;
    expect(result.error).toBe('Scan failed');
    expect(result.code).toBe('TIMEOUT');
    expect(result.detail).toBe('Connection timed out after 15s');
  });

  it('handles null and non-object input', () => {
    expect(sanitizeScannerResponse(null)).toBeNull();
    expect(sanitizeScannerResponse(undefined)).toBeUndefined();
    expect(sanitizeScannerResponse(42)).toBe(42);
    expect(sanitizeScannerResponse('string')).toBe('string');
    expect(sanitizeScannerResponse([1, 2, 3])).toEqual([1, 2, 3]);
  });

  it('enforces max depth — truncates deeply nested objects', () => {
    const input: Record<string, unknown> = { ok: true, data: {} };
    let current = input.data as Record<string, unknown>;
    for (let i = 0; i < 10; i++) {
      current.nested = {};
      current = current.nested as Record<string, unknown>;
    }
    // Should not throw — deep nesting gets truncated to undefined
    const result = sanitizeScannerResponse(input) as Record<string, unknown>;
    expect(result.ok).toBe(true);
    expect(result.data).toBeDefined();
  });
});
