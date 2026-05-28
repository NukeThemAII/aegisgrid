import { NextResponse } from 'next/server';
import { isRateLimited, getClientIp } from '@/lib/ssrf-guard';

// ── External API response types ──

interface IpApiResponse {
  status: 'success' | 'fail';
  message?: string;
  continent?: string;
  country?: string;
  countryCode?: string;
  region?: string;
  regionName?: string;
  city?: string;
  zip?: string;
  lat?: number;
  lon?: number;
  timezone?: string;
  isp?: string;
  org?: string;
  as?: string;
  asname?: string;
  mobile?: boolean;
  proxy?: boolean;
  hosting?: boolean;
  query?: string;
}

// ── Normalised output types ──

interface GeoResult {
  country?: string;
  country_code?: string;
  region?: string;
  city?: string;
  lat?: number;
  lon?: number;
  timezone?: string;
  isp?: string;
  org?: string;
  as_number?: string;
  as_name?: string;
  is_mobile?: boolean;
  is_proxy?: boolean;
  is_hosting?: boolean;
}

interface Reputation {
  is_proxy: boolean;
  is_hosting: boolean;
  is_mobile: boolean;
  risk_level: 'HIGH' | 'MEDIUM' | 'LOW';
}

interface IpResult {
  ip: string;
  timestamp: string;
  geo?: GeoResult;
  reputation: Reputation;
}

// IP Geolocation + Reputation — combines multiple free sources
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const ip = searchParams.get('ip');
  if (!ip) return NextResponse.json({ error: 'Missing ip parameter' }, { status: 400 });

  const clientIp = getClientIp(req);
  if (isRateLimited(clientIp, 20, 60_000)) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  // Validate IP format — IPv4 octets must be 0-255, IPv6 must contain colons
  const ipv4 = /^(\d{1,3}\.){3}\d{1,3}$/;
  const ipv6 = /^[0-9a-fA-F]{1,4}(:[0-9a-fA-F]{0,4}){2,7}$/;
  const isV4 = ipv4.test(ip);
  const isV6 = !isV4 && ipv6.test(ip);
  if (isV4) {
    const octets = ip.split('.').map(Number);
    if (octets.some(o => o > 255)) {
      return NextResponse.json({ error: 'Invalid IP format' }, { status: 400 });
    }
  }
  if (!isV4 && !isV6) {
    return NextResponse.json({ error: 'Invalid IP format' }, { status: 400 });
  }

  try {
    let geo: GeoResult | undefined;

    // 1. ip-api.com — geolocation (free, no key)
    // Note: ip-api.com free tier requires HTTP; HTTPS is paid-only.
    // The data returned is public geolocation metadata, not sensitive user data.
    try {
      const res = await fetch(`http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,message,continent,country,countryCode,region,regionName,city,zip,lat,lon,timezone,isp,org,as,asname,mobile,proxy,hosting,query`, {
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const data = await res.json() as IpApiResponse;
        if (data.status === 'success') {
          geo = {
            country: data.country,
            country_code: data.countryCode,
            region: data.regionName,
            city: data.city,
            lat: data.lat,
            lon: data.lon,
            timezone: data.timezone,
            isp: data.isp,
            org: data.org,
            as_number: data.as,
            as_name: data.asname,
            is_mobile: data.mobile,
            is_proxy: data.proxy,
            is_hosting: data.hosting,
          };
        }
      }
    } catch (e) { console.warn('[AEGISGRID] Suppressed error:', e instanceof Error ? e.message : e); }

    // 2. AbuseIPDB-style check via ip-api proxy flag
    const reputation: Reputation = {
      is_proxy: geo?.is_proxy || false,
      is_hosting: geo?.is_hosting || false,
      is_mobile: geo?.is_mobile || false,
      risk_level: geo?.is_proxy ? 'HIGH' : geo?.is_hosting ? 'MEDIUM' : 'LOW',
    };

    const result: IpResult = { ip, timestamp: new Date().toISOString(), geo, reputation };
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: 'IP lookup failed' }, { status: 500 });
  }
}
