import { timingSafeEqual } from 'node:crypto';

export type AppSubjectRole = 'anonymous' | 'authenticated' | 'admin';

export interface AppSubject {
  role: AppSubjectRole;
  subjectId: string | null;
  entitlements: string[];
}

const SUBJECT_ID_RE = /^[a-zA-Z0-9._-]{1,80}$/;
const ENTITLEMENT_RE = /^[a-zA-Z0-9._:-]{1,80}$/;

function safeSubjectId(value: string): string | null {
  const trimmed = value.trim();
  return SUBJECT_ID_RE.test(trimmed) ? trimmed : null;
}

function safeEntitlement(value: string): string | null {
  const trimmed = value.trim();
  return ENTITLEMENT_RE.test(trimmed) ? trimmed : null;
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

export function parseAppTokenEntries(raw: string | undefined): Array<{ subjectId: string; token: string }> {
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

export function parseAppEntitlementEntries(raw: string | undefined): Map<string, Set<string>> {
  const entitlements = new Map<string, Set<string>>();
  if (!raw) return entitlements;

  for (const entry of raw.split(',')) {
    const separator = entry.indexOf(':');
    if (separator <= 0) continue;
    const subjectId = safeSubjectId(entry.slice(0, separator));
    const entitlement = safeEntitlement(entry.slice(separator + 1));
    if (!subjectId || !entitlement) continue;
    const subjectEntitlements = entitlements.get(subjectId) ?? new Set<string>();
    subjectEntitlements.add(entitlement);
    entitlements.set(subjectId, subjectEntitlements);
  }

  return entitlements;
}

function subjectEntitlements(subjectId: string): string[] {
  const entries = parseAppEntitlementEntries(process.env.AUTH_USER_ENTITLEMENTS);
  return Array.from(entries.get(subjectId) ?? []).sort();
}

export function parseAppSubject(req: Request): AppSubject {
  const token = extractBearerToken(req);

  if (!token) {
    return { role: 'anonymous', subjectId: null, entitlements: [] };
  }

  const adminToken = process.env.AUTH_ADMIN_TOKEN?.trim();
  if (adminToken && safeTokenEqual(token, adminToken)) {
    return { role: 'admin', subjectId: 'admin', entitlements: ['*'] };
  }

  for (const entry of parseAppTokenEntries(process.env.AUTH_USER_TOKENS)) {
    if (safeTokenEqual(token, entry.token)) {
      return {
        role: 'authenticated',
        subjectId: entry.subjectId,
        entitlements: subjectEntitlements(entry.subjectId),
      };
    }
  }

  return { role: 'anonymous', subjectId: null, entitlements: [] };
}

export function isAuthenticatedAppSubject(subject: AppSubject): boolean {
  return subject.role === 'authenticated' || subject.role === 'admin';
}

export function isAppAdminSubject(subject: AppSubject): boolean {
  return subject.role === 'admin';
}
