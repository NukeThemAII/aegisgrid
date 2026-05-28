import { NextResponse } from 'next/server';
import { isRateLimited, getClientIp } from '@/lib/ssrf-guard';

// ── BGPView API response types ──

interface BgpViewResponse<T> {
  status: string;
  status_message?: string;
  data: T;
}

interface BgpIpData {
  ip: string;
  prefixes?: Array<{ prefix: string; ip: string; cidr: number }>;
}

interface BgpAsnData {
  asn: number;
  name: string;
  [key: string]: unknown;
}

interface BgpPrefix {
  prefix: string;
  [key: string]: unknown;
}

interface BgpPeer {
  asn: number;
  [key: string]: unknown;
}

interface BgpPrefixesData {
  ipv4_prefixes?: BgpPrefix[];
  ipv6_prefixes?: BgpPrefix[];
}

interface BgpPeersData {
  ipv4_peers?: BgpPeer[];
}

// ── Normalised output types ──

interface BgpResult {
  query: string;
  timestamp: string;
  type?: 'ip' | 'asn';
  ip?: BgpIpData;
  asn?: BgpAsnData;
  prefixes?: {
    ipv4: BgpPrefix[];
    ipv6: BgpPrefix[];
    total_v4: number;
    total_v6: number;
  };
  peers?: {
    upstream: BgpPeer[];
    total: number;
  };
}

// BGP/ASN Lookup via bgpview.io (free, no key)
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get('query'); // Can be IP, ASN, or prefix
  if (!query) return NextResponse.json({ error: 'Missing query parameter (IP, ASN number, or prefix)' }, { status: 400 });

  const clientIp = getClientIp(req);
  if (isRateLimited(clientIp, 20, 60_000)) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  try {
    const results: BgpResult = { query, timestamp: new Date().toISOString() };

    // Detect query type
    const isIPFormat = /^(\d{1,3}\.){3}\d{1,3}$/.test(query);
    const isIP = isIPFormat && query.split('.').every(o => Number(o) <= 255);
    const isASN = /^(AS)?\d+$/i.test(query);
    const asnNum = isASN ? query.replace(/^AS/i, '') : null;

    if (isIP) {
      // IP → ASN lookup
      const res = await fetch(`https://api.bgpview.io/ip/${encodeURIComponent(query)}`, {
        signal: AbortSignal.timeout(8000),
        headers: { 'Accept': 'application/json' },
      });
      if (res.ok) {
        const data = await res.json() as BgpViewResponse<BgpIpData>;
        if (data.status === 'ok') {
          results.ip = data.data;
          results.type = 'ip';
        }
      }
    } else if (asnNum) {
      // ASN details
      const [asnRes, prefixRes, peersRes] = await Promise.allSettled([
        fetch(`https://api.bgpview.io/asn/${asnNum}`, { signal: AbortSignal.timeout(8000) }),
        fetch(`https://api.bgpview.io/asn/${asnNum}/prefixes`, { signal: AbortSignal.timeout(8000) }),
        fetch(`https://api.bgpview.io/asn/${asnNum}/peers`, { signal: AbortSignal.timeout(8000) }),
      ]);

      if (asnRes.status === 'fulfilled' && asnRes.value.ok) {
        const d = await asnRes.value.json() as BgpViewResponse<BgpAsnData>;
        if (d.status === 'ok') results.asn = d.data;
      }
      if (prefixRes.status === 'fulfilled' && prefixRes.value.ok) {
        const d = await prefixRes.value.json() as BgpViewResponse<BgpPrefixesData>;
        if (d.status === 'ok') {
          results.prefixes = {
            ipv4: (d.data?.ipv4_prefixes || []).slice(0, 20),
            ipv6: (d.data?.ipv6_prefixes || []).slice(0, 10),
            total_v4: d.data?.ipv4_prefixes?.length || 0,
            total_v6: d.data?.ipv6_prefixes?.length || 0,
          };
        }
      }
      if (peersRes.status === 'fulfilled' && peersRes.value.ok) {
        const d = await peersRes.value.json() as BgpViewResponse<BgpPeersData>;
        if (d.status === 'ok') {
          results.peers = {
            upstream: (d.data?.ipv4_peers || []).slice(0, 10),
            total: d.data?.ipv4_peers?.length || 0,
          };
        }
      }
      results.type = 'asn';
    } else {
      return NextResponse.json({ error: 'Unrecognized query format. Use IP address or AS number.' }, { status: 400 });
    }

    return NextResponse.json(results);
  } catch {
    return NextResponse.json({ error: 'BGP lookup failed' }, { status: 500 });
  }
}
