import { afterEach, describe, expect, it, vi } from 'vitest';
import { isLocalRequest, parseScannerSubject, type ScannerSubject } from './scanner-auth';

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.SCANNER_ADMIN_TOKEN;
  delete process.env.SCANNER_USER_TOKENS;
});

function makeReq(headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/scanner', { headers });
}

describe('isLocalRequest', () => {
  it('returns true for IPv4 loopback 127.0.0.1', () => {
    expect(isLocalRequest('127.0.0.1')).toBe(true);
  });

  it('returns true for IPv6 loopback ::1', () => {
    expect(isLocalRequest('::1')).toBe(true);
  });

  it('returns true for IPv4-mapped IPv6 loopback ::ffff:127.0.0.1', () => {
    expect(isLocalRequest('::ffff:127.0.0.1')).toBe(true);
  });

  it('returns false for public IPv4 203.0.113.10', () => {
    expect(isLocalRequest('203.0.113.10')).toBe(false);
  });

  it('returns false for public IPv6 2001:db8::1', () => {
    expect(isLocalRequest('2001:db8::1')).toBe(false);
  });
});

describe('parseScannerSubject', () => {
  it('returns anonymous when no Authorization header is present and not local', () => {
    const subject = parseScannerSubject(makeReq(), '203.0.113.10');
    expect(subject).toEqual({ role: 'anonymous', subjectId: null, isLocal: false });
  });

  it('returns admin when admin token matches', () => {
    process.env.SCANNER_ADMIN_TOKEN = 'admin-secret-123';
    const subject = parseScannerSubject(
      makeReq({ Authorization: 'Bearer admin-secret-123' }),
      '203.0.113.10',
    );
    expect(subject).toEqual({ role: 'admin', subjectId: 'admin', isLocal: false });
  });

  it('returns authenticated user when user token matches', () => {
    process.env.SCANNER_USER_TOKENS = 'user1:tok1,user2:tok2';
    const subject = parseScannerSubject(
      makeReq({ Authorization: 'Bearer tok1' }),
      '203.0.113.10',
    );
    expect(subject).toEqual({ role: 'authenticated', subjectId: 'user1', isLocal: false });
  });

  it('returns authenticated for the second user token', () => {
    process.env.SCANNER_USER_TOKENS = 'user1:tok1,user2:tok2';
    const subject = parseScannerSubject(
      makeReq({ Authorization: 'Bearer tok2' }),
      '203.0.113.10',
    );
    expect(subject).toEqual({ role: 'authenticated', subjectId: 'user2', isLocal: false });
  });

  it('returns anonymous for unrecognized token', () => {
    process.env.SCANNER_ADMIN_TOKEN = 'admin-secret-123';
    process.env.SCANNER_USER_TOKENS = 'user1:tok1';
    const subject = parseScannerSubject(
      makeReq({ Authorization: 'Bearer unknown-token' }),
      '203.0.113.10',
    );
    expect(subject).toEqual({ role: 'anonymous', subjectId: null, isLocal: false });
  });

  it('returns admin for local request with no token', () => {
    const subject = parseScannerSubject(makeReq(), '127.0.0.1');
    expect(subject).toEqual({ role: 'admin', subjectId: 'local', isLocal: true });
  });

  it('returns authenticated user for local request with valid user token (no admin override)', () => {
    process.env.SCANNER_USER_TOKENS = 'user1:tok1';
    const subject = parseScannerSubject(
      makeReq({ Authorization: 'Bearer tok1' }),
      '127.0.0.1',
    );
    expect(subject).toEqual({ role: 'authenticated', subjectId: 'user1', isLocal: true });
  });

  it('returns admin with isLocal true for local request with admin token', () => {
    process.env.SCANNER_ADMIN_TOKEN = 'admin-secret-123';
    const subject = parseScannerSubject(
      makeReq({ Authorization: 'Bearer admin-secret-123' }),
      '127.0.0.1',
    );
    expect(subject).toEqual({ role: 'admin', subjectId: 'admin', isLocal: true });
  });

  it('admin token MUST NOT match user token lookup (separate namespaces)', () => {
    process.env.SCANNER_ADMIN_TOKEN = 'shared-token';
    process.env.SCANNER_USER_TOKENS = 'user1:shared-token';
    // Admin token check happens first, so this should resolve as admin, not user
    const subject = parseScannerSubject(
      makeReq({ Authorization: 'Bearer shared-token' }),
      '203.0.113.10',
    );
    expect(subject.role).toBe('admin');
    expect(subject.subjectId).toBe('admin');
  });

  it('disables admin token auth when SCANNER_ADMIN_TOKEN is empty', () => {
    process.env.SCANNER_ADMIN_TOKEN = '';
    const subject = parseScannerSubject(
      makeReq({ Authorization: 'Bearer anything' }),
      '203.0.113.10',
    );
    expect(subject).toEqual({ role: 'anonymous', subjectId: null, isLocal: false });
  });

  it('returns anonymous for malformed Authorization header (no Bearer prefix)', () => {
    process.env.SCANNER_ADMIN_TOKEN = 'admin-secret-123';
    const subject = parseScannerSubject(
      makeReq({ Authorization: 'Basic admin-secret-123' }),
      '203.0.113.10',
    );
    expect(subject).toEqual({ role: 'anonymous', subjectId: null, isLocal: false });
  });

  it('returns anonymous for Authorization header with only "Bearer" and no token', () => {
    process.env.SCANNER_ADMIN_TOKEN = 'admin-secret-123';
    const subject = parseScannerSubject(
      makeReq({ Authorization: 'Bearer ' }),
      '203.0.113.10',
    );
    expect(subject).toEqual({ role: 'anonymous', subjectId: null, isLocal: false });
  });
});

describe('security: token leakage', () => {
  it('returned ScannerSubject never contains configured token values', () => {
    const adminToken = 'super-secret-admin-tok-xyz';
    const userToken1 = 'user-secret-tok-abc';
    const userToken2 = 'user-secret-tok-def';
    process.env.SCANNER_ADMIN_TOKEN = adminToken;
    process.env.SCANNER_USER_TOKENS = `alice:${userToken1},bob:${userToken2}`;

    const subjects: ScannerSubject[] = [
      parseScannerSubject(makeReq({ Authorization: `Bearer ${adminToken}` }), '203.0.113.10'),
      parseScannerSubject(makeReq({ Authorization: `Bearer ${userToken1}` }), '203.0.113.10'),
      parseScannerSubject(makeReq({ Authorization: `Bearer ${userToken2}` }), '127.0.0.1'),
      parseScannerSubject(makeReq(), '127.0.0.1'),
      parseScannerSubject(makeReq(), '203.0.113.10'),
    ];

    const serialized = JSON.stringify(subjects);
    expect(serialized).not.toContain(adminToken);
    expect(serialized).not.toContain(userToken1);
    expect(serialized).not.toContain(userToken2);
  });
});
