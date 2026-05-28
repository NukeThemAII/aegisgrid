import { NextResponse } from 'next/server';
import { parseReportRequest, type GeneratedReport } from '@/lib/ai/report-generator';
import { createReportProvider } from '@/lib/ai/provider-factory';
import { parseAppSubject } from '@/lib/auth/app-auth';
import { verifyPremiumAccess } from '@/lib/billing/guard';
import { persistReportRecord, type ReportPersistenceResult } from '@/lib/reports/report-store';
import type { ReportSourceInput } from '@/lib/ai/provider-types';

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

// ── Feed Collector ──────────────────────────────────────────────────

async function collectFeedSources(appUrl: string): Promise<ReportSourceInput[]> {
  const sources: ReportSourceInput[] = [];
  const now = new Date().toISOString();

  const fetchers = [
    {
      url: `${appUrl}/api/earthquakes`,
      extract: (d: Record<string, unknown>) => {
        const quakes = d?.earthquakes;
        if (!Array.isArray(quakes) || quakes.length === 0) return null;
        const top = quakes.slice(0, 5).map((q: Record<string, unknown>) => `M${q.magnitude} ${q.place}`).join('; ');
        return { title: 'USGS Earthquakes (24h)', summary: `${quakes.length} events: ${top}` };
      },
    },
    {
      url: `${appUrl}/api/fires`,
      extract: (d: Record<string, unknown>) => {
        const fires = d?.fires;
        if (!Array.isArray(fires) || fires.length === 0) return null;
        return { title: 'Active Fires (NASA FIRMS)', summary: `${fires.length} active fire detections worldwide` };
      },
    },
    {
      url: `${appUrl}/api/cyber-threats`,
      extract: (d: Record<string, unknown>) => {
        if (!d?.threats || (d.threats as unknown[]).length === 0) return null;
        return { title: 'Cyber Threat Intelligence', summary: `${(d.threats as unknown[]).length} threat indicators` };
      },
    },
    {
      url: `${appUrl}/api/space-weather`,
      extract: (d: Record<string, unknown>) => {
        if (!d?.events || (d.events as unknown[]).length === 0) return null;
        return { title: 'Space Weather (NOAA SWPC)', summary: `${(d.events as unknown[]).length} space weather events active` };
      },
    },
  ];

  for (const f of fetchers) {
    try {
      const res = await fetch(f.url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) continue;
      const data = await res.json() as Record<string, unknown>;
      const extracted = f.extract(data);
      if (extracted) {
        sources.push({
          title: extracted.title,
          summary: extracted.summary,
          source: 'AegisGrid Live Feed',
          source_url: f.url,
          fetched_at: now,
          confidence: 'medium' as const,
        });
      }
    } catch { /* feed unavailable — skip */ }
  }

  return sources;
}

// ── Route Handler ───────────────────────────────────────────────────

export async function POST(req: Request): Promise<NextResponse<ReportApiResponse>> {
  if (process.env.FEATURE_AI_REPORTS !== 'true') {
    return NextResponse.json({ error: 'AI reports are disabled.', code: 'AI_REPORTS_DISABLED' }, { status: 403 });
  }

  const subject = parseAppSubject(req);
  const access = await verifyPremiumAccess(subject, 'ai_report');
  if (!access.allowed) {
    return NextResponse.json({ error: access.reason, code: access.code }, { status: access.status });
  }

  const providerResult = createReportProvider();
  if (!providerResult.ok) {
    return NextResponse.json({ error: providerResult.error, code: 'AI_PROVIDER_UNCONFIGURED' }, { status: 503 });
  }

  let input: unknown;
  try { input = await req.json(); } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON.', code: 'INVALID_JSON' }, { status: 400 });
  }

  const parsed = parseReportRequest(input);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error, code: parsed.code }, { status: 400 });
  }

  // Auto-collect live feed data when no explicit sources provided
  let requestInput = parsed.value;
  if (requestInput.sources.length === 0) {
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '');
    const feedSources = await collectFeedSources(appUrl);
    if (feedSources.length > 0) {
      requestInput = { ...requestInput, sources: feedSources };
    }
  }

  const generateResult = await providerResult.provider.generateReport(requestInput);
  if (!generateResult.ok) {
    return NextResponse.json({ error: generateResult.error, code: generateResult.code }, { status: 502 });
  }

  const report = generateResult.report;
  const persistence = await persistReportRecord(subject.subjectId ?? 'unknown', report, {
    sourcePayload: requestInput,
  });

  if (persistence.status === 'failed') {
    return NextResponse.json({ error: persistence.reason, code: 'REPORT_PERSISTENCE_FAILED' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, report, persistence }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
