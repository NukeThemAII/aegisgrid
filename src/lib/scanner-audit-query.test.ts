import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  readAuditEntries,
  formatAuditResponse,
  type AuditJsonResponse,
} from './scanner-audit-query';

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.SCANNER_AUDIT_LOG_PATH;
});

const sampleLine1 = JSON.stringify({
  prefix: '[AEGIS-AUDIT]',
  event_id: 'scan_1',
  timestamp: '2026-01-01T00:00:00Z',
  scan_type: 'rdns',
  sanitized_target: 'example.com',
  mode: 'passive',
  decision: 'allowed',
  result_status: 200,
});

const sampleLine2 = JSON.stringify({
  prefix: '[AEGIS-AUDIT]',
  event_id: 'scan_2',
  timestamp: '2026-01-01T00:01:00Z',
  scan_type: 'quick',
  sanitized_target: 'test.com',
  mode: 'active',
  decision: 'denied',
  result_status: 403,
});

describe('readAuditEntries', () => {
  it('returns empty array for non-existent file', async () => {
    const entries = await readAuditEntries({
      logPath: '/tmp/does-not-exist-audit-test-xyz.jsonl',
    });
    expect(entries).toEqual([]);
  });

  it('parses JSONL lines into objects', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'aegis-query-'));
    const logPath = join(dir, 'audit.jsonl');
    try {
      await writeFile(logPath, `${sampleLine1}\n${sampleLine2}\n`, 'utf8');
      const entries = await readAuditEntries({ logPath });
      expect(entries).toHaveLength(2);
      expect(entries[0]).toHaveProperty('event_id');
      expect(entries[1]).toHaveProperty('event_id');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('returns entries newest-first (reverse order from file)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'aegis-query-'));
    const logPath = join(dir, 'audit.jsonl');
    try {
      await writeFile(logPath, `${sampleLine1}\n${sampleLine2}\n`, 'utf8');
      const entries = await readAuditEntries({ logPath });
      // scan_2 was appended second (newer), so it should appear first
      expect(entries[0]).toMatchObject({ event_id: 'scan_2' });
      expect(entries[1]).toMatchObject({ event_id: 'scan_1' });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('supports limit option (default 100)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'aegis-query-'));
    const logPath = join(dir, 'audit.jsonl');
    try {
      // Write 5 lines
      const lines = Array.from({ length: 5 }, (_, i) =>
        JSON.stringify({ event_id: `scan_${i}`, ts: i })
      ).join('\n') + '\n';
      await writeFile(logPath, lines, 'utf8');

      // Limit to 3
      const entries = await readAuditEntries({ logPath, limit: 3 });
      expect(entries).toHaveLength(3);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('clamps limit to max 1000', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'aegis-query-'));
    const logPath = join(dir, 'audit.jsonl');
    try {
      // Write 3 lines
      const lines = Array.from({ length: 3 }, (_, i) =>
        JSON.stringify({ event_id: `scan_${i}` })
      ).join('\n') + '\n';
      await writeFile(logPath, lines, 'utf8');

      // Request limit above 1000 — should still work, just clamped
      const entries = await readAuditEntries({ logPath, limit: 5000 });
      expect(entries).toHaveLength(3); // only 3 lines exist, clamped limit doesn't error
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('clamps limit to minimum 1', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'aegis-query-'));
    const logPath = join(dir, 'audit.jsonl');
    try {
      const lines = `${sampleLine1}\n${sampleLine2}\n`;
      await writeFile(logPath, lines, 'utf8');

      const entries = await readAuditEntries({ logPath, limit: 0 });
      expect(entries).toHaveLength(1); // clamped to 1
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('skips malformed and empty lines gracefully', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'aegis-query-'));
    const logPath = join(dir, 'audit.jsonl');
    try {
      const content = [
        sampleLine1,
        '',
        'NOT VALID JSON {{{',
        sampleLine2,
        '   ',
      ].join('\n') + '\n';
      await writeFile(logPath, content, 'utf8');

      const entries = await readAuditEntries({ logPath });
      expect(entries).toHaveLength(2);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('never includes raw file path in returned data', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'aegis-query-'));
    const logPath = join(dir, 'audit.jsonl');
    try {
      await writeFile(logPath, `${sampleLine1}\n`, 'utf8');
      const entries = await readAuditEntries({ logPath });
      const serialized = JSON.stringify(entries);
      expect(serialized).not.toContain(logPath);
      expect(serialized).not.toContain(dir);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('strips fields containing key, secret, token, or auth from entries', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'aegis-query-'));
    const logPath = join(dir, 'audit.jsonl');
    try {
      const sensitiveEntry = JSON.stringify({
        event_id: 'scan_sensitive',
        scan_type: 'rdns',
        api_key: 'SUPER_SECRET_KEY_123',
        secret_value: 'hidden',
        access_token: 'tok_abc',
        authorization: 'Bearer xyz',
        Authorization: 'Bearer abc',
        x_auth_header: 'secret',
        sanitized_target: 'example.com',
      });
      await writeFile(logPath, `${sensitiveEntry}\n`, 'utf8');
      const entries = await readAuditEntries({ logPath });
      expect(entries).toHaveLength(1);
      const entry = entries[0];
      // Safe fields should remain
      expect(entry.event_id).toBe('scan_sensitive');
      expect(entry.scan_type).toBe('rdns');
      expect(entry.sanitized_target).toBe('example.com');
      // Sensitive fields should be stripped
      expect(entry).not.toHaveProperty('api_key');
      expect(entry).not.toHaveProperty('secret_value');
      expect(entry).not.toHaveProperty('access_token');
      expect(entry).not.toHaveProperty('authorization');
      expect(entry).not.toHaveProperty('Authorization');
      expect(entry).not.toHaveProperty('x_auth_header');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('uses SCANNER_AUDIT_LOG_PATH env var as default path', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'aegis-query-'));
    const logPath = join(dir, 'env-audit.jsonl');
    try {
      await writeFile(logPath, `${sampleLine1}\n`, 'utf8');
      process.env.SCANNER_AUDIT_LOG_PATH = logPath;
      const entries = await readAuditEntries();
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({ event_id: 'scan_1' });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('formatAuditResponse', () => {
  const sampleEntries: Record<string, unknown>[] = [
    { event_id: 'scan_2', scan_type: 'quick', sanitized_target: 'test.com' },
    { event_id: 'scan_1', scan_type: 'rdns', sanitized_target: 'example.com' },
  ];

  it('json format returns { entries, count }', () => {
    const result = formatAuditResponse(sampleEntries, 'json') as AuditJsonResponse;
    expect(result).toHaveProperty('entries');
    expect(result).toHaveProperty('count');
    expect(result.entries).toEqual(sampleEntries);
    expect(result.count).toBe(2);
  });

  it('json format returns correct count for empty array', () => {
    const result = formatAuditResponse([], 'json') as AuditJsonResponse;
    expect(result.entries).toEqual([]);
    expect(result.count).toBe(0);
  });

  it('jsonl format returns newline-delimited JSON string', () => {
    const result = formatAuditResponse(sampleEntries, 'jsonl') as string;
    expect(typeof result).toBe('string');
    const lines = result.split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0])).toEqual(sampleEntries[0]);
    expect(JSON.parse(lines[1])).toEqual(sampleEntries[1]);
  });

  it('jsonl format returns empty string for empty array', () => {
    const result = formatAuditResponse([], 'jsonl') as string;
    expect(result).toBe('');
  });
});
