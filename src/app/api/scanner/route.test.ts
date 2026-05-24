import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function makeRequest(
  url: string,
  ip: string = '203.0.113.10',
  headers: Record<string, string> = {},
): Request {
  return new Request(url, {
    headers: {
      'x-forwarded-for': ip,
      ...headers,
    },
  });
}

async function loadRoute(env: Record<string, string | undefined> = {}) {
  vi.resetModules();

  delete process.env.SCANNER_URL;
  delete process.env.SCANNER_KEY;
  delete process.env.SCANNER_ALLOWED_TARGETS;
  delete process.env.SCANNER_REQUIRE_VERIFICATION;
  delete process.env.SCANNER_AUDIT_PERSISTENCE;
  delete process.env.SCANNER_USER_TOKENS;
  delete process.env.SCANNER_ADMIN_TOKEN;
  delete process.env.SCANNER_ADMIN_ALLOWLIST_PATH;
  delete process.env.SCANNER_TARGETS_DIR;
  delete process.env.SCANNER_VERIFIED_TARGETS;
  process.env.SCANNER_AUDIT_PERSISTENCE = 'console';

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
  delete process.env.SCANNER_AUDIT_PERSISTENCE;
  delete process.env.SCANNER_AUDIT_LOG_PATH;
  delete process.env.SCANNER_USER_TOKENS;
  delete process.env.SCANNER_ADMIN_TOKEN;
  delete process.env.SCANNER_ADMIN_ALLOWLIST_PATH;
  delete process.env.SCANNER_TARGETS_DIR;
  delete process.env.SCANNER_VERIFIED_TARGETS;
});

describe('/api/scanner route policy integration', () => {
  it('proxies active scans only after authenticated subject and verified target entitlement pass', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true, scan_type: 'quick' }), { status: 200 }),
    );
    const { GET } = await loadRoute({
      SCANNER_URL: 'http://127.0.0.1:4007',
      SCANNER_KEY: 'scanner-secret',
      SCANNER_USER_TOKENS: 'analyst:user-secret',
      SCANNER_VERIFIED_TARGETS: 'analyst:8.8.8.8',
    });

    const res = await GET(makeRequest(
      'http://localhost/api/scanner?type=quick&target=8.8.8.8',
      '203.0.113.16',
      { Authorization: 'Bearer user-secret' },
    ));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ ok: true, scan_type: 'quick' });
    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(String(fetchSpy.mock.calls[0]?.[0])).toContain('/scan/quick?');
    expect(String(fetchSpy.mock.calls[0]?.[0])).not.toContain('user-secret');
  });

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
      SCANNER_USER_TOKENS: 'analyst:user-secret',
      SCANNER_REQUIRE_VERIFICATION: 'false',
    });

    const res = await GET(makeRequest(
      'http://localhost/api/scanner?type=quick&target=example.com',
      '203.0.113.11',
      { Authorization: 'Bearer user-secret' },
    ));
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.code).toBe('ACTIVE_SCAN_REQUIRES_VERIFICATION');
    expect(JSON.stringify(body)).not.toContain('scanner-secret');
    expect(JSON.stringify(body)).not.toContain('user-secret');
  });

  it('denies anonymous active scans even when target is admin-allowlisted', async () => {
    const { GET } = await loadRoute({
      SCANNER_URL: 'http://127.0.0.1:4007',
      SCANNER_KEY: 'scanner-secret',
      SCANNER_ALLOWED_TARGETS: 'example.com',
    });

    const res = await GET(makeRequest('http://localhost/api/scanner?type=quick&target=example.com', '203.0.113.15'));
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.code).toBe('ACTIVE_SCAN_REQUIRES_AUTH');
    expect(JSON.stringify(body)).not.toContain('scanner-secret');
  });

  it('returns backend-not-configured only after auth and target entitlement pass', async () => {
    const { GET } = await loadRoute({
      SCANNER_USER_TOKENS: 'analyst:user-secret',
      SCANNER_ALLOWED_TARGETS: 'example.com',
    });

    const res = await GET(makeRequest(
      'http://localhost/api/scanner?type=quick&target=example.com',
      '203.0.113.12',
      { Authorization: 'Bearer user-secret' },
    ));
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.code).toBe('SCANNER_BACKEND_NOT_CONFIGURED');
    expect(JSON.stringify(body)).not.toContain('SCANNER_KEY');
    expect(JSON.stringify(body)).not.toContain('user-secret');
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
