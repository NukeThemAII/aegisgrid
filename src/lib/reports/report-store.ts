import type { GeneratedReport } from '@/lib/ai/report-generator';

export interface ReportPersistenceResult {
  persisted: boolean;
  status: 'skipped_unconfigured' | 'skipped_unwired';
  reason: string;
}

export async function persistReportRecord(
  _subjectId: string,
  _report: GeneratedReport,
): Promise<ReportPersistenceResult> {
  // Database persistence is intentionally not implemented until the Postgres
  // client/schema migration lands. This function centralizes the seam so report
  // routes can be wired without silently pretending persistence exists.
  if (!process.env.DATABASE_URL?.trim()) {
    return {
      persisted: false,
      status: 'skipped_unconfigured',
      reason: 'DATABASE_URL is not configured.',
    };
  }

  return {
    persisted: false,
    status: 'skipped_unwired',
    reason: 'DATABASE_URL is configured, but the report persistence adapter is not wired yet.',
  };
}
