import { describe, expect, it } from 'vitest';
import {
  canBypassHostValidation,
  classifyScanRequest,
  isPassiveVulnEvidence,
  PASSIVE_SCAN_TYPES,
  ACTIVE_SCAN_TYPES,
  SCAN_DEFINITIONS,
} from './scanner-policy';
import {
  classifyTarget,
  sanitizeTargetForLog,
  type ScanAuditEntry,
} from './scanner-audit';

// ────────────────────────────────────────────────────────────────────────────
// scanner-policy.ts tests
// ────────────────────────────────────────────────────────────────────────────

describe('scanner policy — passive scan classification', () => {
  it.each(PASSIVE_SCAN_TYPES)('allows passive scan type "%s" without allowlist', (scanType) => {
    const result = classifyScanRequest(scanType, false, false);
    expect(result.allowed).toBe(true);
    expect(result.mode).toBe('passive');
    expect(result.code).toBeUndefined();
  });

  it.each(PASSIVE_SCAN_TYPES)('allows passive scan type "%s" even when scanner backend is not configured', (scanType) => {
    const result = classifyScanRequest(scanType, false, false);
    expect(result.allowed).toBe(true);
    expect(result.mode).toBe('passive');
  });
});

describe('scanner policy — active scan classification', () => {
  it.each(ACTIVE_SCAN_TYPES)('denies active scan type "%s" when subject is anonymous', (scanType) => {
    const result = classifyScanRequest(scanType, true, true, false);
    expect(result.allowed).toBe(false);
    expect(result.mode).toBe('active');
    expect(result.code).toBe('ACTIVE_SCAN_REQUIRES_AUTH');
    expect(result.denial_status).toBe(401);
  });

  it.each(ACTIVE_SCAN_TYPES)('denies active scan type "%s" when target is NOT allowlisted', (scanType) => {
    const result = classifyScanRequest(scanType, false, true);
    expect(result.allowed).toBe(false);
    expect(result.mode).toBe('active');
    expect(result.code).toBe('ACTIVE_SCAN_REQUIRES_VERIFICATION');
    expect(result.denial_status).toBe(403);
    expect(result.denial_reason).toContain('ownership verification');
  });

  it.each(ACTIVE_SCAN_TYPES)('denies active scan type "%s" when scanner backend is NOT configured', (scanType) => {
    const result = classifyScanRequest(scanType, true, false);
    expect(result.allowed).toBe(false);
    expect(result.mode).toBe('active');
    expect(result.code).toBe('SCANNER_BACKEND_NOT_CONFIGURED');
    expect(result.denial_status).toBe(503);
  });

  it.each(ACTIVE_SCAN_TYPES)('allows active scan type "%s" when target IS allowlisted AND backend IS configured', (scanType) => {
    const result = classifyScanRequest(scanType, true, true);
    expect(result.allowed).toBe(true);
    expect(result.mode).toBe('active');
  });
});

describe('scanner policy — unknown scan types', () => {
  const unknownTypes = ['deep', 'banner', 'ports', 'traceroute', '', 'QUICK', 'exploit', 'bruteforce'];

  it.each(unknownTypes)('denies unknown scan type "%s"', (scanType) => {
    const result = classifyScanRequest(scanType, true, true);
    expect(result.allowed).toBe(false);
    expect(result.mode).toBe('unknown');
    expect(result.code).toBe('SCAN_TYPE_UNKNOWN');
    expect(result.denial_status).toBe(400);
    expect(result.available_scans).toBeDefined();
    expect(result.available_scans!.length).toBeGreaterThan(0);
  });

  it('includes all known types in the available scans list', () => {
    const result = classifyScanRequest('exploit', true, true);
    const allKnownTypes = Object.keys(SCAN_DEFINITIONS);
    for (const knownType of allKnownTypes) {
      expect(result.available_scans).toContain(knownType);
    }
  });
});

describe('scanner policy — vuln evidence classification', () => {
  it('recognizes CVE IDs as passive vuln evidence', () => {
    expect(isPassiveVulnEvidence('CVE-2024-1234')).toBe(true);
    expect(isPassiveVulnEvidence('CVE-2021-44228')).toBe(true);
    expect(isPassiveVulnEvidence('cve-2024-1234')).toBe(true);
  });

  it('recognizes CPE strings as passive vuln evidence', () => {
    expect(isPassiveVulnEvidence('cpe:2.3:a:apache:log4j:2.14.1')).toBe(true);
    expect(isPassiveVulnEvidence('CPE:/a:vendor:product')).toBe(true);
  });

  it('does NOT classify regular hostnames as vuln evidence', () => {
    expect(isPassiveVulnEvidence('example.com')).toBe(false);
    expect(isPassiveVulnEvidence('8.8.8.8')).toBe(false);
    expect(isPassiveVulnEvidence('CVE-not-a-cve')).toBe(false);
  });

  it('only permits host-validation bypass for vuln CVE/CPE evidence', () => {
    expect(canBypassHostValidation('vuln', 'CVE-2024-1234')).toBe(true);
    expect(canBypassHostValidation('vuln', 'cpe:2.3:a:vendor:product:1.0')).toBe(true);
    expect(canBypassHostValidation('rdns', 'CVE-2024-1234')).toBe(false);
    expect(canBypassHostValidation('quick', 'CVE-2024-1234')).toBe(false);
    expect(canBypassHostValidation('vuln', 'example.com')).toBe(false);
  });
});

describe('scanner policy — no key leakage', () => {
  it('never includes SCANNER_KEY or secrets in any denial response', () => {
    const results = [
      classifyScanRequest('quick', false, true),
      classifyScanRequest('deep', true, true),
      classifyScanRequest('quick', true, false),
      classifyScanRequest('rdns', false, false),
    ];

    for (const result of results) {
      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain('SCANNER_KEY');
      expect(serialized).not.toContain('scanner-secret');
      expect(serialized).not.toContain('key=');
      expect(serialized).not.toContain('Authorization');
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────
// scanner-audit.ts tests
// ────────────────────────────────────────────────────────────────────────────

describe('scanner audit — target classification', () => {
  it('classifies IPv4 addresses', () => {
    expect(classifyTarget('8.8.8.8')).toBe('ipv4');
    expect(classifyTarget('192.168.1.1')).toBe('ipv4');
  });

  it('classifies IPv6 addresses', () => {
    expect(classifyTarget('::1')).toBe('ipv6');
    expect(classifyTarget('2001:db8::1')).toBe('ipv6');
  });

  it('classifies CVE IDs', () => {
    expect(classifyTarget('CVE-2024-1234')).toBe('cve');
    expect(classifyTarget('CVE-2021-44228')).toBe('cve');
  });

  it('classifies CPE strings', () => {
    expect(classifyTarget('cpe:2.3:a:apache:log4j')).toBe('cpe');
  });

  it('classifies domain names', () => {
    expect(classifyTarget('example.com')).toBe('domain');
    expect(classifyTarget('sub.domain.co.uk')).toBe('domain');
  });

  it('classifies empty/unknown targets', () => {
    expect(classifyTarget('')).toBe('unknown');
    expect(classifyTarget('   ')).toBe('unknown');
  });
});

describe('scanner audit — target sanitization', () => {
  it('preserves short targets unchanged', () => {
    expect(sanitizeTargetForLog('example.com')).toBe('example.com');
    expect(sanitizeTargetForLog('CVE-2024-1234')).toBe('CVE-2024-1234');
  });

  it('truncates long targets', () => {
    const long = 'a'.repeat(200);
    const result = sanitizeTargetForLog(long);
    expect(result.length).toBeLessThanOrEqual(121); // 120 + ellipsis char
    expect(result).toContain('…');
  });

  it('strips control characters', () => {
    expect(sanitizeTargetForLog('test\x00\x01\x7f.com')).toBe('test.com');
    expect(sanitizeTargetForLog('line\nnewline')).toBe('linenewline');
  });
});

describe('scanner audit — no secret leakage', () => {
  it('audit entry type does not accept key or auth fields', () => {
    // This is a type-level check — the ScanAuditEntry interface does not
    // have fields for keys, tokens, or auth headers. We verify at runtime
    // that the fields that DO exist are safe.
    const entry: ScanAuditEntry = {
      scan_type: 'rdns',
      target_classification: 'domain',
      sanitized_target: 'example.com',
      mode: 'passive',
      decision: 'allowed',
      result_status: 200,
      duration_ms: 42,
      client_ip: '1.2.3.4',
    };

    const serialized = JSON.stringify(entry);
    expect(serialized).not.toContain('key');
    expect(serialized).not.toContain('secret');
    expect(serialized).not.toContain('token');
    expect(serialized).not.toContain('auth');
  });
});

describe('scanner policy — scan definitions integrity', () => {
  it('passive and active types together cover all scan definitions', () => {
    const allTypes = [...PASSIVE_SCAN_TYPES, ...ACTIVE_SCAN_TYPES].sort();
    const definedTypes = Object.keys(SCAN_DEFINITIONS).sort();
    expect(allTypes).toEqual(definedTypes);
  });

  it('passive types do not overlap with active types', () => {
    const overlap = PASSIVE_SCAN_TYPES.filter(t =>
      (ACTIVE_SCAN_TYPES as readonly string[]).includes(t),
    );
    expect(overlap).toEqual([]);
  });
});
