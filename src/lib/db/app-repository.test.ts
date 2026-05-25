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
});
