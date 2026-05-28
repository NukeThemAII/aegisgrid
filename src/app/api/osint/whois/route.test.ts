import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GET } from './route';
import * as ssrfGuard from '@/lib/ssrf-guard';

describe('GET /api/osint/whois', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    // Mock safeFetch from ssrf-guard
    vi.spyOn(ssrfGuard, 'safeFetch').mockImplementation(async () => {
      const res = new Response();
      res.headers.set('strict-transport-security', 'max-age=31536000');
      res.headers.set('x-frame-options', 'DENY');
      return res;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mockRequest(url: string, headers: Record<string, string> = {}) {
    return new Request(url, { headers: new Headers(headers) });
  }

  it('returns 400 when domain parameter is missing', async () => {
    const req = mockRequest('http://localhost/api/osint/whois');
    const res = await GET(req);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Missing domain parameter' });
  });

  it('returns 400 for invalid domain format', async () => {
    const req = mockRequest('http://localhost/api/osint/whois?domain=invalid domain.com');
    const res = await GET(req);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid domain format' });
  });

  it('performs WHOIS/RDAP and HTTP headers lookups successfully', async () => {
    const mockRdap = {
      handle: 'DOMAIN-1234',
      ldhName: 'example.com',
      status: ['active'],
      events: [
        { eventAction: 'registration', eventDate: '2000-01-01T00:00:00Z' },
        { eventAction: 'expiration', eventDate: '2030-01-01T00:00:00Z' },
      ],
      nameservers: [{ ldhName: 'ns1.example.com' }],
      entities: [
        { handle: 'ENT-1', roles: ['registrant'], vcardArray: ['vcard', [['fn', {}, 'text', 'Example Inc']]] },
      ],
    };

    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(mockRdap)));

    const req = mockRequest('http://localhost/api/osint/whois?domain=example.com');
    const res = await GET(req);
    
    expect(res.status).toBe(200);
    const data = await res.json();
    
    expect(data.domain).toBe('example.com');
    expect(data.rdap.name).toBe('example.com');
    expect(data.registration).toBe('2000-01-01T00:00:00Z');
    expect(data.expiration).toBe('2030-01-01T00:00:00Z');
    
    // HTTP headers check
    expect(data.http.headers['strict-transport-security']).toBe('max-age=31536000');
    expect(data.http.headers['x-frame-options']).toBe('DENY');
    
    // Security score calculation (HSTS +2, XFO +1 = 3)
    expect(data.security_score.score).toBe(3);
    expect(data.security_score.grade).toBe('B');
    
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(ssrfGuard.safeFetch).toHaveBeenCalledTimes(1);
  });

  it('handles RDAP and HTTP failures gracefully', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('RDAP Network Error'));
    vi.mocked(ssrfGuard.safeFetch).mockRejectedValueOnce(new Error('HTTP Network Error'));

    const req = mockRequest('http://localhost/api/osint/whois?domain=example.com');
    const res = await GET(req);
    
    expect(res.status).toBe(200);
    const data = await res.json();
    
    // Both lookups failed, should just return empty parts
    expect(data.domain).toBe('example.com');
    expect(data.rdap).toBeUndefined();
    expect(data.http).toBeUndefined();
  });
});
