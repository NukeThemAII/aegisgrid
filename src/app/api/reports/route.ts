import { NextResponse } from 'next/server';
import { generateDeterministicReport, getAiProviderStatus, parseReportRequest } from '@/lib/ai/report-generator';
import { parseAppSubject } from '@/lib/auth/app-auth';
import { verifyPremiumAccess } from '@/lib/billing/guard';
import { persistReportRecord } from '@/lib/reports/report-store';

export const runtime = 'nodejs';

export async function POST(req: Request) {
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

  const provider = getAiProviderStatus();
  if (!provider.configured) {
    return NextResponse.json({
      error: 'No configured AI report provider is available.',
      code: 'AI_PROVIDER_UNCONFIGURED',
      provider: provider.provider,
    }, { status: 503 });
  }

  if (provider.provider !== 'deterministic') {
    return NextResponse.json({
      error: 'External AI providers are configured but not wired in this foundation slice.',
      code: 'AI_PROVIDER_NOT_WIRED',
      provider: provider.provider,
    }, { status: 501 });
  }

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

  const report = generateDeterministicReport(parsed.value);
  const persistence = await persistReportRecord(subject.subjectId ?? 'unknown', report);

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
