import { NextResponse } from 'next/server';
import { getClientIp } from '@/lib/ssrf-guard';
import { parseScannerSubject, isScannerAdminSubject } from '@/lib/scanner-auth';
import {
  addAdminAllowlistEntry,
  listAdminAllowlistEntries,
  removeAdminAllowlistEntry,
} from '@/lib/scanner-allowlist';

function adminDenied() {
  return NextResponse.json({
    ok: false,
    error: 'Scanner admin access required',
    code: 'ADMIN_REQUIRED',
  }, { status: 403 });
}

function adminSubject(req: Request) {
  const clientIp = getClientIp(req);
  const subject = parseScannerSubject(req, clientIp);
  return isScannerAdminSubject(subject) ? subject : null;
}

function noStoreJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function GET(req: Request) {
  const subject = adminSubject(req);
  if (!subject) return adminDenied();

  const entries = await listAdminAllowlistEntries();
  return noStoreJson({
    ok: true,
    count: entries.length,
    entries,
  });
}

export async function POST(req: Request) {
  const subject = adminSubject(req);
  if (!subject) return adminDenied();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return noStoreJson({ ok: false, error: 'Invalid JSON body', code: 'INVALID_JSON' }, 400);
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return noStoreJson({ ok: false, error: 'Invalid request body', code: 'INVALID_BODY' }, 400);
  }

  const record = body as Record<string, unknown>;
  if (typeof record.target !== 'string' || !record.target.trim()) {
    return noStoreJson({ ok: false, error: 'Missing target', code: 'MISSING_TARGET' }, 400);
  }

  try {
    const entry = await addAdminAllowlistEntry(
      record.target,
      subject.subjectId ?? subject.role,
      typeof record.note === 'string' ? record.note : undefined,
    );
    return noStoreJson({ ok: true, entry }, 201);
  } catch {
    return noStoreJson({ ok: false, error: 'Invalid target', code: 'INVALID_TARGET' }, 400);
  }
}

export async function DELETE(req: Request) {
  const subject = adminSubject(req);
  if (!subject) return adminDenied();

  const url = new URL(req.url);
  let target = url.searchParams.get('target') ?? '';

  if (!target) {
    try {
      const body: unknown = await req.json();
      if (body && typeof body === 'object' && !Array.isArray(body)) {
        const candidate = (body as Record<string, unknown>).target;
        if (typeof candidate === 'string') target = candidate;
      }
    } catch {
      // DELETE with query string is the preferred shape; empty body is fine.
    }
  }

  if (!target.trim()) {
    return noStoreJson({ ok: false, error: 'Missing target', code: 'MISSING_TARGET' }, 400);
  }

  try {
    const removed = await removeAdminAllowlistEntry(target);
    return noStoreJson({ ok: true, removed });
  } catch {
    return noStoreJson({ ok: false, error: 'Invalid target', code: 'INVALID_TARGET' }, 400);
  }
}
