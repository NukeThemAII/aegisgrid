import { afterEach, describe, expect, it, vi } from 'vitest';

function makeRequest(token?: string): Request {
  const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
  return new Request('http://localhost/api/test', { headers });
}

function clearAuthEnv() {
  delete process.env.AUTH_USER_TOKENS;
  delete process.env.AUTH_ADMIN_TOKEN;
  delete process.env.AUTH_USER_ENTITLEMENTS;
}

afterEach(() => {
  vi.restoreAllMocks();
  clearAuthEnv();
});

describe('app auth token parsing', () => {
  it('treats missing credentials as anonymous and carries no entitlements', async () => {
    vi.resetModules();
    clearAuthEnv();
    const { parseAppSubject, isAuthenticatedAppSubject } = await import('./app-auth');

    const subject = parseAppSubject(makeRequest());

    expect(subject).toMatchObject({ role: 'anonymous', subjectId: null, entitlements: [] });
    expect(isAuthenticatedAppSubject(subject)).toBe(false);
  });

  it('authenticates bearer tokens without leaking token material into the subject', async () => {
    vi.resetModules();
    process.env.AUTH_USER_TOKENS = 'alice:super-secret-token,bob:other-secret';
    process.env.AUTH_USER_ENTITLEMENTS = 'alice:premium,alice:ai_report,bob:api_access';

    const { parseAppSubject, isAuthenticatedAppSubject } = await import('./app-auth');
    const subject = parseAppSubject(makeRequest('super-secret-token'));

    expect(subject.role).toBe('authenticated');
    expect(subject.subjectId).toBe('alice');
    expect(subject.entitlements).toEqual(['ai_report', 'premium']);
    expect(JSON.stringify(subject)).not.toContain('super-secret-token');
    expect(isAuthenticatedAppSubject(subject)).toBe(true);
  });

  it('recognizes admin tokens as privileged subjects with wildcard entitlement', async () => {
    vi.resetModules();
    process.env.AUTH_ADMIN_TOKEN = 'admin-secret';
    process.env.AUTH_USER_TOKENS = 'alice:user-secret';

    const { parseAppSubject, isAppAdminSubject } = await import('./app-auth');
    const subject = parseAppSubject(makeRequest('admin-secret'));

    expect(subject).toMatchObject({ role: 'admin', subjectId: 'admin', entitlements: ['*'] });
    expect(isAppAdminSubject(subject)).toBe(true);
    expect(JSON.stringify(subject)).not.toContain('admin-secret');
  });

  it('ignores malformed token and entitlement entries', async () => {
    vi.resetModules();
    process.env.AUTH_USER_TOKENS = 'bad-entry,no space:user-secret,valid_user:valid-token';
    process.env.AUTH_USER_ENTITLEMENTS = 'bad-entry,valid_user:premium,no space:ai_report,valid_user:bad entitlement';

    const { parseAppSubject, parseAppTokenEntries, parseAppEntitlementEntries } = await import('./app-auth');

    expect(parseAppTokenEntries(process.env.AUTH_USER_TOKENS)).toEqual([
      { subjectId: 'valid_user', token: 'valid-token' },
    ]);
    expect(parseAppEntitlementEntries(process.env.AUTH_USER_ENTITLEMENTS).get('valid_user')).toEqual(new Set(['premium']));
    expect(parseAppSubject(makeRequest('user-secret')).role).toBe('anonymous');
    expect(parseAppSubject(makeRequest('valid-token')).subjectId).toBe('valid_user');
  });

  it('keeps invalid bearer tokens anonymous even when auth is configured', async () => {
    vi.resetModules();
    process.env.AUTH_USER_TOKENS = 'alice:correct-token';
    process.env.AUTH_ADMIN_TOKEN = 'admin-token';

    const { parseAppSubject } = await import('./app-auth');
    const subject = parseAppSubject(makeRequest('wrong-token'));

    expect(subject).toMatchObject({ role: 'anonymous', subjectId: null, entitlements: [] });
  });
});
