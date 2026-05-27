import { NextResponse } from 'next/server';
import { parseReportRequest, type GeneratedReport } from '@/lib/ai/report-generator';
import { createReportProvider } from '@/lib/ai/provider-factory';
import { parseAppSubject } from '@/lib/auth/app-auth';
import { verifyPremiumAccess } from '@/lib/billing/guard';
import { persistReportRecord, type ReportPersistenceResult } from '@/lib/reports/report-store';

export const runtime = 'nodejs';

export interface ReportApiSuccessResponse {
  ok: true;
  report: GeneratedReport;
  persistence: ReportPersistenceResult;
}

export interface ReportApiErrorResponse {
  error: string;
  code: string;
}

export type ReportApiResponse = ReportApiSuccessResponse | ReportApiErrorResponse;

export async function POST(req: Request): Promise<NextResponse<ReportApiResponse>> {
  if (process.env.FEATURE_AI_REPORTS !== 'true') {
    return NextResponse.json({
      error: 'AI reports are disabled on this deployment.',
      code: 'AI_REPORTS_DISABLED',
    }, { status: 403 });
  }

  const subject = parseAppSubject(req);
  const access = await verifyPremiumAccess(subject, 'ai_report');
  if (!access.allowed) {
    return NextResponse.json({
      error: access.reason,
      code: access.code,
    }, { status: access.status });
  }

  const providerResult = createReportProvider();
  if (!providerResult.ok) {
    return NextResponse.json({
      error: providerResult.error,
      code: 'AI_PROVIDER_UNCONFIGURED',
    }, { status: 503 });
  }
  const provider = providerResult.provider;

  let input: unknown;
  try {
    input = await req.json();
  } catch {
    return NextResponse.json({
      error: 'Request body must be valid JSON.',
      code: 'INVALID_JSON',
    }, { status: 400 });
  }

  const parsed = parseReportRequest(input);
  if (!parsed.ok) {
    return NextResponse.json({
      error: parsed.error,
      code: parsed.code,
    }, { status: 400 });
  }

  const generateResult = await provider.generateReport(parsed.value);
  if (!generateResult.ok) {
    return NextResponse.json({
      error: generateResult.error,
      code: generateResult.code,
    }, { status: 502 });
  }

  const report = generateResult.report;
  const persistence = await persistReportRecord(subject.subjectId ?? 'unknown', report, {
    sourcePayload: parsed.value,
  });

  if (persistence.status === 'failed') {
    return NextResponse.json({
      error: persistence.reason,
      code: 'REPORT_PERSISTENCE_FAILED',
    }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    report,
    persistence,
  }, {
    headers: {
      'Cache-Control': 'no-store',
    },
  });
}
