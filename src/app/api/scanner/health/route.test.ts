import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.SCANNER_AUDIT_PERSISTENCE;
  delete process.env.SCANNER_AUDIT_LOG_PATH;
});

describe('/api/scanner/health', () => {
  it('reports passive adapter source health and audit persistence config', async () => {
    vi.resetModules();
    process.env.SCANNER_AUDIT_PERSISTENCE = 'file';
    process.env.SCANNER_AUDIT_LOG_PATH = '.data/test-scanner-audit.jsonl';

    const { GET } = await import('./route');
    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.service).toBe('aegisgrid-scanner-v2');
    expect(body.audit).toMatchObject({ persistence: 'file', enabled: true });
    expect(body.audit.log_path).toBeUndefined();
    expect(body.active_scans.status).toBe('disabled_by_default');
    expect(body.passive_sources.map((source: { scan_type: string }) => source.scan_type).sort()).toEqual([
      'geoloc',
      'rdns',
      'subdomains',
      'vuln',
      'whois',
    ]);
    expect(body.passive_sources.every((source: { adapter_registered: boolean }) => source.adapter_registered)).toBe(true);
    expect(JSON.stringify(body)).not.toContain('SCANNER_KEY');
  });
});
