import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GET } from './route';

describe('GET /api/osint/threats', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function req(url: string) {
    return new Request(url, { headers: new Headers({}) });
  }

  it('returns threat data without query (general pulses only)', async () => {
    // OTX subscribed → 401 (needs auth)
    vi.mocked(fetch).mockResolvedValueOnce(new Response('Unauthorized', { status: 401 }));
    // OTX activity fallback → success
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({
      results: [
        {
          name: 'Lazarus APT Campaign',
          description: 'North Korean threat actor targeting financial institutions.',
          created: '2025-01-01',
          modified: '2025-01-15',
          tags: ['apt', 'lazarus', 'finance', 'malware', 'north-korea'],
          adversary: 'Lazarus Group',
          targeted_countries: ['US', 'KR'],
          indicator_count: 42,
        },
      ],
    })));

    const res = await GET(req('http://localhost/api/osint/threats'));
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.pulses).toHaveLength(1);
    expect(data.pulses[0].name).toBe('Lazarus APT Campaign');
    expect(data.pulses[0].tags).toHaveLength(5);
    expect(data.pulses[0].indicators_count).toBe(42);
    expect(data.threat_level).toBe('LOW'); // no query, so otx.pulse_count is missing
  });

  it('checks IP against Tor exit list and OTX reputation', async () => {
    // OTX subscribed → 401
    vi.mocked(fetch).mockResolvedValueOnce(new Response('Unauthorized', { status: 401 }));
    // OTX activity → 200 (empty)
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ results: [] })));
    // Tor exit list
    vi.mocked(fetch).mockResolvedValueOnce(new Response('185.220.101.1\n185.220.101.2\n'));
    // OTX IP reputation
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({
      reputation: 50,
      pulse_info: { count: 8 },
      country_name: 'Germany',
      asn: 'AS12345',
    })));

    const res = await GET(req('http://localhost/api/osint/threats?query=185.220.101.1'));
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.tor_exit_node).toBe(true);
    expect(data.otx.reputation).toBe(50);
    expect(data.otx.pulse_count).toBe(8);
    expect(data.threat_level).toBe('HIGH'); // pulse_count > 5
  });

  it('reports IP is NOT a Tor exit node', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('Unauthorized', { status: 401 }));
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ results: [] })));
    vi.mocked(fetch).mockResolvedValueOnce(new Response('185.220.101.1\n185.220.101.2\n'));
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({
      reputation: 0,
      pulse_info: { count: 0 },
    })));

    const res = await GET(req('http://localhost/api/osint/threats?query=8.8.8.8'));
    const data = await res.json();

    expect(data.tor_exit_node).toBe(false);
    expect(data.threat_level).toBe('LOW');
  });

  it('performs domain lookup via OTX', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('Unauthorized', { status: 401 }));
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ results: [] })));
    // Domain OTX lookup
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({
      pulse_info: { count: 3 },
      whois: {
        registrar: 'Namecheap',
        creation_date: '2020-01-01',
        expiration_date: '2030-01-01',
      },
    })));

    const res = await GET(req('http://localhost/api/osint/threats?query=suspicious-domain.com'));
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.otx.pulse_count).toBe(3);
    expect(data.otx.whois.registrar).toBe('Namecheap');
    expect(data.threat_level).toBe('MEDIUM'); // 0 < pulse_count <= 5
  });

  it('handles all upstream failures gracefully', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('Network offline'));

    const res = await GET(req('http://localhost/api/osint/threats'));
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.threat_level).toBe('LOW');
    // Should have no pulses and no crash
    expect(data.pulses).toBeUndefined();
  });
});
