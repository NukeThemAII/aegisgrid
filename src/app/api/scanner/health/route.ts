import { NextResponse } from 'next/server';
import { getScannerAuditConfig } from '@/lib/scanner-audit';
import { PASSIVE_SCAN_TYPES, ACTIVE_SCAN_TYPES, SCAN_DEFINITIONS } from '@/lib/scanner-policy';
import { createPassiveAdapters } from '@/server/scanner-v2/passive-adapters';

const PASSIVE_SOURCE_META: Record<string, { source: string; source_url?: string; check: string }> = {
  rdns: {
    source: 'node:dns',
    check: 'local_resolver',
  },
  whois: {
    source: 'rdap.org',
    source_url: 'https://rdap.org',
    check: 'fixed_endpoint_unchecked',
  },
  subdomains: {
    source: 'crt.sh',
    source_url: 'https://crt.sh',
    check: 'fixed_endpoint_unchecked',
  },
  geoloc: {
    source: 'ip-api.com',
    source_url: 'http://ip-api.com',
    check: 'fixed_endpoint_unchecked',
  },
  vuln: {
    source: 'cveawg.mitre.org',
    source_url: 'https://cveawg.mitre.org',
    check: 'fixed_endpoint_unchecked',
  },
};

export async function GET() {
  const adapters = createPassiveAdapters();
  const auditConfig = getScannerAuditConfig();
  const { log_path: _logPath, ...safeAuditConfig } = auditConfig;

  const passiveSources = PASSIVE_SCAN_TYPES.map((scanType) => {
    const definition = SCAN_DEFINITIONS[scanType];
    const meta = PASSIVE_SOURCE_META[scanType] ?? { source: 'unknown', check: 'unchecked' };
    return {
      scan_type: scanType,
      label: definition.label,
      mode: definition.mode,
      source: meta.source,
      ...(meta.source_url ? { source_url: meta.source_url } : {}),
      adapter_registered: typeof adapters[scanType] === 'function',
      status: typeof adapters[scanType] === 'function' ? 'registered' : 'missing_adapter',
      check: meta.check,
    };
  });

  return NextResponse.json({
    ok: true,
    service: 'aegisgrid-scanner-v2',
    status: passiveSources.every(source => source.adapter_registered) ? 'ok' : 'degraded',
    fetched_at: new Date().toISOString(),
    passive_sources: passiveSources,
    active_scans: {
      status: 'disabled_by_default',
      scan_types: ACTIVE_SCAN_TYPES,
      requirements: [
        'explicit SCANNER_ALLOWED_TARGETS match',
        'scanner URL configured',
        'scanner API key configured',
      ],
    },
    audit: safeAuditConfig,
  }, {
    headers: {
      'Cache-Control': 'no-store',
    },
  });
}
