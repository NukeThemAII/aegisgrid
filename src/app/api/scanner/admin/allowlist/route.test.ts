import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';

let tmpDir = '';

async function setupEnv(): Promise<string> {
  vi.resetModules();
  tmpDir = await mkdtemp(join(tmpdir(), 'aegisgrid-admin-route-'));
  process.env.SCANNER_ADMIN_ALLOWLIST_PATH = join(tmpDir, 'allowlist.json');
  process.env.SCANNER_AUDIT_LOG_PATH = join(tmpDir, 'scanner-audit.jsonl');
  process.env.SCANNER_ADMIN_TOKEN = 'admin-secret';
  return tmpDir;
}

function makeRequest(url: string, init: RequestInit = {}, ip = '203.0.113.10'): Request {
  const headers = new Headers(init.headers);
  headers.set('x-forwarded-for', ip);
  return new Request(url, { ...init, headers });
}

afterEach(async () => {
  vi.restoreAllMocks();
  delete process.env.SCANNER_ADMIN_TOKEN;
  delete process.env.SCANNER_ADMIN_ALLOWLIST_PATH;
  delete process.env.SCANNER_AUDIT_LOG_PATH;
  if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
  tmpDir = '';
});

describe('/api/scanner/admin/allowlist', () => {
  it('denies remote requests without admin credentials', async () => {
    await setupEnv();
    const { GET } = await import('./route');

    const res = await GET(makeRequest('http://localhost/api/scanner/admin/allowlist'));
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.code).toBe('ADMIN_REQUIRED');
  });

  it('allows admin token holders to add, list, and remove allowlist entries', async () => {
    await setupEnv();
    const { GET, POST, DELETE } = await import('./route');
    const auth = { Authorization: 'Bearer admin-secret' };

    const post = await POST(makeRequest('http://localhost/api/scanner/admin/allowlist', {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ target: ' Example.COM. ', note: 'authorized test target' }),
    }));
    expect(post.status).toBe(201);

    const list = await GET(makeRequest('http://localhost/api/scanner/admin/allowlist', { headers: auth }));
    const listBody = await list.json();
    expect(list.status).toBe(200);
    expect(listBody.entries).toEqual(expect.arrayContaining([
      expect.objectContaining({ target: 'example.com', source: 'file', added_by: 'admin' }),
    ]));
    expect(JSON.stringify(listBody)).not.toContain('admin-secret');

    const del = await DELETE(makeRequest('http://localhost/api/scanner/admin/allowlist?target=example.com', {
      method: 'DELETE',
      headers: auth,
    }));
    expect(del.status).toBe(200);

    const after = await GET(makeRequest('http://localhost/api/scanner/admin/allowlist', { headers: auth }));
    const afterBody = await after.json();
    expect(afterBody.entries).toHaveLength(0);
  });
});

describe('/api/scanner/admin/audit', () => {
  it('denies remote requests without admin credentials', async () => {
    await setupEnv();
    const { GET } = await import('../audit/route');

    const res = await GET(makeRequest('http://localhost/api/scanner/admin/audit'));
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.code).toBe('ADMIN_REQUIRED');
  });

  it('exports persisted audit entries as sanitized JSON and JSONL for admin token holders', async () => {
    const dir = await setupEnv();
    await writeFile(join(dir, 'scanner-audit.jsonl'), [
      JSON.stringify({ event_id: 'scan_1', scan_type: 'quick', sanitized_target: 'example.com', api_key: 'SHOULD_NOT_LEAK' }),
      JSON.stringify({ event_id: 'scan_2', scan_type: 'rdns', sanitized_target: 'test.com' }),
    ].join('\n') + '\n', 'utf8');

    const { GET } = await import('../audit/route');
    const auth = { Authorization: 'Bearer admin-secret' };

    const jsonRes = await GET(makeRequest('http://localhost/api/scanner/admin/audit?limit=1', { headers: auth }));
    const jsonBody = await jsonRes.json();
    expect(jsonRes.status).toBe(200);
    expect(jsonBody.count).toBe(1);
    expect(jsonBody.entries[0]).toMatchObject({ event_id: 'scan_2' });
    expect(JSON.stringify(jsonBody)).not.toContain('SHOULD_NOT_LEAK');
    expect(JSON.stringify(jsonBody)).not.toContain(dir);

    const jsonlRes = await GET(makeRequest('http://localhost/api/scanner/admin/audit?format=jsonl', { headers: auth }));
    const jsonlText = await jsonlRes.text();
    expect(jsonlRes.status).toBe(200);
    expect(jsonlRes.headers.get('content-type')).toContain('application/x-ndjson');
    expect(jsonlText.trim().split('\n')).toHaveLength(2);
    expect(jsonlText).not.toContain('SHOULD_NOT_LEAK');
  });
});
