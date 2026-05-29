import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createAccessToken, verifyAccessToken } from '@/lib/premium/access-tokens';

describe('access tokens', () => {
  beforeEach(() => {
    vi.stubEnv('AUTH_SECRET', 'test-secret-for-unit-tests');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates and verifies a valid token', () => {
    const token = createAccessToken('user123', ['premium', 'ai_reports'], 1);
    const payload = verifyAccessToken(token);
    expect(payload).not.toBeNull();
    expect(payload!.subjectId).toBe('user123');
    expect(payload!.capabilities).toEqual(['premium', 'ai_reports']);
    expect(payload!.expiresAt).toBeGreaterThan(Date.now());
  });

  it('token expires after TTL', () => {
    const token = createAccessToken('user123', ['premium'], 0); // 0 hour TTL
    const payload = verifyAccessToken(token);
    expect(payload).toBeNull();
  });

  it('rejects tampered tokens', () => {
    const token = createAccessToken('user123', ['premium'], 24);
    const tampered = token.replace('v1.', 'v1.tampered.');
    expect(verifyAccessToken(tampered)).toBeNull();
  });

  it('rejects expired tokens', () => {
    vi.useFakeTimers();
    const token = createAccessToken('user123', ['premium'], 1);
    vi.advanceTimersByTime(2 * 3600 * 1000); // 2 hours later
    expect(verifyAccessToken(token)).toBeNull();
    vi.useRealTimers();
  });

  it('rejects tokens with different secret', () => {
    const token = createAccessToken('user123', ['premium'], 24);
    // Change secret
    vi.stubEnv('AUTH_SECRET', 'different-secret');
    expect(verifyAccessToken(token)).toBeNull();
  });

  it('rejects malformed tokens', () => {
    expect(verifyAccessToken('')).toBeNull();
    expect(verifyAccessToken('not.a.token')).toBeNull();
    expect(verifyAccessToken('v1.')).toBeNull();
  });

  it('rejects tokens with missing fields', () => {
    const secret = process.env.AUTH_SECRET || 'test';
    const crypto = require('node:crypto');
    const badPayload = JSON.stringify({ subjectId: 'x', capabilities: ['premium'] }); // no expiresAt
    const encoded = Buffer.from(badPayload).toString('base64url');
    const hmac = crypto.createHmac('sha256', secret).update(`v1.${encoded}`).digest('base64url');
    expect(verifyAccessToken(`v1.${encoded}.${hmac}`)).toBeNull();
  });
});
