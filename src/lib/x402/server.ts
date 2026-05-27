import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { withX402, type Network, type RouteConfig } from '@x402/next';
import { HTTPFacilitatorClient, x402ResourceServer, type SettleResultContext } from '@x402/core/server';
import { ExactEvmScheme } from '@x402/evm/exact/server';
import { createCdpAuthHeaders } from '@coinbase/x402';
import { getDefaultAppRepository } from '@/lib/db/app-repository';
import { isDatabaseConfigured } from '@/lib/db/postgres';

export const EVM_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const EVM_NETWORK_RE = /^eip155:\d+$/;

export interface X402PaidRouteConfig {
  enabled: boolean;
  payTo: `0x${string}`;
  facilitatorUrl: string;
  network: Network;
  price: string;
  amountUsdc: string;
  cdpApiKeyId?: string;
  cdpApiKeySecret?: string;
}

export interface X402EnrichmentResult {
  kind: 'enrichment';
  enrichment_id: string | null;
  report_id: string | null;
  db_report_id: string | null;
}

export interface X402ReportResult {
  kind: 'report';
  report_id: string | null;
  db_report_id: string | null;
}

export type X402PaidResult = X402EnrichmentResult | X402ReportResult;

export type X402ConfigResult =
  | { ok: true; value: X402PaidRouteConfig }
  | { ok: false; code: string; error: string };

interface X402ConfigOptions {
  routeLabel: string;
  priceEnvName: 'X402_REPORT_PRICE_USDC' | 'X402_API_PRICE_USDC';
  requireDeterministicReports?: boolean;
}

interface SettlementRecorderOptions {
  reason: 'x402_report_payment' | 'x402_enrich_payment';
  amountUsdc: string;
}

interface ProtectedHandlerOptions {
  description: string;
  onAfterSettle: (context: SettleResultContext) => Promise<void>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function configured(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function parseUsdAmount(value: string): { price: string; amountUsdc: string } | null {
  const trimmed = value.trim();
  const numeric = trimmed.startsWith('$') ? trimmed.slice(1) : trimmed;
  if (!/^\d+(\.\d{1,6})?$/.test(numeric)) return null;
  if (Number(numeric) <= 0) return null;
  return { price: `$${numeric}`, amountUsdc: numeric };
}

export function loadX402RouteConfig(options: X402ConfigOptions): X402ConfigResult {
  const enabled = process.env.X402_ENABLED === 'true' || process.env.FEATURE_X402 === 'true';
  if (!enabled) {
    return { ok: false, code: 'X402_DISABLED', error: `x402 paid ${options.routeLabel} is disabled on this deployment.` };
  }

  if (options.requireDeterministicReports) {
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
  }

  if (!isDatabaseConfigured()) {
    return { ok: false, code: 'X402_DATABASE_REQUIRED', error: `DATABASE_URL is required for paid x402 ${options.routeLabel} persistence and audit.` };
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

  const parsedPrice = parseUsdAmount(configured(process.env[options.priceEnvName]) ?? '');
  if (!parsedPrice) {
    return { ok: false, code: `${options.priceEnvName}_INVALID`, error: `${options.priceEnvName} must be a positive USD amount.` };
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

export function x402SubjectId(payer: string | undefined): string {
  const safePayer = typeof payer === 'string' && EVM_ADDRESS_RE.test(payer) ? payer.toLowerCase() : 'unknown';
  return `x402_${safePayer}`.slice(0, 80);
}

export function x402PaymentEventId(context: SettleResultContext): string {
  const transaction = String(context.result.transaction || '').trim().toLowerCase();
  if (transaction) return `${String(context.result.network).toLowerCase()}:${transaction}`;
  const digest = createHash('sha256')
    .update(JSON.stringify(context.paymentPayload))
    .digest('hex');
  return `${String(context.requirements.network).toLowerCase()}:payload:${digest}`;
}

function parseSettlementResponseBody(context: SettleResultContext): unknown {
  const transportContext = context.transportContext;
  if (!isRecord(transportContext)) return null;
  const responseBody = transportContext.responseBody;
  let text: string | null = null;
  if (typeof responseBody === 'string') {
    text = responseBody;
  } else if (Buffer.isBuffer(responseBody)) {
    text = responseBody.toString('utf8');
  } else if (responseBody instanceof Uint8Array) {
    text = Buffer.from(responseBody).toString('utf8');
  } else if (responseBody instanceof ArrayBuffer) {
    text = Buffer.from(responseBody).toString('utf8');
  }
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function extractPaidResultFromSettlement(context: SettleResultContext): X402PaidResult | null {
  const body = parseSettlementResponseBody(context);
  if (!isRecord(body) || body.ok !== true) return null;

  const persistence = isRecord(body.persistence) ? body.persistence : null;
  const report = isRecord(body.report) ? body.report : null;
  const enrichment = isRecord(body.enrichment) ? body.enrichment : null;

  const recordId = typeof persistence?.record_id === 'string'
    ? persistence.record_id
    : (typeof persistence?.id === 'string' ? persistence.id : null);

  if (enrichment) {
    return {
      kind: 'enrichment',
      enrichment_id: typeof enrichment.enrichment_id === 'string' ? enrichment.enrichment_id : null,
      report_id: typeof report?.report_id === 'string' ? report.report_id : null,
      db_report_id: recordId,
    };
  }

  if (report) {
    return {
      kind: 'report',
      report_id: typeof report.report_id === 'string' ? report.report_id : null,
      db_report_id: recordId,
    };
  }

  return null;
}

export function createX402SettlementRecorder(options: SettlementRecorderOptions): (context: SettleResultContext) => Promise<void> {
  return async function recordX402Settlement(context: SettleResultContext): Promise<void> {
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
        paid_result: extractPaidResultFromSettlement(context),
      };

      const claim = await repository.claimPaymentEvent('x402', eventId, 'x402.payment.settled', metadata);
      if (claim !== 'claimed') return;

      await repository.recordCreditLedgerEntry({
        subjectId: x402SubjectId(context.result.payer),
        direction: 'credit',
        creditsDelta: 0,
        reason: options.reason,
        externalRef: `x402:${eventId}`,
        amountUsdc: options.amountUsdc,
        metadata,
      });
      await repository.markPaymentEventProcessed('x402', eventId, metadata);
    } catch (error) {
      console.warn('AegisGrid x402 settlement audit persistence failed', error instanceof Error ? error.message : 'unknown error');
    }
  };
}

export function buildProtectedX402Handler(
  config: X402PaidRouteConfig,
  routeHandler: (request: NextRequest) => Promise<NextResponse>,
  options: ProtectedHandlerOptions,
): (request: NextRequest) => Promise<NextResponse> {
  const facilitatorClient = new HTTPFacilitatorClient({
    url: config.facilitatorUrl,
    ...(config.cdpApiKeyId && config.cdpApiKeySecret
      ? { createAuthHeaders: createCdpAuthHeaders(config.cdpApiKeyId, config.cdpApiKeySecret) }
      : {}),
  });
  const resourceServer = new x402ResourceServer(facilitatorClient)
    .register(config.network, new ExactEvmScheme())
    .onAfterSettle(options.onAfterSettle);

  const routeConfig: RouteConfig = {
    accepts: [{
      scheme: 'exact',
      price: config.price,
      network: config.network,
      payTo: config.payTo,
    }],
    description: options.description,
    mimeType: 'application/json',
  };

  return withX402(routeHandler, routeConfig, resourceServer);
}
