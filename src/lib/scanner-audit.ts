/**
 * Scanner audit logging and lightweight persistence.
 *
 * The current foundation deliberately avoids a database dependency. Audit
 * records are emitted to structured console logs and can optionally be appended
 * to a local JSONL file for VPS/self-hosted deployments. File persistence is
 * best-effort: scanner responses must not fail just because the audit sink is
 * temporarily unavailable.
 *
 * Safety invariants:
 *  - SCANNER_KEY and auth headers are NEVER logged.
 *  - Targets are truncated to prevent log injection / bloat.
 *  - Client IPs are kept for rate-limit correlation but never combined with
 *    auth tokens.
 */

import { appendFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

const MAX_TARGET_LOG_LEN = 120;
const DEFAULT_AUDIT_PATH = '.data/scanner-audit.jsonl';

export type TargetClassification = 'ipv4' | 'ipv6' | 'domain' | 'cve' | 'cpe' | 'unknown';
export type ScannerAuditPersistence = 'file' | 'console' | 'off';
export type ScannerEntitlement =
  | 'public_passive'
  | 'target_allowlisted_active'
  | 'denied'
  | 'unknown';

export interface ScanAuditEntry {
  /** Scan type requested (e.g. 'rdns', 'whois', 'quick'). */
  scan_type: string;
  /** Classification of the target input. */
  target_classification: TargetClassification;
  /** Sanitized/truncated target for the log. */
  sanitized_target: string;
  /** Whether the scan type is passive or active. */
  mode: 'passive' | 'active' | 'unknown';
  /** Coarse entitlement decision; derived when omitted. */
  entitlement?: ScannerEntitlement;
  /** Policy decision. */
  decision: 'allowed' | 'denied';
  /** If denied, the reason. */
  denial_reason?: string;
  /** HTTP status returned. */
  result_status: number;
  /** Wall-clock duration of the scan in ms. */
  duration_ms: number;
  /** Client IP (may be proxy-forwarded). */
  client_ip: string;
}

export interface ScannerAuditRecord extends ScanAuditEntry {
  prefix: '[AEGIS-AUDIT]';
  event_id: string;
  timestamp: string;
  entitlement: ScannerEntitlement;
}

export interface ScannerAuditConfig {
  persistence: ScannerAuditPersistence;
  enabled: boolean;
  file_enabled: boolean;
  path_configured: boolean;
  log_path?: string;
}

/**
 * Classify a target string into a coarse category.
 * Does NOT validate — just classifies for logging purposes.
 */
export function classifyTarget(target: string): TargetClassification {
  const trimmed = target.trim();
  if (!trimmed) return 'unknown';
  if (/^CVE-\d{4}-\d{4,}$/i.test(trimmed)) return 'cve';
  if (/^cpe:/i.test(trimmed)) return 'cpe';
  // IPv4: dotted decimal
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(trimmed)) return 'ipv4';
  // IPv6: contains at least two colons
  if (trimmed.includes(':')) return 'ipv6';
  return 'domain';
}

/**
 * Sanitize a target for safe logging: truncate and strip control chars.
 */
export function sanitizeTargetForLog(target: string): string {
  const clean = target.replace(/[\x00-\x1f\x7f]/g, '');
  if (clean.length <= MAX_TARGET_LOG_LEN) return clean;
  return clean.slice(0, MAX_TARGET_LOG_LEN) + '…';
}

function normalizePersistence(raw: string | undefined): ScannerAuditPersistence {
  if (raw === 'console' || raw === 'off') return raw;
  return 'file';
}

export function getScannerAuditConfig(): ScannerAuditConfig {
  const persistence = normalizePersistence(process.env.SCANNER_AUDIT_PERSISTENCE);
  const rawPath = process.env.SCANNER_AUDIT_LOG_PATH?.trim() || DEFAULT_AUDIT_PATH;
  return {
    persistence,
    enabled: persistence !== 'off',
    file_enabled: persistence === 'file',
    path_configured: Boolean(rawPath),
    log_path: rawPath,
  };
}

function deriveEntitlement(entry: ScanAuditEntry): ScannerEntitlement {
  if (entry.entitlement) return entry.entitlement;
  if (entry.decision === 'denied') return 'denied';
  if (entry.mode === 'passive') return 'public_passive';
  if (entry.mode === 'active') return 'target_allowlisted_active';
  return 'unknown';
}

export function buildScanAuditRecord(entry: ScanAuditEntry, now: Date = new Date()): ScannerAuditRecord {
  return {
    prefix: '[AEGIS-AUDIT]',
    event_id: `scan_${now.getTime()}_${randomUUID()}`,
    timestamp: now.toISOString(),
    ...entry,
    entitlement: deriveEntitlement(entry),
    sanitized_target: sanitizeTargetForLog(entry.sanitized_target),
  };
}

/**
 * Write a structured scan audit entry to console.
 * Uses `console.info` with a parseable JSON record for grep/filtering.
 */
export function logScanAudit(entry: ScanAuditEntry): ScannerAuditRecord {
  const record = buildScanAuditRecord(entry);
  console.info(JSON.stringify(record));
  return record;
}

async function appendAuditRecord(record: ScannerAuditRecord, logPath: string): Promise<void> {
  await mkdir(dirname(logPath), { recursive: true });
  await appendFile(logPath, `${JSON.stringify(record)}\n`, { encoding: 'utf8', mode: 0o600 });
}

/**
 * Console-log and, when enabled, append an audit event to local JSONL storage.
 * Persistence failures are intentionally non-fatal for scanner availability.
 */
export async function recordScanAudit(entry: ScanAuditEntry): Promise<ScannerAuditRecord> {
  const config = getScannerAuditConfig();
  if (!config.enabled) return buildScanAuditRecord(entry);

  const record = logScanAudit(entry);

  if (config.file_enabled && config.log_path) {
    try {
      await appendAuditRecord(record, config.log_path);
    } catch {
      console.warn('[AEGIS-AUDIT] failed to persist scanner audit event');
    }
  }

  return record;
}
