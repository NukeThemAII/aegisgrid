import type { GeneratedReport } from '@/lib/ai/report-generator';
import type { AppRepository } from '@/lib/db/app-repository';
import { getDefaultAppRepository } from '@/lib/db/app-repository';
import { isDatabaseConfigured } from '@/lib/db/postgres';

export type ReportPersistenceStatus = 'skipped_unconfigured' | 'persisted' | 'failed';

export interface ReportPersistenceResult {
  persisted: boolean;
  status: ReportPersistenceStatus;
  reason: string;
  record_id?: string;
  created_at?: string;
}

export interface ReportPersistenceOptions {
  repository?: Pick<AppRepository, 'persistReport'>;
  sourcePayload?: unknown;
}

function repositoryFromOptions(options: ReportPersistenceOptions): Pick<AppRepository, 'persistReport'> {
  return options.repository ?? getDefaultAppRepository();
}

export async function persistReportRecord(
  subjectId: string,
  report: GeneratedReport,
  options: ReportPersistenceOptions = {},
): Promise<ReportPersistenceResult> {
  if (!isDatabaseConfigured()) {
    return {
      persisted: false,
      status: 'skipped_unconfigured',
      reason: 'DATABASE_URL is not configured.',
    };
  }

  try {
    const stored = await repositoryFromOptions(options).persistReport(
      subjectId,
      report,
      options.sourcePayload ?? {},
    );

    return {
      persisted: true,
      status: 'persisted',
      reason: 'Report persisted to PostgreSQL.',
      record_id: stored.id,
      created_at: stored.created_at,
    };
  } catch {
    return {
      persisted: false,
      status: 'failed',
      reason: 'Database report persistence failed.',
    };
  }
}
