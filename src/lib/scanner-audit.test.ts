import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getScannerAuditConfig,
  recordScanAudit,
  type ScanAuditEntry,
} from './scanner-audit';

const baseEntry: ScanAuditEntry = {
  scan_type: 'rdns',
  target_classification: 'domain',
  sanitized_target: 'example.com',
  mode: 'passive',
  decision: 'allowed',
  result_status: 200,
  duration_ms: 12,
  client_ip: '203.0.113.10',
};

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.SCANNER_AUDIT_PERSISTENCE;
  delete process.env.SCANNER_AUDIT_LOG_PATH;
});

describe('scanner audit persistence', () => {
  it('appends scanner audit entries as JSONL without leaking secrets', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'aegisgrid-audit-'));
    const path = join(dir, 'scanner-audit.jsonl');
    process.env.SCANNER_AUDIT_PERSISTENCE = 'file';
    process.env.SCANNER_AUDIT_LOG_PATH = path;
    vi.spyOn(console, 'info').mockImplementation(() => undefined);

    try {
      await recordScanAudit(baseEntry);
      await recordScanAudit({ ...baseEntry, scan_type: 'vuln', sanitized_target: 'CVE-2024-1234' });

      const lines = (await readFile(path, 'utf8')).trim().split('\n');
      expect(lines).toHaveLength(2);
      const parsed = lines.map(line => JSON.parse(line) as Record<string, unknown>);

      expect(parsed[0].event_id).toEqual(expect.stringMatching(/^scan_/));
      expect(parsed[0].scan_type).toBe('rdns');
      expect(parsed[0].entitlement).toBe('public_passive');
      expect(parsed[1].scan_type).toBe('vuln');
      expect(JSON.stringify(parsed)).not.toContain('SCANNER_KEY');
      expect(JSON.stringify(parsed)).not.toContain('scanner-secret');
      expect(JSON.stringify(parsed)).not.toContain('Authorization');
      expect(console.info).toHaveBeenCalledTimes(2);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('can disable audit emission entirely', async () => {
    process.env.SCANNER_AUDIT_PERSISTENCE = 'off';
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    await recordScanAudit(baseEntry);

    expect(infoSpy).not.toHaveBeenCalled();
    expect(getScannerAuditConfig()).toMatchObject({ persistence: 'off', enabled: false });
  });
});
