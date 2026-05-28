import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GET } from './route';

describe('GET /api/osint/cve', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function req(url: string) {
    return new Request(url, { headers: new Headers({}) });
  }

  // -- Input validation --

  it('returns 400 when cve parameter is missing', async () => {
    const res = await GET(req('http://localhost/api/osint/cve'));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Missing cve parameter' });
  });

  it('returns 400 for invalid CVE format', async () => {
    const res = await GET(req('http://localhost/api/osint/cve?cve=not-a-cve'));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid CVE format. Expected: CVE-YYYY-NNNNN' });
  });

  it('rejects CVE IDs with too few digits in the sequence', async () => {
    const res = await GET(req('http://localhost/api/osint/cve?cve=CVE-2024-12'));
    expect(res.status).toBe(400);
  });

  it('accepts case-insensitive CVE IDs', async () => {
    // lowercase 'cve' should pass format check
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({
      cveMetadata: { cveId: 'CVE-2024-12345' },
      containers: { cna: { descriptions: [{ lang: 'en', value: 'test' }] } },
    })));

    const res = await GET(req('http://localhost/api/osint/cve?cve=cve-2024-12345'));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.id).toBe('CVE-2024-12345');
  });

  // -- MITRE primary source --

  it('returns CVE data from MITRE (primary source)', async () => {
    const mitreResponse = {
      cveMetadata: {
        cveId: 'CVE-2024-12345',
        datePublished: '2024-01-15T00:00:00Z',
        dateUpdated: '2024-02-01T00:00:00Z',
      },
      containers: {
        cna: {
          descriptions: [
            { lang: 'en', value: 'A critical buffer overflow vulnerability.' },
          ],
          metrics: [
            {
              cvssV3_1: {
                baseScore: 9.8,
                vectorString: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H',
                baseSeverity: 'CRITICAL',
              },
            },
          ],
          problemTypes: [
            { descriptions: [{ cweId: 'CWE-120', description: 'Buffer Overflow' }] },
          ],
          affected: [
            { vendor: 'Acme Corp', product: 'Widget', versions: [{ version: '1.0' }, { version: '2.0' }] },
          ],
          references: [
            { url: 'https://example.com/advisory/1' },
            { url: 'https://example.com/advisory/2' },
          ],
        },
      },
    };

    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(mitreResponse)));

    const res = await GET(req('http://localhost/api/osint/cve?cve=CVE-2024-12345'));
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.id).toBe('CVE-2024-12345');
    expect(data.description).toBe('A critical buffer overflow vulnerability.');
    expect(data.cvss).toBe(9.8);
    expect(data.severity).toBe('CRITICAL');
    expect(data.cwe).toBe('CWE-120');
    expect(data.source).toBe('mitre');
    expect(data.affected).toHaveLength(1);
    expect(data.affected[0].vendor).toBe('Acme Corp');
    expect(data.references).toHaveLength(2);
    expect(data.published).toBe('2024-01-15T00:00:00Z');
  });

  it('derives severity from CVSS score when baseSeverity is missing', async () => {
    const mitreResponse = {
      cveMetadata: { cveId: 'CVE-2024-99999' },
      containers: {
        cna: {
          descriptions: [{ lang: 'en', value: 'Test' }],
          metrics: [{ cvssV3_1: { baseScore: 5.5, vectorString: 'CVSS:3.1/...' } }],
        },
      },
    };

    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(mitreResponse)));

    const res = await GET(req('http://localhost/api/osint/cve?cve=CVE-2024-99999'));
    const data = await res.json();
    expect(data.cvss).toBe(5.5);
    expect(data.severity).toBe('MEDIUM'); // 4 <= 5.5 < 7
  });

  // -- CIRCL fallback --

  it('falls back to CIRCL when MITRE returns non-ok', async () => {
    // MITRE fails
    vi.mocked(fetch).mockResolvedValueOnce(new Response('Not Found', { status: 404 }));
    // CIRCL succeeds
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({
      id: 'CVE-2024-12345',
      summary: 'A vulnerability found via CIRCL.',
      cvss: 7.5,
      cvss_vector: 'CVSS:3.1/AV:N/AC:L/...',
      references: ['https://ref1.example.com', 'https://ref2.example.com'],
      Published: '2024-01-01',
      Modified: '2024-02-01',
      cwe: 'CWE-79',
    })));

    const res = await GET(req('http://localhost/api/osint/cve?cve=CVE-2024-12345'));
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.source).toBe('circl');
    expect(data.description).toBe('A vulnerability found via CIRCL.');
    expect(data.cvss).toBe(7.5);
    expect(data.cwe).toBe('CWE-79');
  });

  it('returns unavailable when both MITRE and CIRCL fail', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('Error', { status: 500 }));
    vi.mocked(fetch).mockResolvedValueOnce(new Response('Error', { status: 500 }));

    const res = await GET(req('http://localhost/api/osint/cve?cve=CVE-2024-12345'));
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.source).toBe('unavailable');
    expect(data.cvss).toBeNull();
  });

  it('returns 500 when fetch throws entirely', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('DNS failure'));

    const res = await GET(req('http://localhost/api/osint/cve?cve=CVE-2024-12345'));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'CVE lookup failed' });
  });
});
