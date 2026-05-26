import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import type { SettleResultContext } from '@x402/core/server';

const VALID_EVM_ADDRESS = '0x1111111111111111111111111111111111111111';

const mockRepository = {
  claimPaymentEvent: vi.fn(async () => 'claimed' as const),
  markPaymentEventProcessed: vi.fn(async () => undefined),
  recordCreditLedgerEntry: vi.fn(async () => ({ id: 'ledger_1', inserted: true })),
  persistReport: vi.fn(async () => ({ id: 'db_enrichment_report_1', created_at: '2026-05-26T10:00:00.000Z' })),
};

interface MockServer {
  register: ReturnType<typeof vi.fn>;
  onAfterSettle: ReturnType<typeof vi.fn>;
  afterSettle?: (context: SettleResultContext) => Promise<void>;
}

const mockWithX402 = vi.fn((
  handler: (request: NextRequest) => Promise<NextResponse>,
  _routeConfig: unknown,
  server: MockServer,
) => async (req: NextRequest) => {
  const response = await handler(req);
  if (response.status < 400 && server.afterSettle) {
    const responseBody = Buffer.from(await response.clone().arrayBuffer());
    await server.afterSettle({
      paymentPayload: { x402Version: 1, scheme: 'exact', network: 'eip155:84532', payload: {} },
      requirements: {
        scheme: 'exact',
        network: 'eip155:84532',
        amount: '50000',
        asset: '0xToken',
        payTo: VALID_EVM_ADDRESS,
        maxTimeoutSeconds: 60,
        resource: 'http://localhost/api/x402/enrich',
        description: 'AegisGrid source/data enrichment',
        mimeType: 'application/json',
        extra: {},
      },
      declaredExtensions: {},
      transportContext: { responseBody },
      result: {
        success: true,
        transaction: '0xdef456',
        network: 'eip155:84532',
        payer: '0x2222222222222222222222222222222222222222',
      },
    } as unknown as SettleResultContext);
  }
  return response;
});

vi.mock('@x402/next', () => ({
  withX402: mockWithX402,
}));

vi.mock('@x402/core/server', () => ({
  HTTPFacilitatorClient: vi.fn(function HTTPFacilitatorClientMock() {
    return {};
  }),
  x402ResourceServer: vi.fn(function X402ResourceServerMock() {
    const server: MockServer = {
      register: vi.fn(() => server),
      onAfterSettle: vi.fn((hook: MockServer['afterSettle']) => {
        server.afterSettle = hook;
        return server;
      }),
    };
    return server;
  }),
}));

vi.mock('@x402/evm/exact/server', () => ({
  ExactEvmScheme: vi.fn(function ExactEvmSchemeMock() {
    return {};
  }),
}));

vi.mock('@coinbase/x402', () => ({
  createCdpAuthHeaders: vi.fn(() => async () => ({ verify: {}, settle: {}, supported: {} })),
}));

vi.mock('@/lib/db/postgres', () => ({
  isDatabaseConfigured: vi.fn(() => Boolean(process.env.DATABASE_URL)),
  databaseProvider: vi.fn(() => 'postgresql'),
}));

vi.mock('@/lib/db/app-repository', () => ({
  getDefaultAppRepository: vi.fn(() => mockRepository),
}));

function clearEnv() {
  for (const key of [
    'X402_ENABLED',
    'FEATURE_X402',
    'X402_RECEIVING_ADDRESS',
    'X402_FACILITATOR_URL',
    'X402_NETWORK',
    'X402_API_PRICE_USDC',
    'DATABASE_URL',
    'CDP_API_KEY_ID',
    'CDP_API_KEY_SECRET',
  ]) delete process.env[key];
}

function setValidEnv() {
  process.env.X402_ENABLED = 'true';
  process.env.X402_RECEIVING_ADDRESS = VALID_EVM_ADDRESS;
  process.env.X402_FACILITATOR_URL = 'https://x402.org/facilitator';
  process.env.X402_NETWORK = 'eip155:84532';
  process.env.X402_API_PRICE_USDC = '0.05';
  process.env.DATABASE_URL = 'postgresql://user:***@localhost:5432/aegisgrid';
}

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/x402/enrich', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

afterEach(() => {
  vi.clearAllMocks();
  clearEnv();
});

describe('/api/x402/enrich', () => {
  it('fails closed before invoking x402 when disabled', async () => {
    vi.resetModules();
    const { POST } = await import('./route');

    const res = await POST(makeRequest({ target_type: 'domain', target: 'example.com', observations: [] }));
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.code).toBe('X402_DISABLED');
    expect(mockWithX402).not.toHaveBeenCalled();
  });

  it('wraps the endpoint with official withX402 and returns source-bounded enrichment', async () => {
    vi.resetModules();
    setValidEnv();
    const { POST } = await import('./route');

    const res = await POST(makeRequest({
      target_type: 'domain',
      target: 'example.com',
      observations: [{ title: 'CT log', summary: 'Observed new certificate for login.example.com', source: 'crt.sh', confidence: 'medium' }],
    }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.enrichment.target).toBe('example.com');
    expect(body.enrichment.summary).toContain('source-bounded');
    expect(mockRepository.persistReport).toHaveBeenCalledWith(
      'x402_paid_enrichments',
      expect.objectContaining({ topic: 'Data enrichment: example.com' }),
      expect.objectContaining({ payment_provider: 'x402', artifact_type: 'x402_enrichment' }),
    );
    expect(mockWithX402).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        accepts: [expect.objectContaining({
          scheme: 'exact',
          price: '$0.05',
          network: 'eip155:84532',
          payTo: VALID_EVM_ADDRESS,
        })],
        description: 'AegisGrid source/data enrichment',
        mimeType: 'application/json',
      }),
      expect.any(Object),
    );
  });

  it('records enrichment-specific x402 audit metadata after settlement', async () => {
    vi.resetModules();
    setValidEnv();
    const { POST } = await import('./route');

    const res = await POST(makeRequest({ target_type: 'ip', target: '203.0.113.10', observations: [] }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.enrichment.enrichment_id).toMatch(/^enrich_/);
    expect(mockRepository.claimPaymentEvent).toHaveBeenCalledWith(
      'x402',
      'eip155:84532:0xdef456',
      'x402.payment.settled',
      expect.objectContaining({
        transaction: '0xdef456',
        paid_result: expect.objectContaining({
          kind: 'enrichment',
          enrichment_id: body.enrichment.enrichment_id,
          report_id: body.report.report_id,
          db_report_id: 'db_enrichment_report_1',
        }),
      }),
    );
    expect(mockRepository.recordCreditLedgerEntry).toHaveBeenCalledWith(expect.objectContaining({
      reason: 'x402_enrich_payment',
      externalRef: 'x402:eip155:84532:0xdef456',
      amountUsdc: '0.05',
      direction: 'credit',
      creditsDelta: 0,
    }));
  });

  it('returns validation errors without recording settlement audit', async () => {
    vi.resetModules();
    setValidEnv();
    const { POST } = await import('./route');

    const res = await POST(makeRequest({ target_type: 'domain', target: '', observations: [] }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe('INVALID_TARGET');
    expect(mockRepository.claimPaymentEvent).not.toHaveBeenCalled();
  });
});
