/**
 * Scanner route policy helpers.
 *
 * Extracts the passive-vs-active routing decision into a testable module
 * so the API route can stay thin and the logic can be unit-tested without
 * spinning up the full Next.js server.
 *
 * Authoritative scan definitions are imported from scanner-v2 so there is
 * a single source of truth for which scan types exist and their mode.
 */

import {
  SCAN_DEFINITIONS,
  type ScanType,
} from '@/server/scanner-v2/scanner-service';

// Re-export for convenience
export { SCAN_DEFINITIONS, type ScanType };

/** Set of all known scan type keys. */
const KNOWN_SCAN_TYPES = new Set<string>(Object.keys(SCAN_DEFINITIONS));

/** Passive scan type keys for external reference. */
export const PASSIVE_SCAN_TYPES = Object.entries(SCAN_DEFINITIONS)
  .filter(([, def]) => def.mode === 'passive')
  .map(([key]) => key as ScanType);

/** Active scan type keys for external reference. */
export const ACTIVE_SCAN_TYPES = Object.entries(SCAN_DEFINITIONS)
  .filter(([, def]) => def.mode === 'active')
  .map(([key]) => key as ScanType);

export interface ScanPolicyResult {
  /** Whether the scan request is allowed to proceed. */
  allowed: boolean;
  /** Passive or active classification. */
  mode: 'passive' | 'active' | 'unknown';
  /** Machine-readable denial code. */
  code?: string;
  /** Human-readable denial reason. */
  denial_reason?: string;
  /** HTTP status to return when denied. */
  denial_status?: number;
  /** Available scan types (included when type is unknown). */
  available_scans?: string[];
}

/**
 * Returns true when the target is a CVE ID or CPE string (passive vuln evidence).
 * These bypass host validation since they are not network targets.
 */
export function isPassiveVulnEvidence(target: string): boolean {
  return /^CVE-\d{4}-\d{4,}$/i.test(target) || /^cpe:/i.test(target);
}

/**
 * Only the passive vuln module may accept CVE/CPE evidence strings instead of
 * host/IP targets. Every other module must still go through host validation.
 */
export function canBypassHostValidation(scanType: string, target: string): boolean {
  return scanType === 'vuln' && isPassiveVulnEvidence(target);
}

/**
 * Classify whether a scan request is allowed under the current policy.
 *
 * This does NOT perform SSRF validation or rate limiting — those remain in
 * the route handler. It only decides passive/active routing.
 *
 * @param scanType - The requested scan type string.
 * @param isTargetAllowlisted - Whether the target passes the allowlist check.
 * @param scannerBackendConfigured - Whether SCANNER_URL + SCANNER_KEY are set.
 */
export function classifyScanRequest(
  scanType: string,
  isTargetAllowlisted: boolean,
  scannerBackendConfigured: boolean,
): ScanPolicyResult {
  // 1. Unknown scan type → fail closed
  if (!KNOWN_SCAN_TYPES.has(scanType)) {
    return {
      allowed: false,
      mode: 'unknown',
      code: 'SCAN_TYPE_UNKNOWN',
      denial_reason: `"${scanType}" is not a recognized scan type.`,
      denial_status: 400,
      available_scans: [...KNOWN_SCAN_TYPES],
    };
  }

  const definition = SCAN_DEFINITIONS[scanType as ScanType];

  // 2. Passive scan types → always allowed (SSRF check is separate)
  if (definition.mode === 'passive') {
    return {
      allowed: true,
      mode: 'passive',
    };
  }

  // 3. Active scan type → requires both allowlisted target AND scanner backend
  if (!isTargetAllowlisted) {
    return {
      allowed: false,
      mode: 'active',
      code: 'ACTIVE_SCAN_REQUIRES_VERIFICATION',
      denial_reason:
        `"${scanType}" is an active scan that connects to the target. ` +
        'Active scans require target ownership verification or admin allowlisting. ' +
        'Use passive lookups (rDNS, WHOIS, subdomains, geolocation, CVE) for unverified targets.',
      denial_status: 403,
    };
  }

  if (!scannerBackendConfigured) {
    return {
      allowed: false,
      mode: 'active',
      code: 'SCANNER_BACKEND_NOT_CONFIGURED',
      denial_reason:
        `Active scan "${scanType}" requires the scanner backend service. ` +
        'Configure the scanner URL and API key environment variables to enable active scanning.',
      denial_status: 503,
    };
  }

  return {
    allowed: true,
    mode: 'active',
  };
}
