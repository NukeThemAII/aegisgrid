import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function makeRequest(url: string, ip: string = '203.0.113.10'): Request {
  return new Request(url, {
    headers: {
      'x-forwarded-for': ip,
    },
  });
}

async function loadRoute(env: Record<string, string | undefined> = {}) {
  vi.resetModules();

  delete process.env.SCANNER_URL;
  delete process.env.SCANNER_KEY;
  delete process.env.SCANNER_ALLOWED_TARGETS;
  delete process.env.SCANNER_REQUIRE_VERIFICATION;

  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  return import('./route');
}

beforeEach(() => {
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.SCANNER_URL;
  delete process.env.SCANNER_KEY;
  delete process.env.SCANNER_ALLOWED_TARGETS;
  delete process.env.SCANNER_REQUIRE_VERIFICATION;
});

describe('/api/scanner route policy integration', () => {
  it('allows passive vuln CPE lookups without scanner backend config', async () => {
    const { GET } = await loadRoute();

    const res = await GET(makeRequest('http://localhost/api/scanner?type=vuln&target=cpe%3A2.3%3Aa%3Avendor%3Aproduct%3A1.0'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.mode).toBe('passive');
    expect(body.scan_type).toBe('vuln');
    expect(JSON.stringify(body)).not.toContain('SCANNER_KEY');
    expect(console.info).toHaveBeenCalled();
  });

  it('keeps active scans fail-closed when target is not explicitly allowlisted', async () => {
    const { GET } = await loadRoute({
      SCANNER_URL: 'http://127.0.0.1:4007',
      SCANNER_KEY: 'scanner-secret',
      SCANNER_REQUIRE_VERIFICATION: 'false',
    });

    const res = await GET(makeRequest('http://localhost/api/scanner?type=quick&target=example.com', '203.0.113.11'));
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.code).toBe('ACTIVE_SCAN_REQUIRES_VERIFICATION');
    expect(JSON.stringify(body)).not.toContain('scanner-secret');
  });

  it('returns backend-not-configured only after explicit allowlist verification passes', async () => {
    const { GET } = await loadRoute({
      SCANNER_ALLOWED_TARGETS: 'example.com',
    });

    const res = await GET(makeRequest('http://localhost/api/scanner?type=quick&target=example.com', '203.0.113.12'));
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.code).toBe('SCANNER_BACKEND_NOT_CONFIGURED');
    expect(JSON.stringify(body)).not.toContain('SCANNER_KEY');
  });

  it('blocks reserved network targets on passive host lookups', async () => {
    const { GET } = await loadRoute();

    const res = await GET(makeRequest('http://localhost/api/scanner?type=rdns&target=127.0.0.1', '203.0.113.13'));
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.code).toBe('TARGET_BLOCKED');
  });

  it('does not let CVE/CPE evidence bypass host validation for non-vuln scan types', async () => {
    const { GET } = await loadRoute();

    const res = await GET(makeRequest('http://localhost/api/scanner?type=rdns&target=CVE-2024-1234', '203.0.113.14'));
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.code).toBe('TARGET_BLOCKED');
  });
});
