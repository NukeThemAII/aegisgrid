import { NextRequest, NextResponse } from 'next/server';
import { parseAppSubject, isAppAdminSubject, isAuthenticatedAppSubject } from '@/lib/auth/app-auth';
import { getDefaultAppRepository } from '@/lib/db/app-repository';
import { isDatabaseConfigured } from '@/lib/db/postgres';

export const runtime = 'nodejs';

const REPORT_ID_RE = /^[a-zA-Z0-9._:-]{1,120}$/;
const PAYMENT_EVENT_ID_RE = /^(x402:)?eip155:\d+:(0x[a-fA-F0-9]{6,128}|payload:[a-fA-F0-9]{64})$/;
const TRANSACTION_RE = /^0x[a-fA-F0-9]{6,128}$/;

function jsonError(error: string, code: string, status: number): NextResponse {
  return NextResponse.json({ error, code }, { status, headers: { 'Cache-Control': 'no-store' } });
}

function singleParam(req: NextRequest, name: string): string | null {
  const values = req.nextUrl.searchParams.getAll(name).map((value) => value.trim()).filter(Boolean);
  return values.length === 1 ? values[0] : null;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const subject = parseAppSubject(req);
  if (!isAuthenticatedAppSubject(subject)) {
    return jsonError('Admin bearer token required.', 'AUTH_REQUIRED', 401);
  }
  if (!isAppAdminSubject(subject)) {
    return jsonError('Admin privileges required.', 'ADMIN_REQUIRED', 403);
  }

  if (!isDatabaseConfigured()) {
    return jsonError('DATABASE_URL is required for x402 audit lookup.', 'DATABASE_REQUIRED', 503);
  }

  const reportId = singleParam(req, 'report_id');
  const transaction = singleParam(req, 'transaction');
  const paymentEventId = singleParam(req, 'payment_event_id');
  const selectors = [reportId, transaction, paymentEventId].filter(Boolean);
  if (selectors.length !== 1) {
    return jsonError('Provide exactly one of report_id, transaction, or payment_event_id.', 'INVALID_QUERY', 400);
  }

  if (reportId && !REPORT_ID_RE.test(reportId)) {
    return jsonError('report_id is malformed.', 'INVALID_REPORT_ID', 400);
  }
  if (transaction && !TRANSACTION_RE.test(transaction)) {
    return jsonError('transaction is malformed.', 'INVALID_TRANSACTION', 400);
  }
  if (paymentEventId && !PAYMENT_EVENT_ID_RE.test(paymentEventId)) {
    return jsonError('payment_event_id is malformed.', 'INVALID_PAYMENT_EVENT_ID', 400);
  }

  const normalizedTransaction = transaction?.toLowerCase();
  const normalizedPaymentEventId = paymentEventId?.replace(/^x402:/i, '').toLowerCase();
  const records = await getDefaultAppRepository().findX402AuditRecords({
    ...(reportId ? { reportId } : {}),
    ...(normalizedTransaction ? { transaction: normalizedTransaction } : {}),
    ...(normalizedPaymentEventId ? { paymentEventId: normalizedPaymentEventId } : {}),
  });

  return NextResponse.json({
    ok: true,
    query: {
      ...(reportId ? { report_id: reportId } : {}),
      ...(normalizedTransaction ? { transaction: normalizedTransaction } : {}),
      ...(normalizedPaymentEventId ? { payment_event_id: normalizedPaymentEventId } : {}),
    },
    reports: records.reports,
    payment_events: records.paymentEvents,
    credit_ledger: records.creditLedger,
  }, { headers: { 'Cache-Control': 'no-store' } });
}
