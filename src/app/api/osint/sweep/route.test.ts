import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GET } from './route';

describe('GET /api/osint/sweep', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function req(url: string, headers: Record<string, string> = {}) {
    return new Request(url, { headers: new Headers(headers) });
  }

  // -- Input validation --

  it('returns 400 when ip parameter is missing', async () => {
    const res = await GET(req('http://localhost/api/osint/sweep'));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Missing ip parameter' });
  });

  it('returns 400 for invalid IPv4 format', async () => {
    const res = await GET(req('http://localhost/api/osint/sweep?ip=not-an-ip'));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid IPv4 address format' });
  });

  it('returns 400 for IPv4 octets > 255', async () => {
    const res = await GET(req('http://localhost/api/osint/sweep?ip=999.1.1.1'));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid IPv4 address format' });
  });

  it('returns 400 for private IP ranges', async () => {
    const privateIPs = [
      '10.0.0.1',        // RFC1918
      '172.16.0.1',      // RFC1918
      '192.168.1.1',     // RFC1918
      '127.0.0.1',       // loopback
      '169.254.169.254', // link-local / cloud metadata
      '0.0.0.0',         // "this" network
      '224.0.0.1',       // multicast
      '100.64.0.1',      // CGNAT
    ];

    for (const ip of privateIPs) {
      const res = await GET(req(`http://localhost/api/osint/sweep?ip=${ip}`));
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('Private and reserved IP ranges are not allowed');
    }
  });

  // -- CIDR validation --

  it('returns 400 for CIDR below 24', async () => {
    const res = await GET(req('http://localhost/api/osint/sweep?ip=8.8.8.8&cidr=16'));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'CIDR must be between 24 and 28' });
  });

  it('returns 400 for CIDR above 28', async () => {
    const res = await GET(req('http://localhost/api/osint/sweep?ip=8.8.8.8&cidr=30'));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'CIDR must be between 24 and 28' });
  });

  it('defaults to CIDR /24 when not specified', async () => {
    // Mock geo + shodan
    const geoData = {
      status: 'success',
      lat: 37.386, lon: -122.0838,
      city: 'Mountain View', regionName: 'California', country: 'United States',
      countryCode: 'US', isp: 'Google', as: 'AS15169', org: 'Google LLC',
    };
    vi.mocked(fetch).mockImplementation(async (url: RequestInfo | URL) => {
      const urlStr = url.toString();
      if (urlStr.includes('ip-api.com')) {
        return new Response(JSON.stringify(geoData));
      }
      // Shodan InternetDB returns 404 for all hosts (no devices found)
      return new Response('', { status: 404 });
    });

    const res = await GET(req('http://localhost/api/osint/sweep?ip=8.8.8.0', { 'x-forwarded-for': 'test-cidr-default' }));
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.cidr).toBe(24);
    expect(data.summary.total_hosts).toBe(256); // /24 = 256 hosts
  });

  // -- Geolocation handling --

  it('returns 502 when geolocation service is down', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('Service Unavailable', { status: 503 }));

    const res = await GET(req('http://localhost/api/osint/sweep?ip=8.8.8.8', { 'x-forwarded-for': 'test-geo-down' }));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'Geolocation service unavailable' });
  });

  it('returns 422 when geolocation fails for the IP', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({
      status: 'fail',
      message: 'reserved range',
    })));

    const res = await GET(req('http://localhost/api/osint/sweep?ip=8.8.8.8', { 'x-forwarded-for': 'test-geo-fail' }));
    expect(res.status).toBe(422);
    const data = await res.json();
    expect(data.error).toContain('Geolocation failed');
  });

  // -- Full sweep with device classification --

  it('performs a full sweep with device classification and risk assessment', async () => {
    const geoData = {
      status: 'success',
      lat: 51.5074, lon: -0.1278,
      city: 'London', regionName: 'England', country: 'United Kingdom',
      countryCode: 'GB', isp: 'BT', as: 'AS2856', org: 'BT',
    };

    vi.mocked(fetch).mockImplementation(async (url: RequestInfo | URL) => {
      const urlStr = url.toString();

      if (urlStr.includes('ip-api.com')) {
        return new Response(JSON.stringify(geoData));
      }

      // Shodan InternetDB — return different device types
      if (urlStr.endsWith('/1.2.3.1')) {
        return new Response(JSON.stringify({
          ip: '1.2.3.1',
          ports: [80, 443],
          hostnames: ['web.example.com'],
          cpes: [],
          vulns: [],
          tags: [],
        }));
      }

      if (urlStr.endsWith('/1.2.3.2')) {
        return new Response(JSON.stringify({
          ip: '1.2.3.2',
          ports: [22],
          hostnames: [],
          cpes: [],
          vulns: ['CVE-2024-1234', 'CVE-2024-5678'],
          tags: [],
        }));
      }

      if (urlStr.endsWith('/1.2.3.3')) {
        return new Response(JSON.stringify({
          ip: '1.2.3.3',
          ports: [554, 80],
          hostnames: [],
          cpes: ['cpe:/a:hikvision:ds-2cd2'],
          vulns: [],
          tags: [],
        }));
      }

      // All other IPs — not found
      return new Response('', { status: 404 });
    });

    const res = await GET(req('http://localhost/api/osint/sweep?ip=1.2.3.1&cidr=28', { 'x-forwarded-for': 'test-full-sweep' }));
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.target_ip).toBe('1.2.3.1');
    expect(data.cidr).toBe(28);
    expect(data.summary.total_hosts).toBe(16); // /28 = 16 hosts
    expect(data.devices.length).toBe(3);
    expect(data.sweep_time_ms).toBeGreaterThanOrEqual(0);

    // Check device classification
    const webServer = data.devices.find((d: { ip: string }) => d.ip === '1.2.3.1');
    expect(webServer.device_type).toBe('Web Server');

    const linuxServer = data.devices.find((d: { ip: string }) => d.ip === '1.2.3.2');
    expect(linuxServer.device_type).toBe('Linux Server');
    expect(linuxServer.risk_level).toBe('HIGH'); // has vulns

    const camera = data.devices.find((d: { ip: string }) => d.ip === '1.2.3.3');
    expect(camera.device_type).toBe('Camera/DVR');

    // Device breakdown
    expect(data.summary.device_breakdown['Web Server']).toBe(1);
    expect(data.summary.device_breakdown['Linux Server']).toBe(1);
    expect(data.summary.device_breakdown['Camera/DVR']).toBe(1);

    // Center from geo
    expect(data.center.city).toBe('London');
    expect(data.center.country).toBe('United Kingdom');
  });

  it('returns 500 when fetch throws entirely', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('DNS failure'));

    const res = await GET(req('http://localhost/api/osint/sweep?ip=8.8.8.8', { 'x-forwarded-for': 'test-crash' }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Sweep failed' });
  });
});
