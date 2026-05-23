/**
 * Scanner audit logging — structured console logger.
 *
 * Writes JSON-structured audit entries to stdout so they can be
 * piped to any log aggregation system. No database dependency.
 *
 * Safety invariants:
 *  - SCANNER_KEY and auth headers are NEVER logged.
 *  - Targets are truncated to prevent log injection / bloat.
 *  - Client IPs are kept for rate-limit correlation but never
 *    combined with auth tokens.
 */

const MAX_TARGET_LOG_LEN = 120;

export type TargetClassification = 'ipv4' | 'ipv6' | 'domain' | 'cve' | 'cpe' | 'unknown';

export interface ScanAuditEntry {
  /** Scan type requested (e.g. 'rdns', 'whois', 'quick'). */
  scan_type: string;
  /** Classification of the target input. */
  target_classification: TargetClassification;
  /** Sanitized/truncated target for the log. */
  sanitized_target: string;
  /** Whether the scan type is passive or active. */
  mode: 'passive' | 'active' | 'unknown';
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
  // Strip control characters
  const clean = target.replace(/[\x00-\x1f\x7f]/g, '');
  if (clean.length <= MAX_TARGET_LOG_LEN) return clean;
  return clean.slice(0, MAX_TARGET_LOG_LEN) + '…';
}

/**
 * Write a structured scan audit entry to console.
 * Uses `console.info` with a parseable prefix for grep/filtering.
 *
 * IMPORTANT: This function intentionally does NOT accept any key/secret
 * fields. Callers must not pass secrets into the entry object.
 */
export function logScanAudit(entry: ScanAuditEntry): void {
  const record = {
    prefix: '[AEGIS-AUDIT]',
    timestamp: new Date().toISOString(),
    ...entry,
  };
  // Use console.info for structured audit — distinguishable from
  // console.log (debug) and console.error (failures).
  console.info(JSON.stringify(record));
}
