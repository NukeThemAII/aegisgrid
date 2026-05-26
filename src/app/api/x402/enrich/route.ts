import { NextRequest, NextResponse } from 'next/server';
import { enrichmentToReport, generateDeterministicEnrichment, parseEnrichmentRequest } from '@/lib/enrichment/enrichment-generator';
import { persistReportRecord } from '@/lib/reports/report-store';
import { buildProtectedX402Handler, createX402SettlementRecorder, loadX402RouteConfig } from '@/lib/x402/server';

export const runtime = 'nodejs';

async function enrichHandler(req: NextRequest): Promise<NextResponse> {
  let input: unknown;
  try {
    input = await req.json();
  } catch {
    return NextResponse.json({
      error: 'Request body must be valid JSON.',
      code: 'INVALID_JSON',
    }, { status: 400 });
  }

  const parsed = parseEnrichmentRequest(input);
  if (!parsed.ok) {
    return NextResponse.json({
      error: parsed.error,
      code: parsed.code,
    }, { status: 400 });
  }

  const enrichment = generateDeterministicEnrichment(parsed.value);
  const report = enrichmentToReport(enrichment);
  const persistence = await persistReportRecord('x402_paid_enrichments', report, {
    sourcePayload: {
      ...parsed.value,
      payment_provider: 'x402',
      artifact_type: 'x402_enrichment',
      enrichment_id: enrichment.enrichment_id,
    },
  });
  if (persistence.status === 'failed') {
    return NextResponse.json({
      error: persistence.reason,
      code: 'ENRICHMENT_PERSISTENCE_FAILED',
    }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    enrichment,
    report,
    persistence,
    payment: {
      provider: 'x402',
      price: process.env.X402_API_PRICE_USDC,
      network: process.env.X402_NETWORK,
    },
  }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const config = loadX402RouteConfig({
    routeLabel: 'enrichment',
    priceEnvName: 'X402_API_PRICE_USDC',
  });
  if (!config.ok) {
    return NextResponse.json({ error: config.error, code: config.code }, { status: 503 });
  }

  return buildProtectedX402Handler(config.value, enrichHandler, {
    description: 'AegisGrid source/data enrichment',
    onAfterSettle: createX402SettlementRecorder({
      reason: 'x402_enrich_payment',
      amountUsdc: config.value.amountUsdc,
    }),
  })(req);
}
