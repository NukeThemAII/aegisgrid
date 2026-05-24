import { timingSafeEqual } from 'node:crypto';

export type ScannerSubjectRole = 'anonymous' | 'authenticated' | 'admin';

export interface ScannerSubject {
  role: ScannerSubjectRole;
  subjectId: string | null;
  isLocal: boolean;
}

const SUBJECT_ID_RE = /^[a-zA-Z0-9._-]{1,80}$/;

function safeSubjectId(value: string): string | null {
  const trimmed = value.trim();
  return SUBJECT_ID_RE.test(trimmed) ? trimmed : null;
}

function extractBearerToken(req: Request): string | null {
  const header = req.headers.get('authorization');
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  const token = match?.[1]?.trim();
  return token || null;
}

function safeTokenEqual(a: string, b: string): boolean {
  if (!a || !b) return false;
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function parseUserTokenEntries(raw: string | undefined): Array<{ subjectId: string; token: string }> {
  if (!raw) return [];
  return raw
    .split(',')
    .map((entry) => {
      const separator = entry.indexOf(':');
      if (separator <= 0) return null;
      const subjectId = safeSubjectId(entry.slice(0, separator));
      const token = entry.slice(separator + 1).trim();
      if (!subjectId || !token) return null;
      return { subjectId, token };
    })
    .filter((entry): entry is { subjectId: string; token: string } => Boolean(entry));
}

export function isLocalRequest(clientIp: string): boolean {
  const normalized = clientIp.trim().toLowerCase().replace(/^\[/, '').replace(/\]$/, '');
  return normalized === '127.0.0.1'
    || normalized === '::1'
    || normalized === 'localhost'
    || normalized === '::ffff:127.0.0.1';
}

export function parseScannerSubject(req: Request, clientIp: string): ScannerSubject {
  const isLocal = isLocalRequest(clientIp);
  const token = extractBearerToken(req);

  if (token) {
    const adminToken = process.env.SCANNER_ADMIN_TOKEN?.trim();
    if (adminToken && safeTokenEqual(token, adminToken)) {
      return { role: 'admin', subjectId: 'admin', isLocal };
    }

    for (const entry of parseUserTokenEntries(process.env.SCANNER_USER_TOKENS)) {
      if (safeTokenEqual(token, entry.token)) {
        return { role: 'authenticated', subjectId: entry.subjectId, isLocal };
      }
    }

    return { role: 'anonymous', subjectId: null, isLocal };
  }

  if (isLocal) {
    return { role: 'admin', subjectId: 'local', isLocal: true };
  }

  return { role: 'anonymous', subjectId: null, isLocal: false };
}

export function isAuthenticatedScannerSubject(subject: ScannerSubject): boolean {
  return subject.role === 'authenticated' || subject.role === 'admin';
}

export function isScannerAdminSubject(subject: ScannerSubject): boolean {
  return subject.role === 'admin';
}
