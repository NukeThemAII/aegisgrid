import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScanAdapter } from './scanner-service';

// ────────────────────────────────────────────────────────────────────────────
// Mock node:dns/promises before importing adapters
// ────────────────────────────────────────────────────────────────────────────
vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(),
  reverse: vi.fn(),
}));

import { lookup, reverse } from 'node:dns/promises';
import {
  rdnsAdapter,
  rdapAdapter,
  ctSubdomainsAdapter,
  geolocAdapter,
  vulnAdapter,
  createPassiveAdapters,
  PASSIVE_ADAPTER_KEYS,
} from './passive-adapters';

const mockLookup = vi.mocked(lookup);
const mockReverse = vi.mocked(reverse);

// ────────────────────────────────────────────────────────────────────────────
// Mock global fetch
// ────────────────────────────────────────────────────────────────────────────
const mockFetch = vi.fn<(input: string | URL | Request, init?: RequestInit) => Promise<Response>>();

beforeEach(() => {
  mockFetch.mockReset();
  mockLookup.mockReset();
  mockReverse.mockReset();
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ────────────────────────────────────────────────────────────────────────────
// Helper: create a mock Response
// ────────────────────────────────────────────────────────────────────────────
function jsonResponse(body: unknown, status = 200): Response {
  const text = JSON.stringify(body);
  return new Response(text, {
    status,
    headers: { 'content-type': 'application/json', 'content-length': String(text.length) },
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 1. RDNS adapter
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('rdnsAdapter', () => {
  it('performs reverse lookup for an IP literal', async () => {
    mockReverse.mockResolvedValueOnce(['mail.example.com']);

    const result = await rdnsAdapter('93.184.216.34');

    expect(result.is_ip).toBe(true);
    expect(result.forward_ips).toEqual([]);
    expect(result.reverse_records).toEqual([
      { ip: '93.184.216.34', hostnames: ['mail.example.com'] },
    ]);
    expect(result.status).toBe('ok');
    expect(result.source).toBe('node:dns');
    expect(mockLookup).not.toHaveBeenCalled();
  });

  it('performs forward+reverse lookup for a hostname', async () => {
    mockLookup.mockResolvedValueOnce([
      { address: '1.2.3.4', family: 4 },
      { address: '5.6.7.8', family: 4 },
    ] as never);
    mockReverse.mockResolvedValueOnce(['host-a.example.com']);
    mockReverse.mockResolvedValueOnce(['host-b.example.com']);

    const result = await rdnsAdapter('example.com');

    expect(result.is_ip).toBe(false);
    expect(result.forward_ips).toEqual(['1.2.3.4', '5.6.7.8']);
    expect(result.reverse_records).toHaveLength(2);
    expect(result.status).toBe('ok');
    expect(mockLookup).toHaveBeenCalledWith('example.com', { all: true });
  });

  it('handles reverse lookup failure for individual IPs gracefully', async () => {
    mockReverse.mockRejectedValueOnce(new Error('ENOTFOUND'));

    const result = await rdnsAdapter('10.0.0.1');

    expect(result.is_ip).toBe(true);
    expect(result.status).toBe('ok');
    const records = result.reverse_records as Array<{ ip: string; hostnames: string[]; error?: string }>;
    expect(records).toHaveLength(1);
    expect(records[0].hostnames).toEqual([]);
    expect(records[0].error).toBe('ENOTFOUND');
  });

  it('handles forward lookup failure gracefully', async () => {
    mockLookup.mockRejectedValueOnce(new Error('ENOTFOUND'));

    const result = await rdnsAdapter('nonexistent.example.com');

    expect(result.status).toBe('lookup_failed');
    expect(result.error).toBe('ENOTFOUND');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 2. RDAP adapter
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('rdapAdapter', () => {
  it('selects domain endpoint for hostname targets', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({
      ldhName: 'example.com',
      handle: 'D12345',
      objectClassName: 'domain',
      status: ['active'],
      events: [{ eventAction: 'registration', eventDate: '2020-01-01T00:00:00Z' }],
    }));

    const result = await rdapAdapter('example.com');

    expect(result.endpoint_type).toBe('domain');
    expect(result.status).toBe('ok');
    expect(result.source).toBe('rdap.org');
    expect(result.name).toBe('example.com');
    expect(result.handle).toBe('D12345');
    // Verify the correct base URL was used.
    expect(mockFetch).toHaveBeenCalledOnce();
    const calledUrl = mockFetch.mock.calls[0][0] as string;
    const calledInit = mockFetch.mock.calls[0][1] as RequestInit;
    expect(calledUrl).toContain('rdap.org/domain/');
    expect(calledInit.redirect).toBe('error');
  });

  it('selects IP endpoint for IP targets', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({
      handle: 'NET-93-184-216-0-1',
      objectClassName: 'ip network',
      status: ['active'],
    }));

    const result = await rdapAdapter('93.184.216.34');

    expect(result.endpoint_type).toBe('ip');
    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('rdap.org/ip/');
  });

  it('handles 404 / not-found gracefully', async () => {
    mockFetch.mockResolvedValueOnce(new Response('Not Found', { status: 404 }));

    const result = await rdapAdapter('nonexistent.example');

    expect(result.status).toBe('not_found');
    expect(result.source).toBe('rdap.org');
  });

  it('handles fetch errors gracefully', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network timeout'));

    const result = await rdapAdapter('example.com');

    expect(result.status).toBe('error');
    expect(result.error).toBe('network timeout');
  });

  it('rejects oversized responses from content-length before parsing', async () => {
    mockFetch.mockResolvedValueOnce(new Response('{}', {
      status: 200,
      headers: { 'content-length': String(512 * 1024 + 1) },
    }));

    const result = await rdapAdapter('example.com');

    expect(result.status).toBe('error');
    expect(String(result.error)).toContain('Response body too large');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 3. CT subdomains adapter
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('ctSubdomainsAdapter', () => {
  it('deduplicates and filters names under the requested domain', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse([
      { common_name: 'www.example.com', name_value: 'www.example.com' },
      { common_name: '*.example.com', name_value: '*.example.com\nmail.example.com' },
      { common_name: 'other.net', name_value: 'other.net' },
      { common_name: 'sub.example.com', name_value: 'sub.example.com\nwww.example.com' },
    ]));

    const result = await ctSubdomainsAdapter('example.com');

    expect(result.status).toBe('ok');
    const subs = result.subdomains as string[];
    expect(subs).toContain('example.com');
    expect(subs).toContain('www.example.com');
    expect(subs).toContain('mail.example.com');
    expect(subs).toContain('sub.example.com');
    // other.net should be excluded.
    expect(subs).not.toContain('other.net');
    // Wildcard prefix should be stripped.
    expect(subs.every(s => !s.startsWith('*'))).toBe(true);
    // Check sorted and deduplicated.
    const unique = [...new Set(subs)];
    expect(subs).toEqual(unique);
    expect(subs).toEqual([...subs].sort());
  });

  it('skips IP targets', async () => {
    const result = await ctSubdomainsAdapter('93.184.216.34');

    expect(result.status).toBe('skipped');
    expect(result.subdomains).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('handles fetch errors gracefully', async () => {
    mockFetch.mockRejectedValueOnce(new Error('timeout'));

    const result = await ctSubdomainsAdapter('example.com');

    expect(result.status).toBe('error');
    expect(result.error).toBe('timeout');
    expect(result.subdomains).toEqual([]);
  });

  it('handles empty / 404 responses', async () => {
    mockFetch.mockResolvedValueOnce(new Response('Not Found', { status: 404 }));

    const result = await ctSubdomainsAdapter('nonexistent.example');

    expect(result.status).toBe('not_found');
    expect(result.subdomains).toEqual([]);
  });

  it('rejects oversized responses even without content-length', async () => {
    mockFetch.mockResolvedValueOnce(new Response('x'.repeat(512 * 1024 + 1), { status: 200 }));

    const result = await ctSubdomainsAdapter('example.com');

    expect(result.status).toBe('error');
    expect(String(result.error)).toContain('Response body too large');
  });

  it('bounds results to MAX_RESULTS', async () => {
    // Generate 300 unique entries.
    const entries = Array.from({ length: 300 }, (_, i) => ({
      common_name: `sub${i}.example.com`,
      name_value: `sub${i}.example.com`,
    }));
    mockFetch.mockResolvedValueOnce(jsonResponse(entries));

    const result = await ctSubdomainsAdapter('example.com');

    expect(result.status).toBe('ok');
    const subs = result.subdomains as string[];
    expect(subs.length).toBeLessThanOrEqual(200);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 4. Geolocation adapter
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('geolocAdapter', () => {
  it('resolves hostname to IPs before geolocation', async () => {
    mockLookup.mockResolvedValueOnce([{ address: '1.2.3.4', family: 4 }] as never);
    mockFetch.mockResolvedValueOnce(jsonResponse({
      status: 'success',
      country: 'United States',
      regionName: 'California',
      city: 'Los Angeles',
      lat: 34.05,
      lon: -118.24,
      isp: 'Example ISP',
      org: 'Example Org',
      as: 'AS12345 Example',
    }));

    const result = await geolocAdapter('example.com');

    expect(result.is_ip).toBe(false);
    expect(result.status).toBe('ok');
    const results = result.results;
    expect(results).toHaveLength(1);
    expect(results[0].country).toBe('United States');
    expect(results[0].city).toBe('Los Angeles');
    expect(mockLookup).toHaveBeenCalledWith('example.com', { all: true });
  });

  it('handles hostname resolution failure', async () => {
    mockLookup.mockRejectedValueOnce(new Error('ENOTFOUND'));

    const result = await geolocAdapter('nonexistent.example');

    expect(result.status).toBe('lookup_failed');
    expect(result.error).toBe('ENOTFOUND');
  });

  it('handles geolocation source error for an IP', async () => {
    mockFetch.mockRejectedValueOnce(new Error('api down'));

    const result = await geolocAdapter('1.2.3.4');

    expect(result.is_ip).toBe(true);
    const results = result.results;
    expect(results).toHaveLength(1);
    expect(results[0].status).toBe('error');
    expect(results[0].error).toBe('api down');
  });

  it('handles ip-api failure status', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({
      status: 'fail',
      message: 'private range',
    }));

    const result = await geolocAdapter('192.168.1.1');

    expect(result.status).toBe('failed');
    const results = result.results;
    expect(results[0].status).toBe('failed');
    expect(results[0].error).toBe('private range');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 5. Vuln (passive CVE) adapter
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('vulnAdapter', () => {
  it('returns not_applicable for ordinary hostnames without fetching', async () => {
    const result = await vulnAdapter('example.com');

    expect(result.status).toBe('not_applicable');
    expect(result.reason).toContain('CVE ID');
    expect(result.vulnerabilities).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns not_applicable for IP targets without fetching', async () => {
    const result = await vulnAdapter('93.184.216.34');

    expect(result.status).toBe('not_applicable');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns not_applicable for malformed CVE-like strings without fetching', async () => {
    const result = await vulnAdapter('CVE-not-valid');

    expect(result.status).toBe('not_applicable');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('fetches CVE data for CVE ID targets', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({
      cveMetadata: { cveId: 'CVE-2024-1234', state: 'PUBLISHED' },
      containers: {
        cna: {
          descriptions: [{ lang: 'en', value: 'A test vulnerability' }],
        },
      },
    }));

    const result = await vulnAdapter('CVE-2024-1234');

    expect(result.status).toBe('ok');
    expect(result.cve_id).toBe('CVE-2024-1234');
    expect(result.state).toBe('PUBLISHED');
    expect(result.source).toBe('cveawg.mitre.org');
    expect(mockFetch).toHaveBeenCalledOnce();
    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('cveawg.mitre.org/api/cve/CVE-2024-1234');
  });

  it('handles CVE not found', async () => {
    mockFetch.mockResolvedValueOnce(new Response('Not Found', { status: 404 }));

    const result = await vulnAdapter('CVE-9999-99999');

    expect(result.status).toBe('not_found');
  });

  it('handles CPE strings with explanatory status', async () => {
    const result = await vulnAdapter('cpe:2.3:a:apache:httpd:2.4.49');

    expect(result.status).toBe('cpe_noted');
    expect(result.reason).toContain('CPE');
    expect(result.vulnerabilities).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('handles fetch errors for CVE lookups', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network error'));

    const result = await vulnAdapter('CVE-2024-1234');

    expect(result.status).toBe('error');
    expect(result.error).toBe('network error');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Default adapter map
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('createPassiveAdapters', () => {
  it('contains only passive scan type keys', () => {
    const adapters = createPassiveAdapters();
    const keys = Object.keys(adapters);

    for (const key of keys) {
      expect(PASSIVE_ADAPTER_KEYS).toContain(key);
    }
  });

  it('does not contain active adapter keys (quick, ssl, headers, tech)', () => {
    const adapters = createPassiveAdapters();
    const keys = Object.keys(adapters);

    expect(keys).not.toContain('quick');
    expect(keys).not.toContain('ssl');
    expect(keys).not.toContain('headers');
    expect(keys).not.toContain('tech');
  });

  it('exports all expected passive keys', () => {
    const adapters = createPassiveAdapters();
    const keys = Object.keys(adapters);

    expect(keys).toContain('rdns');
    expect(keys).toContain('whois');
    expect(keys).toContain('subdomains');
    expect(keys).toContain('geoloc');
    expect(keys).toContain('vuln');
  });

  it('all adapters conform to ScanAdapter signature', () => {
    const adapters = createPassiveAdapters();
    for (const [key, adapter] of Object.entries(adapters)) {
      expect(typeof adapter).toBe('function');
      expect(adapter.length).toBeLessThanOrEqual(1);
      // Type check via assignment.
      const _check: ScanAdapter = adapter as ScanAdapter;
      void _check;
      void key;
    }
  });

  it('maps to exactly the passive type keys', () => {
    const adapters = createPassiveAdapters();
    const keys = Object.keys(adapters).sort();
    const expected = [...PASSIVE_ADAPTER_KEYS].sort();
    expect(keys).toEqual(expected);
  });
});
