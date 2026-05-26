import { randomUUID } from 'node:crypto';
import type { GeneratedReport } from '@/lib/ai/report-generator';
import { queryPg } from './postgres';

export type PremiumCapability = 'ai_report' | 'api_access' | 'premium';
export type EntitlementSource = 'stripe' | 'x402' | 'admin' | 'manual' | 'system';
export type EntitlementStatus = 'active' | 'trialing' | 'past_due' | 'canceled' | 'expired' | 'revoked';
export type PaymentEventClaimStatus = 'claimed' | 'duplicate_processing' | 'duplicate_processed';

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

export interface X402ReportAuditRecord {
  id: string;
  report_id: string;
  subject_id: string;
  topic: string;
  region: string | null;
  status: string;
  confidence: string;
  model: string;
  markdown: string;
  citations: unknown;
  source_payload: unknown;
  generated_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface X402PaymentEventAuditRecord {
  provider: 'x402';
  event_id: string;
  event_type: string;
  status: string;
  metadata: unknown;
  created_at: string | null;
  updated_at: string | null;
  processed_at: string | null;
}

export interface X402CreditLedgerAuditRecord {
  id: string;
  subject_id: string;
  direction: string;
  amount_usdc: string | null;
  credits_delta: number;
  reason: string;
  external_ref: string | null;
  metadata: unknown;
  created_at: string | null;
}

export interface X402AuditLookup {
  reportId?: string;
  transaction?: string;
  paymentEventId?: string;
}

export interface X402AuditRecords {
  reports: X402ReportAuditRecord[];
  paymentEvents: X402PaymentEventAuditRecord[];
  creditLedger: X402CreditLedgerAuditRecord[];
}

export interface QueryExecutor {
  query(text: string, values?: readonly unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
}

export interface AppRepository {
  findActiveEntitlement(subjectId: string, capability: PremiumCapability, now?: Date): Promise<ActiveEntitlement | null>;
  persistReport(subjectId: string, report: GeneratedReport, sourcePayload?: unknown): Promise<StoredReportRecord>;
  findX402AuditRecords(input: X402AuditLookup): Promise<X402AuditRecords>;
  claimPaymentEvent(provider: 'stripe' | 'x402', eventId: string, eventType: string, metadata?: unknown): Promise<PaymentEventClaimStatus>;
  markPaymentEventProcessed(provider: 'stripe' | 'x402', eventId: string, metadata?: unknown): Promise<void>;
  releasePaymentEventClaim(provider: 'stripe' | 'x402', eventId: string): Promise<void>;
  upsertBillingUser(input: { subjectId: string; stripeCustomerId?: string | null }): Promise<string>;
  findStripeCustomerId(subjectId: string): Promise<string | null>;
  upsertEntitlementForExternalRef(input: {
    subjectId: string;
    capability: PremiumCapability;
    source: EntitlementSource;
    status: EntitlementStatus;
    externalRef: string;
    validUntil?: string | null;
    metadata?: unknown;
  }): Promise<{ id: string }>;
  recordCreditLedgerEntry(input: {
    subjectId: string;
    direction: 'credit' | 'debit';
    creditsDelta: number;
    reason: string;
    externalRef: string;
    amountUsdc?: string | null;
    metadata?: unknown;
  }): Promise<{ id: string; inserted: boolean }>;
}

function capabilitySearch(capability: PremiumCapability): string[] {
  return capability === 'premium' ? ['premium'] : [capability, 'premium'];
}

function stringifyDbDate(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function stringOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
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

function normalizeX402ReportAudit(row: Record<string, unknown>): X402ReportAuditRecord {
  return {
    id: String(row.id),
    report_id: String(row.report_id),
    subject_id: String(row.subject_id),
    topic: String(row.topic),
    region: stringifyDbDate(row.region),
    status: String(row.status),
    confidence: String(row.confidence),
    model: String(row.model),
    markdown: String(row.markdown),
    citations: row.citations ?? [],
    source_payload: row.source_payload ?? {},
    generated_at: stringifyDbDate(row.generated_at),
    created_at: stringifyDbDate(row.created_at),
    updated_at: stringifyDbDate(row.updated_at),
  };
}

function normalizeX402PaymentEventAudit(row: Record<string, unknown>): X402PaymentEventAuditRecord {
  return {
    provider: 'x402',
    event_id: String(row.event_id),
    event_type: String(row.event_type),
    status: String(row.status),
    metadata: row.metadata ?? {},
    created_at: stringifyDbDate(row.created_at),
    updated_at: stringifyDbDate(row.updated_at),
    processed_at: stringifyDbDate(row.processed_at),
  };
}

function normalizeX402CreditLedgerAudit(row: Record<string, unknown>): X402CreditLedgerAuditRecord {
  return {
    id: String(row.id),
    subject_id: String(row.subject_id),
    direction: String(row.direction),
    amount_usdc: stringOrNull(row.amount_usdc),
    credits_delta: Number(row.credits_delta ?? 0),
    reason: String(row.reason),
    external_ref: stringOrNull(row.external_ref),
    metadata: row.metadata ?? {},
    created_at: stringifyDbDate(row.created_at),
  };
}

function jsonObject(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function linkedReportIdFromPaymentMetadata(metadata: unknown): string | null {
  const paidResult = jsonObject(jsonObject(metadata)?.paid_result);
  const reportId = paidResult?.report_id;
  return typeof reportId === 'string' && reportId ? reportId : null;
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

function reportRecordId(): string {
  return `db_report_${randomUUID()}`;
}

function userRecordId(): string {
  return `user_${randomUUID()}`;
}

function entitlementRecordId(): string {
  return `ent_${randomUUID()}`;
}

function ledgerRecordId(): string {
  return `ledger_${randomUUID()}`;
}

function paymentEventRecordId(): string {
  return `payevt_${randomUUID()}`;
}

async function upsertUserId(
  executor: QueryExecutor,
  subjectId: string,
  fields: { stripeCustomerId?: string | null } = {},
): Promise<string> {
  const result = await executor.query(
    `INSERT INTO users (id, subject_id, stripe_customer_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (subject_id)
     DO UPDATE SET
       stripe_customer_id = COALESCE(EXCLUDED.stripe_customer_id, users.stripe_customer_id),
       updated_at = now()
     RETURNING id`,
    [userRecordId(), subjectId, fields.stripeCustomerId ?? null],
  );
  const userId = String(result.rows[0]?.id ?? '');
  if (!userId) {
    throw new Error('Failed to upsert user');
  }
  return userId;
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
      const userId = await upsertUserId(executor, subjectId);

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

    async findX402AuditRecords(input) {
      const eventClauses = ["provider = 'x402'"];
      const eventValues: unknown[] = [];
      if (input.paymentEventId) {
        eventValues.push(input.paymentEventId.toLowerCase());
        eventClauses.push(`(lower(event_id) = $${eventValues.length} OR lower('x402:' || event_id) = $${eventValues.length})`);
      }
      if (input.transaction) {
        eventValues.push(input.transaction.toLowerCase());
        const txParam = eventValues.length;
        eventValues.push(`%:${input.transaction.toLowerCase()}`);
        const likeParam = eventValues.length;
        eventClauses.push(`(lower(metadata->>'transaction') = $${txParam} OR lower(event_id) LIKE $${likeParam})`);
      }
      if (input.reportId) {
        eventValues.push(input.reportId);
        eventClauses.push(`metadata #>> '{paid_result,report_id}' = $${eventValues.length}`);
      }

      const paymentEventsResult = eventValues.length > 0
        ? await executor.query(
          `SELECT provider, event_id, event_type, status, metadata, created_at, updated_at, processed_at
           FROM payment_events
           WHERE ${eventClauses.join(' AND ')}
           ORDER BY created_at DESC
           LIMIT 20`,
          eventValues,
        )
        : { rows: [] };
      const paymentEvents = paymentEventsResult.rows.map(normalizeX402PaymentEventAudit);
      const linkedReportIds = uniqueStrings([
        input.reportId,
        ...paymentEvents.map((event) => linkedReportIdFromPaymentMetadata(event.metadata)),
      ]);

      const reportsResult = linkedReportIds.length > 0
        ? await executor.query(
          `SELECT r.id, r.report_id, u.subject_id, r.topic, r.region, r.status, r.confidence,
                  r.model, r.markdown, r.citations, r.source_payload, r.generated_at,
                  r.created_at, r.updated_at
           FROM reports r
           JOIN users u ON u.id = r.user_id
           WHERE r.report_id = ANY($1::text[])
             AND r.source_payload->>'payment_provider' = 'x402'
           ORDER BY r.created_at DESC
           LIMIT 20`,
          [linkedReportIds],
        )
        : { rows: [] };
      const reports = reportsResult.rows.map(normalizeX402ReportAudit);

      const externalRefs = uniqueStrings(paymentEvents.map((event) => `x402:${event.event_id}`));
      const ledgerClauses: string[] = [];
      const ledgerValues: unknown[] = [];
      if (externalRefs.length > 0) {
        ledgerValues.push(externalRefs);
        ledgerClauses.push(`cl.external_ref = ANY($${ledgerValues.length}::text[])`);
      }
      if (input.transaction) {
        ledgerValues.push(input.transaction.toLowerCase());
        const txParam = ledgerValues.length;
        ledgerValues.push(`%:${input.transaction.toLowerCase()}`);
        const likeParam = ledgerValues.length;
        ledgerClauses.push(`lower(cl.metadata->>'transaction') = $${txParam} OR lower(cl.external_ref) LIKE $${likeParam}`);
      }
      const creditLedgerResult = ledgerClauses.length > 0
        ? await executor.query(
          `SELECT cl.id, u.subject_id, cl.direction, cl.amount_usdc, cl.credits_delta,
                  cl.reason, cl.external_ref, cl.metadata, cl.created_at
           FROM credit_ledger cl
           JOIN users u ON u.id = cl.user_id
           WHERE (${ledgerClauses.join(' OR ')})
           ORDER BY cl.created_at DESC
           LIMIT 20`,
          ledgerValues,
        )
        : { rows: [] };

      return {
        reports,
        paymentEvents,
        creditLedger: creditLedgerResult.rows.map(normalizeX402CreditLedgerAudit),
      };
    },

    async claimPaymentEvent(provider, eventId, eventType, metadata = {}) {
      const insertResult = await executor.query(
        `INSERT INTO payment_events (id, provider, event_id, event_type, status, metadata)
         VALUES ($1, $2, $3, $4, 'processing', $5::jsonb)
         ON CONFLICT (provider, event_id) DO NOTHING
         RETURNING status`,
        [paymentEventRecordId(), provider, eventId, eventType, JSON.stringify(metadata ?? {})],
      );
      if (insertResult.rows[0]) return 'claimed';

      const existing = await executor.query(
        `SELECT status
         FROM payment_events
         WHERE provider = $1 AND event_id = $2
         LIMIT 1`,
        [provider, eventId],
      );
      if (existing.rows[0]?.status === 'processed') return 'duplicate_processed';

      const reclaimed = await executor.query(
        `UPDATE payment_events
         SET event_type = $3, metadata = $4::jsonb, updated_at = now()
         WHERE provider = $1
           AND event_id = $2
           AND status = 'processing'
           AND updated_at < now() - interval '15 minutes'
         RETURNING status`,
        [provider, eventId, eventType, JSON.stringify(metadata ?? {})],
      );
      return reclaimed.rows[0] ? 'claimed' : 'duplicate_processing';
    },

    async markPaymentEventProcessed(provider, eventId, metadata = {}) {
      await executor.query(
        `UPDATE payment_events
         SET status = 'processed', metadata = metadata || $3::jsonb, processed_at = now(), updated_at = now()
         WHERE provider = $1 AND event_id = $2`,
        [provider, eventId, JSON.stringify(metadata ?? {})],
      );
    },

    async releasePaymentEventClaim(provider, eventId) {
      await executor.query(
        `DELETE FROM payment_events
         WHERE provider = $1 AND event_id = $2 AND status = 'processing'`,
        [provider, eventId],
      );
    },

    async upsertBillingUser(input) {
      return upsertUserId(executor, input.subjectId, { stripeCustomerId: input.stripeCustomerId });
    },

    async findStripeCustomerId(subjectId) {
      const result = await executor.query(
        `SELECT stripe_customer_id
         FROM users
         WHERE subject_id = $1
         LIMIT 1`,
        [subjectId],
      );
      return stringifyDbDate(result.rows[0]?.stripe_customer_id);
    },

    async upsertEntitlementForExternalRef(input) {
      const userId = await upsertUserId(executor, input.subjectId);
      const upserted = await executor.query(
        `INSERT INTO entitlements (id, user_id, capability, source, status, valid_until, external_ref, metadata)
         VALUES ($1, $2, $3, $4, $5, $6::timestamptz, $7, $8::jsonb)
         ON CONFLICT (external_ref) WHERE external_ref IS NOT NULL DO UPDATE
         SET user_id = EXCLUDED.user_id,
             capability = EXCLUDED.capability,
             source = EXCLUDED.source,
             status = EXCLUDED.status,
             valid_until = EXCLUDED.valid_until,
             metadata = EXCLUDED.metadata,
             updated_at = now()
         RETURNING id`,
        [
          entitlementRecordId(),
          userId,
          input.capability,
          input.source,
          input.status,
          input.validUntil ?? null,
          input.externalRef,
          JSON.stringify(input.metadata ?? {}),
        ],
      );
      const id = String(upserted.rows[0]?.id ?? '');
      if (!id) throw new Error('Failed to upsert entitlement');
      return { id };
    },

    async recordCreditLedgerEntry(input) {
      const userId = await upsertUserId(executor, input.subjectId);
      const result = await executor.query(
        `INSERT INTO credit_ledger (id, user_id, direction, amount_usdc, credits_delta, reason, external_ref, metadata)
         VALUES ($1, $2, $3, $4::numeric, $5, $6, $7, $8::jsonb)
         ON CONFLICT (external_ref) DO NOTHING
         RETURNING id`,
        [
          ledgerRecordId(),
          userId,
          input.direction,
          input.amountUsdc ?? null,
          input.creditsDelta,
          input.reason,
          input.externalRef,
          JSON.stringify(input.metadata ?? {}),
        ],
      );
      const row = result.rows[0];
      return row ? { id: String(row.id), inserted: true } : { id: input.externalRef, inserted: false };
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
