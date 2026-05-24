import { describe, expect, it } from 'vitest';
import {
  getScannerV2Meta,
  getScannerV2Payload,
  getStringArrayField,
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
