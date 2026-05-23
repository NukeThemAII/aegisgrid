import { describe, expect, it, vi } from 'vitest';
import { parseAllowlist } from '@/lib/scanner-scope';
import {
  SCAN_DEFINITIONS,
  createScannerService,
  scanTypeFromPath,
  type ScannerValidationResult,
} from './scanner-service';

const publicValidation: ScannerValidationResult = {
  ok: true,
  resolved: ['93.184.216.34'],
};

function createTestService(overrides: Partial<Parameters<typeof createScannerService>[0]> = {}) {
  return createScannerService({
    serviceKey: 'scanner-secret',
    allowlist: parseAllowlist('verified.example,*.verified.example'),
    requireVerification: true,
    validateTarget: vi.fn(async () => publicValidation),
    now: () => new Date('2026-01-02T03:04:05.000Z'),
    ...overrides,
  });
}

describe('scanner v2 scan definitions', () => {
  it('classifies passive and active modules explicitly', () => {
    expect(SCAN_DEFINITIONS.rdns.mode).toBe('passive');
    expect(SCAN_DEFINITIONS.whois.mode).toBe('passive');
    expect(SCAN_DEFINITIONS.subdomains.mode).toBe('passive');
    expect(SCAN_DEFINITIONS.geoloc.mode).toBe('passive');
    expect(SCAN_DEFINITIONS.vuln.mode).toBe('passive');

    expect(SCAN_DEFINITIONS.quick.mode).toBe('active');
    expect(SCAN_DEFINITIONS.ssl.mode).toBe('active');
    expect(SCAN_DEFINITIONS.headers.mode).toBe('active');
    expect(SCAN_DEFINITIONS.tech.mode).toBe('active');
  });

  it('maps /scan/:type paths to known scan types only', () => {
    expect(scanTypeFromPath('/scan/rdns')).toBe('rdns');
    expect(scanTypeFromPath('/scan/headers')).toBe('headers');
    expect(scanTypeFromPath('/api/scanner')).toBeNull();
    expect(scanTypeFromPath('/scan/deep')).toBeNull();
  });
});

describe('scanner v2 service policy', () => {
  it('fails closed when the local service shared key is not configured', async () => {
    const validateTarget = vi.fn(async () => publicValidation);
    const rdns = vi.fn();
    const service = createTestService({ serviceKey: '', validateTarget, adapters: { rdns } });

    const result = await service.scan({ type: 'rdns', target: 'example.com', key: 'scanner-secret' });

    expect(result.status).toBe(503);
    expect(result.body.error).toBe('scanner service not configured');
    expect(validateTarget).not.toHaveBeenCalled();
    expect(rdns).not.toHaveBeenCalled();
  });

  it('requires the shared scanner key before target validation or dispatch', async () => {
    const validateTarget = vi.fn(async () => publicValidation);
    const rdns = vi.fn();
    const service = createTestService({ validateTarget, adapters: { rdns } });

    const result = await service.scan({ type: 'rdns', target: 'example.com', key: 'wrong' });

    expect(result.status).toBe(401);
    expect(result.body.error).toBe('invalid scanner key');
    expect(validateTarget).not.toHaveBeenCalled();
    expect(rdns).not.toHaveBeenCalled();
  });

  it('requires a non-empty target before validation or dispatch', async () => {
    const validateTarget = vi.fn(async () => publicValidation);
    const rdns = vi.fn();
    const service = createTestService({ validateTarget, adapters: { rdns } });

    const result = await service.scan({ type: 'rdns', target: '   ', key: 'scanner-secret' });

    expect(result.status).toBe(400);
    expect(result.body.error).toBe('missing target');
    expect(validateTarget).not.toHaveBeenCalled();
    expect(rdns).not.toHaveBeenCalled();
  });

  it('blocks private or reserved targets before any module runs', async () => {
    const rdns = vi.fn();
    const service = createTestService({
      validateTarget: vi.fn(async () => ({ ok: false, reason: 'IPv4 in reserved range' })),
      adapters: { rdns },
    });

    const result = await service.scan({ type: 'rdns', target: '127.0.0.1', key: 'scanner-secret' });

    expect(result.status).toBe(403);
    expect(result.body.error).toBe('target blocked');
    expect(rdns).not.toHaveBeenCalled();
  });

  it('allows passive modules for public targets without allowlist membership', async () => {
    const rdns = vi.fn(async () => ({ records: ['mail.example.net'] }));
    const service = createTestService({ adapters: { rdns } });

    const result = await service.scan({ type: 'rdns', target: 'unverified.example.net', key: 'scanner-secret' });

    expect(result.status).toBe(200);
    expect(rdns).toHaveBeenCalledOnce();
    expect(result.body.ok).toBe(true);
    expect(result.body.scan_type).toBe('rdns');
    expect(result.body.mode).toBe('passive');
    expect(result.body.status).toBe('ok');
    expect(result.body.fetched_at).toBe('2026-01-02T03:04:05.000Z');
  });

  it('denies active modules unless the target is verified or allowlisted', async () => {
    const quick = vi.fn();
    const service = createTestService({ adapters: { quick } });

    const result = await service.scan({ type: 'quick', target: 'unverified.example.net', key: 'scanner-secret' });

    expect(result.status).toBe(403);
    expect(result.body.error).toBe('target not verified');
    expect(quick).not.toHaveBeenCalled();
  });

  it('runs active module adapters only after allowlist verification passes', async () => {
    const quick = vi.fn(async () => ({ ports: [] }));
    const service = createTestService({ adapters: { quick } });

    const result = await service.scan({ type: 'quick', target: 'api.verified.example', key: 'scanner-secret' });

    expect(result.status).toBe(200);
    expect(quick).toHaveBeenCalledOnce();
    expect(result.body.ok).toBe(true);
    expect(result.body.scan_type).toBe('quick');
    expect(result.body.mode).toBe('active');
    expect(result.body.status).toBe('ok');
  });

  it('fails closed for active modules that have no adapter wired yet', async () => {
    const service = createTestService();

    const result = await service.scan({ type: 'quick', target: 'verified.example', key: 'scanner-secret' });

    expect(result.status).toBe(501);
    expect(result.body.error).toBe('scan module unavailable');
    expect(result.body.mode).toBe('active');
  });

  it('returns an empty normalized placeholder for passive modules without adapters', async () => {
    const service = createTestService();

    const result = await service.scan({ type: 'whois', target: 'example.com', key: 'scanner-secret' });

    expect(result.status).toBe(200);
    expect(result.body.ok).toBe(true);
    expect(result.body.status).toBe('source_unavailable');
    expect(result.body.source).toBe('aegisgrid-scanner-v2');
    expect(result.body.data).toEqual({});
  });

  it('uses the SSRF guard by default when no validator is injected', async () => {
    const service = createScannerService({
      serviceKey: 'scanner-secret',
      allowlist: [],
      requireVerification: true,
    });

    const result = await service.scan({ type: 'rdns', target: '127.0.0.1', key: 'scanner-secret' });

    expect(result.status).toBe(403);
    expect(result.body.error).toBe('target blocked');
  });

  it('returns a normalized upstream failure when an adapter throws', async () => {
    const service = createTestService({
      adapters: {
        rdns: vi.fn(async () => {
          throw new Error('resolver offline');
        }),
      },
    });

    const result = await service.scan({ type: 'rdns', target: 'example.com', key: 'scanner-secret' });

    expect(result.status).toBe(502);
    expect(result.body.ok).toBe(false);
    expect(result.body.error).toBe('scan module failed');
    expect(result.body.detail).toBe('resolver offline');
  });

  it('rejects unknown scan types without dispatch', async () => {
    const service = createTestService();

    const result = await service.scan({ type: 'deep', target: 'example.com', key: 'scanner-secret' });

    expect(result.status).toBe(404);
    expect(result.body.error).toBe('scan type not available');
    expect(result.body.available_scans).toContain('rdns');
    expect(result.body.available_scans).not.toContain('deep');
  });

  it('handles the local scanner /scan/:type URL shape used by the proxy', async () => {
    const rdns = vi.fn(async () => ({ records: ['mx.example.net'] }));
    const service = createTestService({ adapters: { rdns } });

    const result = await service.handleUrl(
      'http://127.0.0.1:4007/scan/rdns?key=scanner-secret&target=example.net',
    );

    expect(result.status).toBe(200);
    expect(rdns).toHaveBeenCalledWith('example.net');
    expect(result.body.scan_type).toBe('rdns');
  });

  it('fails closed for local scanner URLs that do not map to known scan endpoints', async () => {
    const service = createTestService();

    const result = await service.handleUrl('http://127.0.0.1:4007/scan/deep?key=scanner-secret&target=example.net');

    expect(result.status).toBe(404);
    expect(result.body.error).toBe('scan type not available');
  });
});
