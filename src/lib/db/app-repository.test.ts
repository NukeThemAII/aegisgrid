import { describe, expect, it, vi } from 'vitest';
import type { GeneratedReport } from '@/lib/ai/report-generator';

const sampleReport: GeneratedReport = {
  report_id: 'report_1',
  status: 'completed',
  topic: 'Strait of Hormuz',
  region: 'Gulf',
  generated_at: '2026-05-25T00:00:00.000Z',
  model: 'aegisgrid-deterministic-report-v1',
  confidence: 'low',
  markdown: '## Executive Summary\nSource-bounded.',
  citations: [
    { index: 1, title: 'AIS', source: 'AegisGrid', source_url: null, confidence: 'low' },
  ],
};

describe('Postgres app repository', () => {
  it('finds active premium-compatible entitlements using parameterized SQL', async () => {
    const query = vi.fn(async () => ({
      rows: [
        {
          id: 'ent_1',
          capability: 'premium',
          source: 'stripe',
          status: 'active',
          valid_until: null,
        },
      ],
    }));
    const { createPostgresAppRepository } = await import('./app-repository');
    const repo = createPostgresAppRepository({ query });

    const entitlement = await repo.findActiveEntitlement('alice', 'ai_report', new Date('2026-05-25T00:00:00.000Z'));

    expect(entitlement).toMatchObject({ id: 'ent_1', capability: 'premium', source: 'stripe' });
    expect(query).toHaveBeenCalledTimes(1);
    const [sql, values] = query.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain('$1');
    expect(sql).toContain('ANY($2::text[])');
    expect(sql).toContain('e.valid_from <= $3::timestamptz');
    expect(sql).toContain('(e.valid_until IS NULL OR e.valid_until > $3::timestamptz)');
    expect(sql).toContain("e.status IN ('active', 'trialing')");
    expect(sql).not.toContain('alice');
    expect(values).toEqual([
      'alice',
      ['ai_report', 'premium'],
      '2026-05-25T00:00:00.000Z',
      'ai_report',
    ]);
  });

  it('returns null when no active entitlement exists', async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    const { createPostgresAppRepository } = await import('./app-repository');
    const repo = createPostgresAppRepository({ query });

    await expect(repo.findActiveEntitlement('alice', 'api_access')).resolves.toBeNull();
  });

  it('upserts users and stores reports without interpolating user content into SQL', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: 'user_1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'db_report_1', created_at: '2026-05-25T00:00:01.000Z' }] });
    const { createPostgresAppRepository } = await import('./app-repository');
    const repo = createPostgresAppRepository({ query });

    const stored = await repo.persistReport('alice', sampleReport, { request_ip: '203.0.113.10' });

    expect(stored).toEqual({ id: 'db_report_1', created_at: '2026-05-25T00:00:01.000Z' });
    expect(query).toHaveBeenCalledTimes(2);
    const [upsertSql, upsertValues] = query.mock.calls[0] as unknown as [string, unknown[]];
    const [insertSql, insertValues] = query.mock.calls[1] as unknown as [string, unknown[]];
    expect(upsertSql).toContain('ON CONFLICT (subject_id)');
    expect(upsertSql).not.toContain('alice');
    expect(upsertValues[1]).toBe('alice');
    expect(insertSql).toContain('INSERT INTO reports');
    expect(insertSql).not.toContain(sampleReport.markdown);
    expect(insertValues).toEqual(expect.arrayContaining(['user_1', sampleReport.report_id, sampleReport.markdown]));
  });

  it('claims payment events before processing and recognizes duplicates', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ status: 'processing' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ status: 'processed' }] });
    const { createPostgresAppRepository } = await import('./app-repository');
    const repo = createPostgresAppRepository({ query });

    await expect(repo.claimPaymentEvent('stripe', 'evt_1', 'checkout.session.completed')).resolves.toBe('claimed');
    await expect(repo.claimPaymentEvent('stripe', 'evt_1', 'checkout.session.completed')).resolves.toBe('duplicate_processed');

    const [insertSql, insertValues] = query.mock.calls[0] as unknown as [string, unknown[]];
    expect(insertSql).toContain('INSERT INTO payment_events');
    expect(insertSql).toContain('ON CONFLICT (provider, event_id) DO NOTHING');
    expect(insertSql).not.toContain('evt_1');
    expect(insertValues).toEqual(expect.arrayContaining(['stripe', 'evt_1', 'checkout.session.completed']));
  });

  it('reclaims stale processing payment events after the timeout window', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ status: 'processing' }] })
      .mockResolvedValueOnce({ rows: [{ status: 'processing' }] });
    const { createPostgresAppRepository } = await import('./app-repository');
    const repo = createPostgresAppRepository({ query });

    await expect(repo.claimPaymentEvent('stripe', 'evt_stale', 'checkout.session.completed', { retry: true })).resolves.toBe('claimed');

    const allSql = query.mock.calls.map((call) => String(call[0])).join('\n');
    expect(allSql).toContain("updated_at < now() - interval '15 minutes'");
    expect(allSql).toContain('RETURNING status');
  });

  it('finds x402 audit records by transaction and linked report id using parameterized SQL', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{
        provider: 'x402',
        event_id: 'eip155:84532:0xabc123',
        event_type: 'x402.payment.settled',
        status: 'processed',
        metadata: { transaction: '0xabc123', paid_result: { report_id: 'report_123' } },
        created_at: '2026-05-26T10:00:00.000Z',
        updated_at: '2026-05-26T10:00:00.000Z',
        processed_at: '2026-05-26T10:00:00.000Z',
      }] })
      .mockResolvedValueOnce({ rows: [{
        id: 'db_report_1',
        report_id: 'report_123',
        subject_id: 'x402_paid_reports',
        topic: 'Paid report',
        region: null,
        status: 'completed',
        confidence: 'medium',
        model: 'aegisgrid-deterministic-report-v1',
        markdown: 'paid report markdown',
        citations: [],
        source_payload: { payment_provider: 'x402' },
        generated_at: '2026-05-26T10:00:00.000Z',
        created_at: '2026-05-26T10:00:00.000Z',
        updated_at: '2026-05-26T10:00:00.000Z',
      }] })
      .mockResolvedValueOnce({ rows: [{
        id: 'ledger_1',
        subject_id: 'x402_0x2222222222222222222222222222222222222222',
        direction: 'credit',
        amount_usdc: '1.000000',
        credits_delta: 0,
        reason: 'x402_report_payment',
        external_ref: 'x402:eip155:84532:0xabc123',
        metadata: { transaction: '0xabc123' },
        created_at: '2026-05-26T10:00:00.000Z',
      }] });
    const { createPostgresAppRepository } = await import('./app-repository');
    const repo = createPostgresAppRepository({ query });

    const records = await repo.findX402AuditRecords({ transaction: '0xabc123' });

    expect(records.paymentEvents[0].event_id).toBe('eip155:84532:0xabc123');
    expect(records.reports[0].report_id).toBe('report_123');
    expect(records.creditLedger[0].external_ref).toBe('x402:eip155:84532:0xabc123');
    expect(query).toHaveBeenCalledTimes(3);
    const allSql = query.mock.calls.map((call) => String(call[0])).join('\n');
    expect(allSql).toContain("provider = 'x402'");
    expect(allSql).toContain("metadata->>'transaction'");
    expect(allSql).toContain('r.source_payload->>\'payment_provider\' = \'x402\'');
    expect(allSql).not.toContain('0xabc123');
  });

  it('upserts billing users, entitlements, and credit ledger rows with parameterized SQL', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: 'user_1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'user_1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'ent_1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'user_1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'ledger_1' }] });
    const { createPostgresAppRepository } = await import('./app-repository');
    const repo = createPostgresAppRepository({ query });

    await expect(repo.upsertBillingUser({ subjectId: 'alice', stripeCustomerId: 'cus_123' })).resolves.toBe('user_1');
    await expect(repo.upsertEntitlementForExternalRef({
      subjectId: 'alice',
      capability: 'premium',
      source: 'stripe',
      status: 'active',
      externalRef: 'stripe:subscription:sub_123',
    })).resolves.toEqual({ id: 'ent_1' });
    await expect(repo.recordCreditLedgerEntry({
      subjectId: 'alice',
      direction: 'credit',
      creditsDelta: 10,
      reason: 'stripe_report_pack',
      externalRef: 'stripe:checkout:cs_123',
    })).resolves.toEqual({ id: 'ledger_1', inserted: true });

    expect(query).toHaveBeenCalledTimes(5);
    const allSql = query.mock.calls.map((call) => String(call[0])).join('\n');
    expect(allSql).toContain('stripe_customer_id');
    expect(allSql).toContain('INSERT INTO entitlements');
    expect(allSql).toContain('ON CONFLICT (external_ref) WHERE external_ref IS NOT NULL DO UPDATE');
    expect(allSql).toContain('INSERT INTO credit_ledger');
    expect(allSql).not.toContain('cus_123');
    expect(allSql).not.toContain('stripe:checkout:cs_123');
  });
});
