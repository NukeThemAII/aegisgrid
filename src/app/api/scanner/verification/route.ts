import { NextResponse } from 'next/server';
import { getClientIp } from '@/lib/ssrf-guard';
import {
  isAuthenticatedScannerSubject,
  parseScannerSubject,
} from '@/lib/scanner-auth';
import {
  generateDnsTxtChallenge,
  normalizeTargetKey,
  saveVerifiedTarget,
  verifyDnsTxtChallenge,
} from '@/lib/scanner-targets';

function authRequired() {
  return NextResponse.json({
    ok: false,
    error: 'Authenticated scanner subject required',
    code: 'AUTH_REQUIRED',
  }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
}

function noStoreJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

function getSubject(req: Request) {
  const subject = parseScannerSubject(req, getClientIp(req));
  return isAuthenticatedScannerSubject(subject) && subject.subjectId ? subject : null;
}

function validateVerifiableDomain(target: string): string | null {
  const normalized = normalizeTargetKey(target);
  if (!normalized) return null;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(normalized)) return null;
  if (normalized.includes(':')) return null;
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(normalized)) return null;
  return normalized;
}

async function parseJsonBody(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await req.json();
    if (body && typeof body === 'object' && !Array.isArray(body)) return body as Record<string, unknown>;
  } catch {
    return null;
  }
  return null;
}

export async function GET(req: Request) {
  const subject = getSubject(req);
  if (!subject) return authRequired();

  const url = new URL(req.url);
  const target = validateVerifiableDomain(url.searchParams.get('target') ?? '');
  if (!target) {
    return noStoreJson({ ok: false, error: 'Missing or invalid domain target', code: 'INVALID_TARGET' }, 400);
  }
  const subjectId = subject.subjectId;
  if (!subjectId) return authRequired();

  return noStoreJson({
    ok: true,
    challenge: generateDnsTxtChallenge(target, subjectId),
  });
}

export async function POST(req: Request) {
  const subject = getSubject(req);
  if (!subject) return authRequired();

  const body = await parseJsonBody(req);
  const target = validateVerifiableDomain(typeof body?.target === 'string' ? body.target : '');
  if (!target) {
    return noStoreJson({ ok: false, error: 'Missing or invalid domain target', code: 'INVALID_TARGET' }, 400);
  }
  const subjectId = subject.subjectId;
  if (!subjectId) return authRequired();

  const challenge = generateDnsTxtChallenge(target, subjectId);
  const verified = await verifyDnsTxtChallenge(target, subjectId);
  if (!verified) {
    return noStoreJson({
      ok: false,
      verified: false,
      code: 'DNS_TXT_NOT_FOUND',
      error: 'Expected DNS TXT challenge was not found for target.',
      challenge,
    }, 409);
  }

  await saveVerifiedTarget(subjectId, target);
  return noStoreJson({
    ok: true,
    verified: true,
    target,
    subject_id: subjectId,
  });
}
