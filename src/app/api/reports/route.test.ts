import { afterEach, describe, expect, it, vi } from 'vitest';

function clearReportEnv() {
  for (const key of [
    'FEATURE_AI_REPORTS',
    'FEATURE_PREMIUM',
    'AI_PROVIDER',
    'OPENAI_API_KEY',
    'HERMES_API_KEY',
    'AUTH_USER_TOKENS',
    'AUTH_ADMIN_TOKEN',
    'AUTH_USER_ENTITLEMENTS',
    'DATABASE_URL',
  ]) {
    delete process.env[key];
  }
}

function makeRequest(body: unknown, token?: string): Request {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (token) headers.set('authorization', `Bearer ${token}`);
  return new Request('http://localhost/api/reports', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  clearReportEnv();
});

describe('/api/reports', () => {
  it('denies report generation when the AI report feature is disabled', async () => {
    vi.resetModules();
    process.env.FEATURE_AI_REPORTS = 'false';
    const { POST } = await import('./route');

    const res = await POST(makeRequest({ topic: 'Hormuz', sources: [] }, 'token'));
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.code).toBe('AI_REPORTS_DISABLED');
  });

  it('requires an authenticated subject before billing or report generation', async () => {
    vi.resetModules();
    process.env.FEATURE_AI_REPORTS = 'true';
    process.env.FEATURE_PREMIUM = 'true';
    process.env.AI_PROVIDER = 'deterministic';
    const { POST } = await import('./route');

    const res = await POST(makeRequest({ topic: 'Hormuz', sources: [] }));
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.code).toBe('AUTH_REQUIRED');
  });

  it('fails closed when no AI provider is configured after auth and entitlement pass', async () => {
    vi.resetModules();
    process.env.FEATURE_AI_REPORTS = 'true';
    process.env.FEATURE_PREMIUM = 'true';
    process.env.AI_PROVIDER = 'none';
    process.env.AUTH_USER_TOKENS = 'alice:token';
    process.env.AUTH_USER_ENTITLEMENTS = 'alice:ai_report';
    const { POST } = await import('./route');

    const res = await POST(makeRequest({ topic: 'Hormuz', sources: [] }, 'token'));
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.code).toBe('AI_PROVIDER_UNCONFIGURED');
  });

  it('returns deterministic source-bounded reports for entitled users in local mode', async () => {
    vi.resetModules();
    process.env.FEATURE_AI_REPORTS = 'true';
    process.env.FEATURE_PREMIUM = 'true';
    process.env.AI_PROVIDER = 'deterministic';
    process.env.AUTH_USER_TOKENS = 'alice:token';
    process.env.AUTH_USER_ENTITLEMENTS = 'alice:ai_report';
    const { POST } = await import('./route');

    const res = await POST(makeRequest({
      topic: 'Strait of Hormuz',
      region: 'Gulf chokepoint',
      sources: [
        { title: 'AIS', summary: 'AISStream API key configured but live websocket ingestion is not run in this route.', source: 'AegisGrid AIS readiness', confidence: 'low' },
      ],
    }, 'token'));
    const body = await res.json();
    const serialized = JSON.stringify(body);

    expect(res.status).toBe(200);
    expect(body.report.status).toBe('completed');
    expect(body.report.markdown).toContain('## Executive Summary');
    expect(body.report.markdown).toContain('AISStream API key configured');
    expect(body.persistence.status).toBe('skipped_unconfigured');
    expect(serialized).not.toContain('token');
  });
});
