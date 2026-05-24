import { NextResponse } from 'next/server';
import { getClientIp } from '@/lib/ssrf-guard';
import { parseScannerSubject, isScannerAdminSubject } from '@/lib/scanner-auth';
import { formatAuditResponse, readAuditEntries } from '@/lib/scanner-audit-query';

function adminDenied() {
  return NextResponse.json({
    ok: false,
    error: 'Scanner admin access required',
    code: 'ADMIN_REQUIRED',
  }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
}

function isAdmin(req: Request): boolean {
  const subject = parseScannerSubject(req, getClientIp(req));
  return isScannerAdminSubject(subject);
}

function parseLimit(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export async function GET(req: Request) {
  if (!isAdmin(req)) return adminDenied();

  const url = new URL(req.url);
  const format = url.searchParams.get('format') === 'jsonl' ? 'jsonl' : 'json';
  const entries = await readAuditEntries({ limit: parseLimit(url.searchParams.get('limit')) });
  const body = formatAuditResponse(entries, format);

  if (format === 'jsonl') {
    return new Response(body as string, {
      status: 200,
      headers: {
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  }

  return NextResponse.json(body, {
    status: 200,
    headers: { 'Cache-Control': 'no-store' },
  });
}
