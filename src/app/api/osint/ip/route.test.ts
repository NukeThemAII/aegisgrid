import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GET } from './route';

describe('GET /api/osint/ip', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mockRequest(url: string, headers: Record<string, string> = {}) {
    return new Request(url, { headers: new Headers(headers) });
  }

  it('returns 400 when ip parameter is missing', async () => {
    const req = mockRequest('http://localhost/api/osint/ip');
    const res = await GET(req);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Missing ip parameter' });
  });

  it('returns 400 for invalid IPv4 octets', async () => {
    const req = mockRequest('http://localhost/api/osint/ip?ip=999.999.999.999');
    const res = await GET(req);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid IP format' });
  });

  it('returns 400 for invalid IP formats', async () => {
    const req = mockRequest('http://localhost/api/osint/ip?ip=not_an_ip');
    const res = await GET(req);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid IP format' });
  });

  it('returns 400 for invalid IPv6 formats', async () => {
    const req = mockRequest('http://localhost/api/osint/ip?ip=:::');
    const res = await GET(req);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid IP format' });
  });

  it('calls ip-api and returns successful IPv4 lookup', async () => {
    const mockData = {
      status: 'success',
      country: 'United States',
      countryCode: 'US',
      regionName: 'California',
      city: 'Mountain View',
      lat: 37.386,
      lon: -122.0838,
      timezone: 'America/Los_Angeles',
      isp: 'Google LLC',
      org: 'Google Public DNS',
      as: 'AS15169 Google LLC',
      asname: 'GOOGLE',
      mobile: false,
      proxy: false,
      hosting: true,
    };

    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(mockData)));

    const req = mockRequest('http://localhost/api/osint/ip?ip=8.8.8.8');
    const res = await GET(req);
    
    expect(res.status).toBe(200);
    const data = await res.json();
    
    expect(data.ip).toBe('8.8.8.8');
    expect(data.geo.country).toBe('United States');
    expect(data.geo.is_hosting).toBe(true);
    expect(data.reputation.risk_level).toBe('MEDIUM');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('http://ip-api.com/json/8.8.8.8'),
      expect.any(Object)
    );
  });

  it('handles failed upstream gracefully', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'));

    const req = mockRequest('http://localhost/api/osint/ip?ip=8.8.8.8');
    const res = await GET(req);
    
    expect(res.status).toBe(200);
    const data = await res.json();
    
    // The route swallows the error, leaves geo undefined, and sets reputation to LOW
    expect(data.ip).toBe('8.8.8.8');
    expect(data.geo).toBeUndefined();
    expect(data.reputation.risk_level).toBe('LOW');
  });
});
