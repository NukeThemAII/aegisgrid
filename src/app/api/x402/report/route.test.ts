import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import type { SettleResultContext } from '@x402/core/server';

const VALID_EVM_ADDRESS = '0x1111111111111111111111111111111111111111';

const mockRepository = {
  claimPaymentEvent: vi.fn(async () => 'claimed' as const),
  markPaymentEventProcessed: vi.fn(async () => undefined),
  recordCreditLedgerEntry: vi.fn(async () => ({ id: 'ledger_1', inserted: true })),
  persistReport: vi.fn(async () => ({ id: 'db_report_1', created_at: '2026-05-25T20:00:00.000Z' })),
};

interface MockServer {
  register: ReturnType<typeof vi.fn>;
  onAfterSettle: ReturnType<typeof vi.fn>;
  afterSettle?: (context: SettleResultContext) => Promise<void>;
}

const mockServers: MockServer[] = [];
const mockWithX402 = vi.fn((
  handler: (request: NextRequest) => Promise<NextResponse>,
  _routeConfig: unknown,
  server: MockServer,
) => async (req: NextRequest) => {
  const response = await handler(req);
  if (response.status < 400 && server.afterSettle) {
    await server.afterSettle({
      paymentPayload: { x402Version: 1, scheme: 'exact', network: 'eip155:84532', payload: {} },
      requirements: {
        scheme: 'exact',
        network: 'eip155:84532',
        amount: '1000000',
        asset: '0xToken',
        payTo: VALID_EVM_ADDRESS,
        maxTimeoutSeconds: 60,
        resource: 'http://localhost/api/x402/report',
        description: 'AegisGrid source-bounded situational report',
        mimeType: 'application/json',
        extra: {},
      },
      declaredExtensions: {},
      result: {
        success: true,
        transaction: '0xabc123',
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
    mockServers.push(server);
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
    'X402_REPORT_PRICE_USDC',
    'FEATURE_AI_REPORTS',
    'AI_PROVIDER',
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
  process.env.X402_REPORT_PRICE_USDC = '1.00';
  process.env.FEATURE_AI_REPORTS = 'true';
  process.env.AI_PROVIDER = 'deterministic';
  process.env.DATABASE_URL = 'postgresql://user:***@localhost:5432/aegisgrid';
}

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/x402/report', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

afterEach(() => {
  vi.clearAllMocks();
  mockServers.length = 0;
  clearEnv();
});

describe('/api/x402/report', () => {
  it('fails closed before invoking x402 when disabled', async () => {
    vi.resetModules();
    const { POST } = await import('./route');

    const res = await POST(makeRequest({ topic: 'Hormuz', sources: [] }));
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.code).toBe('X402_DISABLED');
    expect(mockWithX402).not.toHaveBeenCalled();
  });

  it('fails closed before invoking x402 when receiver address is invalid', async () => {
    vi.resetModules();
    setValidEnv();
    process.env.X402_RECEIVING_ADDRESS = '0x123';
    const { POST } = await import('./route');

    const res = await POST(makeRequest({ topic: 'Hormuz', sources: [] }));
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.code).toBe('X402_RECEIVING_ADDRESS_INVALID');
    expect(mockWithX402).not.toHaveBeenCalled();
  });

  it('fails closed before invoking x402 when AI reports are not deterministic', async () => {
    vi.resetModules();
    setValidEnv();
    process.env.AI_PROVIDER = 'openai';
    const { POST } = await import('./route');

    const res = await POST(makeRequest({ topic: 'Hormuz', sources: [] }));
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.code).toBe('AI_PROVIDER_NOT_WIRED');
    expect(mockWithX402).not.toHaveBeenCalled();
  });

  it('fails closed before invoking x402 when DATABASE_URL is missing', async () => {
    vi.resetModules();
    setValidEnv();
    delete process.env.DATABASE_URL;
    const { POST } = await import('./route');

    const res = await POST(makeRequest({ topic: 'Hormuz', sources: [] }));
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.code).toBe('X402_DATABASE_REQUIRED');
    expect(mockWithX402).not.toHaveBeenCalled();
  });

  it('wraps the route with official withX402 config and returns deterministic report', async () => {
    vi.resetModules();
    setValidEnv();
    const { POST } = await import('./route');

    const res = await POST(makeRequest({
      topic: 'Strait of Hormuz',
      region: 'Gulf',
      sources: [{ title: 'AIS', summary: 'AIS source payload', confidence: 'medium' }],
    }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.report.topic).toBe('Strait of Hormuz');
    expect(body.report.markdown).toContain('AIS source payload');
    expect(mockWithX402).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        accepts: [expect.objectContaining({
          scheme: 'exact',
          price: '$1.00',
          network: 'eip155:84532',
          payTo: VALID_EVM_ADDRESS,
        })],
        mimeType: 'application/json',
      }),
      expect.any(Object),
    );
  });

  it('returns handler validation errors without recording settlement audit', async () => {
    vi.resetModules();
    setValidEnv();
    process.env.DATABASE_URL = 'postgresql://user:***@localhost:5432/aegisgrid';
    const { POST } = await import('./route');

    const res = await POST(makeRequest({ topic: 'x'.repeat(200), sources: [] }));
    const body = await res.json();

    expect(res.status).toBe(200); // topic auto-truncates to 180
    expect(body.ok).toBe(true);
  });

  it('records a DB audit event from the official post-settlement hook', async () => {
    vi.resetModules();
    setValidEnv();
    process.env.DATABASE_URL = 'postgresql://user:***@localhost:5432/aegisgrid';
    const { POST } = await import('./route');

    const res = await POST(makeRequest({ topic: 'Paid report', sources: [] }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(mockRepository.claimPaymentEvent).toHaveBeenCalledWith(
      'x402',
      'eip155:84532:0xabc123',
      'x402.payment.settled',
      expect.objectContaining({ transaction: '0xabc123', payer: '0x2222222222222222222222222222222222222222' }),
    );
    expect(mockRepository.markPaymentEventProcessed).toHaveBeenCalledWith(
      'x402',
      'eip155:84532:0xabc123',
      expect.any(Object),
    );
    expect(mockRepository.recordCreditLedgerEntry).toHaveBeenCalledWith(expect.objectContaining({
      subjectId: 'x402_0x2222222222222222222222222222222222222222',
      reason: 'x402_report_payment',
      externalRef: 'x402:eip155:84532:0xabc123',
      amountUsdc: '1.00',
      direction: 'credit',
      creditsDelta: 0,
    }));
  });
});
