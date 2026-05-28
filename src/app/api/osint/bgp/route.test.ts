import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GET } from './route';

describe('GET /api/osint/bgp', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mockRequest(url: string, headers: Record<string, string> = {}) {
    return new Request(url, { headers: new Headers(headers) });
  }

  it('returns 400 when query parameter is missing', async () => {
    const req = mockRequest('http://localhost/api/osint/bgp');
    const res = await GET(req);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Missing query parameter (IP, ASN number, or prefix)' });
  });

  it('returns 400 for unrecognized query format', async () => {
    const req = mockRequest('http://localhost/api/osint/bgp?query=not_an_ip_or_asn');
    const res = await GET(req);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Unrecognized query format. Use IP address or AS number.' });
  });

  it('returns 400 for invalid IPv4 octets', async () => {
    const req = mockRequest('http://localhost/api/osint/bgp?query=999.999.999.999');
    const res = await GET(req);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Unrecognized query format. Use IP address or AS number.' });
  });

  it('performs IP lookup when given a valid IPv4', async () => {
    const mockData = {
      status: 'ok',
      status_message: 'Query was successful',
      data: {
        ip: '8.8.8.8',
        prefixes: [{ prefix: '8.8.8.0/24', ip: '8.8.8.0', cidr: 24 }],
      },
    };

    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(mockData)));

    const req = mockRequest('http://localhost/api/osint/bgp?query=8.8.8.8');
    const res = await GET(req);
    
    expect(res.status).toBe(200);
    const data = await res.json();
    
    expect(data.query).toBe('8.8.8.8');
    expect(data.type).toBe('ip');
    expect(data.ip.ip).toBe('8.8.8.8');
    
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('https://api.bgpview.io/ip/8.8.8.8'),
      expect.any(Object)
    );
  });

  it('performs ASN lookup when given a valid ASN (AS prefix)', async () => {
    // We expect 3 fetch calls for ASN: details, prefixes, peers
    vi.mocked(fetch).mockImplementation(async (url: RequestInfo | URL) => {
      const urlStr = url.toString();
      
      if (urlStr.includes('/prefixes')) {
        return new Response(JSON.stringify({ status: 'ok', data: { ipv4_prefixes: [{ prefix: '8.8.8.0/24' }], ipv6_prefixes: [] } }));
      } else if (urlStr.includes('/peers')) {
        return new Response(JSON.stringify({ status: 'ok', data: { ipv4_peers: [{ asn: 12345 }] } }));
      } else {
        return new Response(JSON.stringify({ status: 'ok', data: { asn: 15169, name: 'GOOGLE' } }));
      }
    });

    const req = mockRequest('http://localhost/api/osint/bgp?query=AS15169');
    const res = await GET(req);
    
    expect(res.status).toBe(200);
    const data = await res.json();
    
    expect(data.query).toBe('AS15169');
    expect(data.type).toBe('asn');
    expect(data.asn.name).toBe('GOOGLE');
    expect(data.prefixes.ipv4).toHaveLength(1);
    expect(data.peers.upstream).toHaveLength(1);
    
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('performs ASN lookup when given a valid ASN (digits only)', async () => {
    vi.mocked(fetch).mockImplementation(async () => new Response(JSON.stringify({ status: 'ok', data: {} })));

    const req = mockRequest('http://localhost/api/osint/bgp?query=15169');
    const res = await GET(req);
    
    expect(res.status).toBe(200);
    const data = await res.json();
    
    expect(data.type).toBe('asn');
    expect(fetch).toHaveBeenCalledTimes(3);
  });
});
