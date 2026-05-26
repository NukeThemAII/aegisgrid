import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mockRepository = {
  findX402AuditRecords: vi.fn(async () => ({
    reports: [
      {
        id: 'db_report_1',
        report_id: 'report_123',
        subject_id: 'x402_paid_reports',
        topic: 'Paid report',
        region: 'Gulf',
        status: 'completed',
        confidence: 'medium',
        model: 'aegisgrid-deterministic-report-v1',
        markdown: 'paid report markdown',
        citations: [],
        source_payload: { payment_provider: 'x402' },
        generated_at: '2026-05-26T10:00:00.000Z',
        created_at: '2026-05-26T10:00:01.000Z',
        updated_at: '2026-05-26T10:00:01.000Z',
      },
    ],
    paymentEvents: [
      {
        provider: 'x402',
        event_id: 'eip155:84532:0xabc123',
        event_type: 'x402.payment.settled',
        status: 'processed',
        metadata: { transaction: '0xabc123' },
        created_at: '2026-05-26T10:00:02.000Z',
        updated_at: '2026-05-26T10:00:02.000Z',
        processed_at: '2026-05-26T10:00:02.000Z',
      },
    ],
    creditLedger: [
      {
        id: 'ledger_1',
        subject_id: 'x402_0x2222222222222222222222222222222222222222',
        direction: 'credit',
        amount_usdc: '1.000000',
        credits_delta: 0,
        reason: 'x402_report_payment',
        external_ref: 'x402:eip155:84532:0xabc123',
        metadata: { transaction: '0xabc123' },
        created_at: '2026-05-26T10:00:02.000Z',
      },
    ],
  })),
};

vi.mock('@/lib/db/postgres', () => ({
  isDatabaseConfigured: vi.fn(() => Boolean(process.env.DATABASE_URL)),
}));

vi.mock('@/lib/db/app-repository', () => ({
  getDefaultAppRepository: vi.fn(() => mockRepository),
}));

function clearEnv() {
  for (const key of ['DATABASE_URL', 'AUTH_ADMIN_TOKEN', 'AUTH_USER_TOKENS']) delete process.env[key];
}

function request(url: string, token?: string): NextRequest {
  return new NextRequest(url, {
    method: 'GET',
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

afterEach(() => {
  vi.clearAllMocks();
  clearEnv();
});

describe('/api/x402/audit', () => {
  it('requires an admin bearer token', async () => {
    vi.resetModules();
    process.env.DATABASE_URL = 'postgresql://user:***@localhost:5432/aegisgrid';
    process.env.AUTH_ADMIN_TOKEN = 'adm1n';
    process.env.AUTH_USER_TOKENS = 'alice:user1';
    const { GET } = await import('./route');

    const noToken = await GET(request('http://localhost/api/x402/audit?report_id=report_123'));
    const userToken = await GET(request('http://localhost/api/x402/audit?report_id=report_123', 'user1'));

    expect(noToken.status).toBe(401);
    expect(userToken.status).toBe(403);
    expect(mockRepository.findX402AuditRecords).not.toHaveBeenCalled();
  });

  it('finds x402 audit records by report id', async () => {
    vi.resetModules();
    process.env.DATABASE_URL = 'postgresql://user:***@localhost:5432/aegisgrid';
    process.env.AUTH_ADMIN_TOKEN = 'adm1n';
    const { GET } = await import('./route');

    const res = await GET(request('http://localhost/api/x402/audit?report_id=report_123', 'adm1n'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.query).toEqual({ report_id: 'report_123' });
    expect(body.reports[0].report_id).toBe('report_123');
    expect(mockRepository.findX402AuditRecords).toHaveBeenCalledWith({ reportId: 'report_123' });
  });

  it('finds x402 audit records by transaction hash case-insensitively', async () => {
    vi.resetModules();
    process.env.DATABASE_URL = 'postgresql://user:***@localhost:5432/aegisgrid';
    process.env.AUTH_ADMIN_TOKEN = 'adm1n';
    const { GET } = await import('./route');

    const res = await GET(request('http://localhost/api/x402/audit?transaction=0xABC123', 'adm1n'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.payment_events[0].event_id).toBe('eip155:84532:0xabc123');
    expect(mockRepository.findX402AuditRecords).toHaveBeenCalledWith({ transaction: '0xabc123' });
  });

  it('rejects missing or malformed lookup parameters before querying the database', async () => {
    vi.resetModules();
    process.env.DATABASE_URL = 'postgresql://user:***@localhost:5432/aegisgrid';
    process.env.AUTH_ADMIN_TOKEN = 'adm1n';
    const { GET } = await import('./route');

    const missing = await GET(request('http://localhost/api/x402/audit', 'adm1n'));
    const malformed = await GET(request('http://localhost/api/x402/audit?transaction=javascript:alert(1)', 'adm1n'));

    expect(missing.status).toBe(400);
    expect(malformed.status).toBe(400);
    expect(mockRepository.findX402AuditRecords).not.toHaveBeenCalled();
  });
});
