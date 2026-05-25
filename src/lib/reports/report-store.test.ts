import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GeneratedReport } from '@/lib/ai/report-generator';

const report: GeneratedReport = {
  report_id: 'report_1',
  status: 'completed',
  topic: 'Strait of Hormuz',
  region: 'Gulf',
  generated_at: '2026-05-25T00:00:00.000Z',
  model: 'aegisgrid-deterministic-report-v1',
  confidence: 'low',
  markdown: '## Executive Summary\nSource-bounded.',
  citations: [],
};

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.DATABASE_URL;
});

describe('report persistence store', () => {
  it('skips persistence when DATABASE_URL is not configured', async () => {
    vi.resetModules();
    const { persistReportRecord } = await import('./report-store');

    await expect(persistReportRecord('alice', report)).resolves.toMatchObject({
      persisted: false,
      status: 'skipped_unconfigured',
    });
  });

  it('persists reports through an injected repository when DATABASE_URL is configured', async () => {
    vi.resetModules();
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/aegisgrid';
    const repository = {
      persistReport: vi.fn(async () => ({ id: 'db_report_1', created_at: '2026-05-25T00:00:01.000Z' })),
    };
    const { persistReportRecord } = await import('./report-store');

    const result = await persistReportRecord('alice', report, { repository, sourcePayload: { region: 'Gulf' } });

    expect(result).toMatchObject({
      persisted: true,
      status: 'persisted',
      record_id: 'db_report_1',
    });
    expect(repository.persistReport).toHaveBeenCalledWith('alice', report, { region: 'Gulf' });
  });

  it('fails closed when a configured database cannot persist the report', async () => {
    vi.resetModules();
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/aegisgrid';
    const repository = {
      persistReport: vi.fn(async () => { throw new Error('connection refused'); }),
    };
    const { persistReportRecord } = await import('./report-store');

    const result = await persistReportRecord('alice', report, { repository });

    expect(result).toMatchObject({
      persisted: false,
      status: 'failed',
      reason: 'Database report persistence failed.',
    });
    expect(JSON.stringify(result)).not.toContain('connection refused');
  });
});
