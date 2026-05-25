import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { withX402, type Network, type RouteConfig } from '@x402/next';
import { HTTPFacilitatorClient, x402ResourceServer, type SettleResultContext } from '@x402/core/server';
import { ExactEvmScheme } from '@x402/evm/exact/server';
import { createCdpAuthHeaders } from '@coinbase/x402';
import { generateDeterministicReport, parseReportRequest } from '@/lib/ai/report-generator';
import { getDefaultAppRepository } from '@/lib/db/app-repository';
import { isDatabaseConfigured } from '@/lib/db/postgres';
import { persistReportRecord } from '@/lib/reports/report-store';

export const runtime = 'nodejs';

const EVM_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const EVM_NETWORK_RE = /^eip155:\d+$/;

interface X402ReportConfig {
  enabled: boolean;
  payTo: `0x${string}`;
  facilitatorUrl: string;
  network: Network;
  price: string;
  amountUsdc: string;
  cdpApiKeyId?: string;
  cdpApiKeySecret?: string;
}

type X402ConfigResult =
  | { ok: true; value: X402ReportConfig }
  | { ok: false; code: string; error: string };

function configured(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function parseUsdAmount(value: string): { price: string; amountUsdc: string } | null {
  const trimmed = value.trim();
  const numeric = trimmed.startsWith('$') ? trimmed.slice(1) : trimmed;
  if (!/^\d+(\.\d{1,6})?$/.test(numeric)) return null;
  if (Number(numeric) <= 0) return null;
  return { price: `$${numeric}`, amountUsdc: numeric };
}

function x402ReportConfig(): X402ConfigResult {
  const enabled = process.env.X402_ENABLED === 'true' || process.env.FEATURE_X402 === 'true';
  if (!enabled) {
    return { ok: false, code: 'X402_DISABLED', error: 'x402 paid reports are disabled on this deployment.' };
  }

  if (process.env.FEATURE_AI_REPORTS !== 'true') {
    return { ok: false, code: 'AI_REPORTS_DISABLED', error: 'AI reports are disabled on this deployment.' };
  }

  if ((process.env.AI_PROVIDER || 'none').trim() !== 'deterministic') {
    return {
      ok: false,
      code: 'AI_PROVIDER_NOT_WIRED',
      error: 'x402 reports currently support the deterministic report provider only.',
    };
  }

  if (!isDatabaseConfigured()) {
    return { ok: false, code: 'X402_DATABASE_REQUIRED', error: 'DATABASE_URL is required for paid x402 report persistence and audit.' };
  }

  const payTo = configured(process.env.X402_RECEIVING_ADDRESS);
  if (!payTo || !EVM_ADDRESS_RE.test(payTo)) {
    return { ok: false, code: 'X402_RECEIVING_ADDRESS_INVALID', error: 'X402_RECEIVING_ADDRESS must be a valid EVM address.' };
  }

  const facilitatorUrl = configured(process.env.X402_FACILITATOR_URL);
  if (!facilitatorUrl) {
    return { ok: false, code: 'X402_FACILITATOR_URL_REQUIRED', error: 'X402_FACILITATOR_URL is required.' };
  }

  try {
    const parsed = new URL(facilitatorUrl);
    if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') {
      return { ok: false, code: 'X402_FACILITATOR_URL_INVALID', error: 'X402_FACILITATOR_URL must be HTTPS outside localhost.' };
    }
  } catch {
    return { ok: false, code: 'X402_FACILITATOR_URL_INVALID', error: 'X402_FACILITATOR_URL must be a valid URL.' };
  }

  const network = configured(process.env.X402_NETWORK) ?? 'eip155:8453';
  if (!EVM_NETWORK_RE.test(network)) {
    return { ok: false, code: 'X402_NETWORK_INVALID', error: 'X402_NETWORK must be an EVM CAIP-2 network such as eip155:8453.' };
  }

  const parsedPrice = parseUsdAmount(configured(process.env.X402_REPORT_PRICE_USDC) ?? '');
  if (!parsedPrice) {
    return { ok: false, code: 'X402_REPORT_PRICE_INVALID', error: 'X402_REPORT_PRICE_USDC must be a positive USD amount.' };
  }

  const cdpApiKeyId = configured(process.env.CDP_API_KEY_ID) ?? undefined;
  const cdpApiKeySecret = configured(process.env.CDP_API_KEY_SECRET) ?? undefined;

  return {
    ok: true,
    value: {
      enabled,
      payTo: payTo as `0x${string}`,
      facilitatorUrl,
      network: network as Network,
      price: parsedPrice.price,
      amountUsdc: parsedPrice.amountUsdc,
      ...(cdpApiKeyId ? { cdpApiKeyId } : {}),
      ...(cdpApiKeySecret ? { cdpApiKeySecret } : {}),
    },
  };
}

function x402SubjectId(payer: string | undefined): string {
  const safePayer = typeof payer === 'string' && EVM_ADDRESS_RE.test(payer) ? payer.toLowerCase() : 'unknown';
  return `x402_${safePayer}`.slice(0, 80);
}

function x402PaymentEventId(context: SettleResultContext): string {
  const transaction = String(context.result.transaction || '').trim().toLowerCase();
  if (transaction) return `${String(context.result.network).toLowerCase()}:${transaction}`;
  const digest = createHash('sha256')
    .update(JSON.stringify(context.paymentPayload))
    .digest('hex');
  return `${String(context.requirements.network).toLowerCase()}:payload:${digest}`;
}

async function recordX402Settlement(context: SettleResultContext): Promise<void> {
  if (!isDatabaseConfigured()) return;

  try {
    const repository = getDefaultAppRepository();
    const eventId = x402PaymentEventId(context);
    const metadata = {
      network: context.result.network,
      transaction: context.result.transaction,
      payer: context.result.payer ?? null,
      amount: context.requirements.amount,
      asset: context.requirements.asset,
      payTo: context.requirements.payTo,
      scheme: context.requirements.scheme,
    };

    const claim = await repository.claimPaymentEvent('x402', eventId, 'x402.payment.settled', metadata);
    if (claim === 'claimed') {
      await repository.markPaymentEventProcessed('x402', eventId, metadata);
    }
    const amountUsdc = parseUsdAmount(configured(process.env.X402_REPORT_PRICE_USDC) ?? '')?.amountUsdc ?? null;
    await repository.recordCreditLedgerEntry({
      subjectId: x402SubjectId(context.result.payer),
      direction: 'credit',
      creditsDelta: 0,
      reason: 'x402_report_payment',
      externalRef: `x402:${eventId}`,
      amountUsdc,
      metadata,
    });
  } catch {
    // Do not leak payment details or break an already-settled paid response because audit persistence failed.
  }
}

async function reportHandler(req: NextRequest): Promise<NextResponse> {
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
  const persistence = await persistReportRecord('x402_paid_reports', report, {
    sourcePayload: { ...parsed.value, payment_provider: 'x402' },
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
    payment: {
      provider: 'x402',
      price: process.env.X402_REPORT_PRICE_USDC,
      network: process.env.X402_NETWORK,
    },
  }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}

function buildProtectedHandler(config: X402ReportConfig): (request: NextRequest) => Promise<NextResponse> {
  const facilitatorClient = new HTTPFacilitatorClient({
    url: config.facilitatorUrl,
    ...(config.cdpApiKeyId && config.cdpApiKeySecret
      ? { createAuthHeaders: createCdpAuthHeaders(config.cdpApiKeyId, config.cdpApiKeySecret) }
      : {}),
  });
  const resourceServer = new x402ResourceServer(facilitatorClient)
    .register(config.network, new ExactEvmScheme())
    .onAfterSettle(recordX402Settlement);

  const routeConfig: RouteConfig = {
    accepts: [{
      scheme: 'exact',
      price: config.price,
      network: config.network,
      payTo: config.payTo,
    }],
    description: 'AegisGrid source-bounded situational report',
    mimeType: 'application/json',
  };

  return withX402(reportHandler, routeConfig, resourceServer);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const config = x402ReportConfig();
  if (!config.ok) {
    return NextResponse.json({ error: config.error, code: config.code }, { status: 503 });
  }

  return buildProtectedHandler(config.value)(req);
}

export const __test__ = {
  parseUsdAmount,
  x402ReportConfig,
  x402PaymentEventId,
};
