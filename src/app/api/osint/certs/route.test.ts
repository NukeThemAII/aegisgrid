import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GET } from './route';

describe('GET /api/osint/certs', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function req(url: string) {
    return new Request(url, { headers: new Headers({}) });
  }

  it('returns 400 when domain parameter is missing', async () => {
    const res = await GET(req('http://localhost/api/osint/certs'));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Missing domain parameter' });
  });

  it('returns 400 for invalid domain format', async () => {
    const res = await GET(req('http://localhost/api/osint/certs?domain=not valid'));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid domain format' });
  });

  it('returns deduplicated certificates and extracted subdomains', async () => {
    const mockCerts = [
      {
        id: 1,
        issuer_name: "C=US, O=Let's Encrypt",
        common_name: 'example.com',
        name_value: 'example.com\nwww.example.com\napi.example.com',
        not_before: '2025-01-01',
        not_after: '2025-04-01',
        serial_number: 'AAAA',
      },
      {
        id: 2,
        issuer_name: "C=US, O=Let's Encrypt",
        common_name: 'mail.example.com',
        name_value: 'mail.example.com',
        not_before: '2025-02-01',
        not_after: '2025-05-01',
        serial_number: 'BBBB',
      },
      // Duplicate — same common_name + serial
      {
        id: 1,
        issuer_name: "C=US, O=Let's Encrypt",
        common_name: 'example.com',
        name_value: 'example.com',
        not_before: '2025-01-01',
        not_after: '2025-04-01',
        serial_number: 'AAAA',
      },
    ];

    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(mockCerts)));

    const res = await GET(req('http://localhost/api/osint/certs?domain=example.com'));
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.domain).toBe('example.com');
    expect(data.certificates).toHaveLength(2); // deduped
    expect(data.subdomains).toContain('www.example.com');
    expect(data.subdomains).toContain('api.example.com');
    expect(data.subdomains).toContain('mail.example.com');
    expect(data.unique_subdomains).toBe(4); // example.com, www, api, mail
    expect(data.total_certs).toBe(3); // raw count before dedup
  });

  it('strips wildcard prefixes from subdomains', async () => {
    const mockCerts = [
      {
        id: 1,
        common_name: '*.example.com',
        name_value: '*.example.com',
        serial_number: 'CCCC',
      },
    ];

    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(mockCerts)));

    const res = await GET(req('http://localhost/api/osint/certs?domain=example.com'));
    const data = await res.json();

    // *.example.com → example.com after wildcard strip
    expect(data.subdomains).toContain('example.com');
    expect(data.subdomains.some((s: string) => s.startsWith('*'))).toBe(false);
  });

  it('handles crt.sh being unavailable', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('Service Unavailable', { status: 503 }));

    const res = await GET(req('http://localhost/api/osint/certs?domain=example.com'));
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.certificates).toEqual([]);
    expect(data.error).toBe('crt.sh unavailable');
  });

  it('returns 500 when fetch throws', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'));

    const res = await GET(req('http://localhost/api/osint/certs?domain=example.com'));
    expect(res.status).toBe(500);

    const data = await res.json();
    expect(data.error).toBe('Lookup failed');
  });
});
