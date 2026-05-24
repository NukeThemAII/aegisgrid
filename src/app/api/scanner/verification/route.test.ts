import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveTxt } from 'node:dns/promises';

vi.mock('node:dns/promises', () => ({
  resolveTxt: vi.fn(),
}));

let tmpDir = '';

async function setupEnv(): Promise<void> {
  vi.resetModules();
  tmpDir = await mkdtemp(join(tmpdir(), 'aegisgrid-verification-route-'));
  process.env.SCANNER_TARGETS_DIR = tmpDir;
  process.env.SCANNER_USER_TOKENS = 'analyst:user-secret';
}

function makeRequest(url: string, init: RequestInit = {}, ip = '203.0.113.10'): Request {
  const headers = new Headers(init.headers);
  headers.set('x-forwarded-for', ip);
  return new Request(url, { ...init, headers });
}

afterEach(async () => {
  vi.restoreAllMocks();
  delete process.env.SCANNER_TARGETS_DIR;
  delete process.env.SCANNER_USER_TOKENS;
  if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
  tmpDir = '';
});

describe('/api/scanner/verification', () => {
  it('denies anonymous challenge requests', async () => {
    await setupEnv();
    const { GET } = await import('./route');

    const res = await GET(makeRequest('http://localhost/api/scanner/verification?target=example.com'));
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.code).toBe('AUTH_REQUIRED');
  });

  it('returns DNS TXT challenge metadata for authenticated scanner subjects', async () => {
    await setupEnv();
    const { GET } = await import('./route');

    const res = await GET(makeRequest('http://localhost/api/scanner/verification?target=Example.COM.', {
      headers: { Authorization: 'Bearer user-secret' },
    }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.challenge).toMatchObject({
      target: 'example.com',
      record_name: '_aegisgrid-verify.example.com',
      record_type: 'TXT',
    });
    expect(body.challenge.record_value).toMatch(/^aegisgrid-verify=[a-f0-9]{64}$/);
    expect(JSON.stringify(body)).not.toContain('user-secret');
  });

  it('verifies DNS TXT proof and saves target entitlement for the subject', async () => {
    await setupEnv();
    const { generateDnsTxtChallenge } = await import('@/lib/scanner-targets');
    const challenge = generateDnsTxtChallenge('example.com', 'analyst');
    vi.mocked(resolveTxt).mockResolvedValue([[challenge.record_value]]);

    const { POST } = await import('./route');
    const res = await POST(makeRequest('http://localhost/api/scanner/verification', {
      method: 'POST',
      headers: { Authorization: 'Bearer user-secret' },
      body: JSON.stringify({ target: 'example.com' }),
    }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ ok: true, verified: true, target: 'example.com' });

    const { isSubjectVerifiedTarget } = await import('@/lib/scanner-targets');
    await expect(isSubjectVerifiedTarget('analyst', 'example.com')).resolves.toBe(true);
  });

  it('returns conflict without saving when DNS proof is missing', async () => {
    await setupEnv();
    vi.mocked(resolveTxt).mockResolvedValue([['wrong-value']]);

    const { POST } = await import('./route');
    const res = await POST(makeRequest('http://localhost/api/scanner/verification', {
      method: 'POST',
      headers: { Authorization: 'Bearer user-secret' },
      body: JSON.stringify({ target: 'example.com' }),
    }));
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body).toMatchObject({ ok: false, verified: false, code: 'DNS_TXT_NOT_FOUND' });

    const { isSubjectVerifiedTarget } = await import('@/lib/scanner-targets');
    await expect(isSubjectVerifiedTarget('analyst', 'example.com')).resolves.toBe(false);
  });
});
