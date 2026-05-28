import { NextResponse } from 'next/server';
import { isRateLimited, getClientIp } from '@/lib/ssrf-guard';

// ── Google DNS-over-HTTPS response types ──

interface DnsAnswer {
  name: string;
  type: number;
  TTL: number;
  data: string;
}

interface DnsApiResponse {
  Status: number;
  TC?: boolean;
  RD?: boolean;
  RA?: boolean;
  AD?: boolean;
  CD?: boolean;
  Question?: unknown[];
  Answer?: DnsAnswer[];
}

// ── Normalised output types ──

interface DnsRecord {
  name: string;
  type: number;
  ttl: number;
  data: string;
}

interface DnsResult {
  domain: string;
  records: Record<string, DnsRecord[]>;
  summary: {
    ip_addresses: string[];
    mail_servers: string[];
    nameservers: string[];
    total_records: number;
  };
  timestamp: string;
}

// DNS Lookup via Google DNS-over-HTTPS (free, no key)
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const domain = searchParams.get('domain');
  if (!domain) return NextResponse.json({ error: 'Missing domain parameter' }, { status: 400 });

  const clientIp = getClientIp(req);
  if (isRateLimited(clientIp, 20, 60_000)) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  // Basic domain validation
  if (!/^[a-zA-Z0-9][a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(domain)) {
    return NextResponse.json({ error: 'Invalid domain format' }, { status: 400 });
  }

  try {
    const types = ['A', 'AAAA', 'MX', 'NS', 'TXT', 'CNAME', 'SOA'];
    const records: Record<string, DnsRecord[]> = {};

    const lookups = await Promise.allSettled(
      types.map(async (type) => {
        const res = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=${type}`, {
          signal: AbortSignal.timeout(5000),
          headers: { 'Accept': 'application/json' },
        });
        if (res.ok) {
          const data = await res.json() as DnsApiResponse;
          return { type, answers: data.Answer || [], status: data.Status };
        }
        return { type, answers: [] as DnsAnswer[], status: -1 };
      })
    );

    for (const result of lookups) {
      if (result.status === 'fulfilled') {
        const { type, answers } = result.value;
        records[type] = answers.map((a) => ({
          name: a.name,
          type: a.type,
          ttl: a.TTL,
          data: a.data,
        }));
      }
    }

    // Extract useful summary
    const aRecords = records.A || [];
    const mxRecords = records.MX || [];
    const nsRecords = records.NS || [];

    const dnsResult: DnsResult = {
      domain,
      records,
      summary: {
        ip_addresses: aRecords.map((r) => r.data),
        mail_servers: mxRecords.map((r) => r.data),
        nameservers: nsRecords.map((r) => r.data),
        total_records: Object.values(records).flat().length,
      },
      timestamp: new Date().toISOString(),
    };

    return NextResponse.json(dnsResult);
  } catch {
    return NextResponse.json({ error: 'DNS lookup failed' }, { status: 500 });
  }
}
