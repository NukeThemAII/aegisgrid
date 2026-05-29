/**
 * AEGISGRID — Premium Access Tokens
 *
 * Simple HMAC-based time-limited access tokens for premium feature gating.
 * Used when x402/Stripe payments grant temporary access without a full
 * database-backed entitlement system.
 *
 * Tokens encode: subjectId, grantedAt, expiresAt, capabilities
 * Signed with AUTH_SECRET for tamper-proofing.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

const TOKEN_SEPARATOR = '.';
const TOKEN_VERSION = 'v1';
const DEFAULT_TTL_HOURS = 24;

export interface AccessTokenPayload {
  subjectId: string;
  grantedAt: number;
  expiresAt: number;
  capabilities: string[];
}

function getSecret(): string {
  return process.env.AUTH_SECRET || 'aegisgrid-default-secret-change-me';
}

function base64UrlEncode(data: string): string {
  return Buffer.from(data).toString('base64url');
}

function base64UrlDecode(data: string): string {
  return Buffer.from(data, 'base64url').toString('utf8');
}

function sign(data: string): string {
  return createHmac('sha256', getSecret()).update(data).digest('base64url');
}

/** Create a time-limited access token. */
export function createAccessToken(
  subjectId: string,
  capabilities: string[] = ['premium'],
  ttlHours: number = DEFAULT_TTL_HOURS,
): string {
  const now = Date.now();
  const payload: AccessTokenPayload = {
    subjectId,
    grantedAt: now,
    expiresAt: now + ttlHours * 3600 * 1000,
    capabilities,
  };
  const encoded = base64UrlEncode(JSON.stringify(payload));
  const signature = sign(`${TOKEN_VERSION}${TOKEN_SEPARATOR}${encoded}`);
  return `${TOKEN_VERSION}${TOKEN_SEPARATOR}${encoded}${TOKEN_SEPARATOR}${signature}`;
}

/** Verify and decode an access token. Returns null if invalid or expired. */
export function verifyAccessToken(token: string): AccessTokenPayload | null {
  try {
    const parts = token.split(TOKEN_SEPARATOR);
    if (parts.length !== 3) return null;
    const [version, encoded, signature] = parts;

    if (version !== TOKEN_VERSION) return null;

    const expectedSig = sign(`${version}${TOKEN_SEPARATOR}${encoded}`);
    const sigBuf = Buffer.from(signature, 'base64url');
    const expBuf = Buffer.from(expectedSig, 'base64url');
    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }

    const payload: AccessTokenPayload = JSON.parse(base64UrlDecode(encoded));

    if (!payload.subjectId || !payload.expiresAt || !Array.isArray(payload.capabilities)) {
      return null;
    }

    if (Date.now() >= payload.expiresAt) return null;

    return payload;
  } catch {
    return null;
  }
}
