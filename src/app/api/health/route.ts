import { NextResponse } from 'next/server';

/** Must match the version in package.json */
const APP_VERSION = '0.1.0';

/**
 * All deployed API routes grouped by functional category.
 * Keep this list in sync with the build output whenever routes are added or removed.
 */
const ROUTE_CATEGORIES: Record<string, string[]> = {
  geospatial: [
    '/api/earthquakes',
    '/api/fires',
    '/api/weather',
    '/api/space-weather',
    '/api/air-quality',
    '/api/radiation',
    '/api/satellites',
    '/api/sentinel',
    '/api/balloons',
  ],
  aviation: [
    '/api/flights',
  ],
  maritime: [
    '/api/maritime',
  ],
  cyber: [
    '/api/cyber-threats',
    '/api/osint/bgp',
    '/api/osint/certs',
    '/api/osint/cve',
    '/api/osint/dns',
    '/api/osint/ip',
    '/api/osint/sweep',
    '/api/osint/threats',
    '/api/osint/whois',
    '/api/scanner',
    '/api/scanner/admin/allowlist',
    '/api/scanner/admin/audit',
    '/api/scanner/health',
    '/api/scanner/verification',
  ],
  intel: [
    '/api/gdelt',
    '/api/news',
    '/api/live-news',
    '/api/frontlines',
    '/api/country-risk',
    '/api/region-dossier',
    '/api/infrastructure',
    '/api/cctv',
    '/api/cctv/stream-status',
  ],
  markets: [
    '/api/markets',
  ],
  platform: [
    '/api/health',
    '/api/auth/session',
    '/api/platform/status',
    '/api/comms',
  ],
  billing: [
    '/api/billing/checkout',
    '/api/billing/portal',
    '/api/billing/webhook',
    '/api/x402/audit',
    '/api/x402/enrich',
    '/api/x402/report',
    '/api/reports',
  ],
};

export async function GET() {
  return NextResponse.json(
    {
      status: 'operational',
      platform: 'AEGISGRID',
      version: APP_VERSION,
      uptime: process.uptime ? Math.round(process.uptime()) : 0,
      timestamp: new Date().toISOString(),
      endpoints: ROUTE_CATEGORIES,
    },
    {
      headers: {
        'Cache-Control': 'no-cache, no-store',
      },
    },
  );
}
