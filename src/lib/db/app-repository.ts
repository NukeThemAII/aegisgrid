import { randomUUID } from 'node:crypto';
import type { GeneratedReport } from '@/lib/ai/report-generator';
import { queryPg } from './postgres';

export type PremiumCapability = 'ai_report' | 'api_access' | 'premium';
export type EntitlementSource = 'stripe' | 'x402' | 'admin' | 'manual' | 'system';
export type EntitlementStatus = 'active' | 'trialing' | 'past_due' | 'canceled' | 'expired' | 'revoked';

export interface ActiveEntitlement {
  id: string;
  capability: string;
  source: EntitlementSource;
  status: EntitlementStatus;
  valid_until: string | null;
}

export interface StoredReportRecord {
  id: string;
  created_at: string;
}

export interface QueryExecutor {
  query(text: string, values?: readonly unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
}

export interface AppRepository {
  findActiveEntitlement(subjectId: string, capability: PremiumCapability, now?: Date): Promise<ActiveEntitlement | null>;
  persistReport(subjectId: string, report: GeneratedReport, sourcePayload?: unknown): Promise<StoredReportRecord>;
}

function capabilitySearch(capability: PremiumCapability): string[] {
  return capability === 'premium' ? ['premium'] : [capability, 'premium'];
}

function stringifyDbDate(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function normalizeEntitlementRow(row: Record<string, unknown>): ActiveEntitlement {
  return {
    id: String(row.id),
    capability: String(row.capability),
    source: String(row.source) as EntitlementSource,
    status: String(row.status) as EntitlementStatus,
    valid_until: stringifyDbDate(row.valid_until),
  };
}

function normalizeStoredReport(row: Record<string, unknown>): StoredReportRecord {
  return {
    id: String(row.id),
    created_at: stringifyDbDate(row.created_at) ?? new Date().toISOString(),
  };
}

function reportRecordId(): string {
  return `db_report_${randomUUID()}`;
}

function userRecordId(): string {
  return `user_${randomUUID()}`;
}

export function createPostgresAppRepository(executor: QueryExecutor): AppRepository {
  return {
    async findActiveEntitlement(subjectId, capability, now = new Date()) {
      const nowIso = now.toISOString();
      const result = await executor.query(
        `SELECT e.id, e.capability, e.source, e.status, e.valid_until
         FROM users u
         JOIN entitlements e ON e.user_id = u.id
         WHERE u.subject_id = $1
           AND e.capability = ANY($2::text[])
           AND e.status IN ('active', 'trialing')
           AND e.valid_from <= $3::timestamptz
           AND (e.valid_until IS NULL OR e.valid_until > $3::timestamptz)
         ORDER BY CASE WHEN e.capability = $4 THEN 0 ELSE 1 END,
                  e.valid_until NULLS LAST,
                  e.created_at DESC
         LIMIT 1`,
        [subjectId, capabilitySearch(capability), nowIso, capability],
      );

      const row = result.rows[0];
      return row ? normalizeEntitlementRow(row) : null;
    },

    async persistReport(subjectId, report, sourcePayload = {}) {
      const userResult = await executor.query(
        `INSERT INTO users (id, subject_id)
         VALUES ($1, $2)
         ON CONFLICT (subject_id)
         DO UPDATE SET updated_at = now()
         RETURNING id`,
        [userRecordId(), subjectId],
      );
      const userId = String(userResult.rows[0]?.id ?? '');
      if (!userId) {
        throw new Error('Failed to upsert report owner');
      }

      const reportResult = await executor.query(
        `INSERT INTO reports (
           id, user_id, report_id, topic, region, status, confidence,
           model, markdown, citations, source_payload, generated_at
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7,
           $8, $9, $10::jsonb, $11::jsonb, $12::timestamptz
         )
         ON CONFLICT (report_id)
         DO UPDATE SET
           topic = EXCLUDED.topic,
           region = EXCLUDED.region,
           status = EXCLUDED.status,
           confidence = EXCLUDED.confidence,
           model = EXCLUDED.model,
           markdown = EXCLUDED.markdown,
           citations = EXCLUDED.citations,
           source_payload = EXCLUDED.source_payload,
           generated_at = EXCLUDED.generated_at,
           updated_at = now()
         RETURNING id, created_at`,
        [
          reportRecordId(),
          userId,
          report.report_id,
          report.topic,
          report.region,
          report.status,
          report.confidence,
          report.model,
          report.markdown,
          JSON.stringify(report.citations),
          JSON.stringify(sourcePayload ?? {}),
          report.generated_at,
        ],
      );

      const stored = reportResult.rows[0];
      if (!stored) {
        throw new Error('Failed to persist report');
      }
      return normalizeStoredReport(stored);
    },
  };
}

let defaultRepository: AppRepository | null = null;

export function getDefaultAppRepository(): AppRepository {
  if (!defaultRepository) {
    defaultRepository = createPostgresAppRepository({ query: queryPg });
  }
  return defaultRepository;
}
