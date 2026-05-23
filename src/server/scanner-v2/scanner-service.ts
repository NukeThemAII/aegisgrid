/**
 * Scanner V2 — local-service skeleton.
 *
 * This module implements the core policy engine for the AegisGrid scanner
 * service. It enforces:
 *   - shared-key authentication (before any target validation)
 *   - SSRF / reserved-range blocking via a pluggable `validateTarget` callback
 *   - passive modules open to any public target after SSRF validation
 *   - active modules gated behind allowlist / ownership verification
 *   - fail-closed semantics for unknown scan types, and for active modules
 *     that have no adapter wired yet
 *   - normalized empty results for passive modules without adapters
 *
 * No real port scanning or active network probing is performed here.
 * Adapters are injected via the factory so they can be wired up incrementally.
 */

import { isAllowedTarget } from '../../lib/scanner-scope';
import { validateHost } from '../../lib/ssrf-guard';

// ────────────────────────────────────────────────────────────────────────────
// Scan definitions
// ────────────────────────────────────────────────────────────────────────────

export type ScanMode = 'passive' | 'active';

export interface ScanDefinition {
  mode: ScanMode;
  label: string;
}

/**
 * Authoritative registry of supported scan types.
 *
 * - **passive**: uses only third-party public databases / DNS; no network
 *   probing against the target. Open to any public target after SSRF check.
 * - **active**: connects to the target host (TLS handshake, HTTP request,
 *   port probe). Requires allowlist / ownership verification.
 */
export const SCAN_DEFINITIONS = {
  rdns:       { mode: 'passive', label: 'Reverse DNS' },
  whois:      { mode: 'passive', label: 'WHOIS / RDAP' },
  subdomains: { mode: 'passive', label: 'Subdomain Enumeration' },
  geoloc:     { mode: 'passive', label: 'IP Geolocation' },
  vuln:       { mode: 'passive', label: 'Passive Vulnerability Correlation' },

  quick:   { mode: 'active', label: 'Quick Port Scan' },
  ssl:     { mode: 'active', label: 'SSL / TLS Inspection' },
  headers: { mode: 'active', label: 'HTTP Security Headers' },
  tech:    { mode: 'active', label: 'Technology Detection' },
} as const satisfies Record<string, ScanDefinition>;

export type ScanType = keyof typeof SCAN_DEFINITIONS;

const KNOWN_SCAN_TYPES = new Set<string>(Object.keys(SCAN_DEFINITIONS));

// ────────────────────────────────────────────────────────────────────────────
// Path parser
// ────────────────────────────────────────────────────────────────────────────

/**
 * Extract a known scan type from a `/scan/:type` path segment.
 * Returns `null` for paths that don't match or reference unknown types.
 */
export function scanTypeFromPath(path: string): ScanType | null {
  const match = /^\/scan\/([a-z]+)$/.exec(path);
  if (!match) return null;
  const candidate = match[1];
  if (KNOWN_SCAN_TYPES.has(candidate)) return candidate as ScanType;
  return null;
}

function isPassiveVulnEvidenceTarget(scanType: ScanType, target: string): boolean {
  if (scanType !== 'vuln') return false;
  return /^CVE-\d{4}-\d{4,}$/i.test(target) || /^cpe:/i.test(target);
}

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export interface ScannerValidationResult {
  ok: boolean;
  resolved?: string[];
  reason?: string;
}

export interface ScanRequest {
  type: string;
  target: string;
  key: string;
}

export interface ScanResponse {
  status: number;
  body: Record<string, unknown>;
}

/**
 * An adapter is an async function that performs the actual scan work for a
 * given module and returns an arbitrary data payload.
 */
export type ScanAdapter = (target: string) => Promise<Record<string, unknown>>;

export interface ScannerServiceConfig {
  /** Shared secret that the Next.js proxy must present. */
  serviceKey: string;
  /** Pre-parsed allowlist (output of `parseAllowlist`). */
  allowlist?: readonly string[];
  /** Whether active scans require target verification / allowlist match. */
  requireVerification?: boolean;
  /** Pluggable target validator — defaults to ssrf-guard's validateHost. */
  validateTarget?: (target: string) => Promise<ScannerValidationResult>;
  /** Optional clock override for deterministic tests. */
  now?: () => Date;
  /** Adapter map — keys are scan types, values perform the actual work. */
  adapters?: Partial<Record<ScanType, ScanAdapter>>;
}

export interface ScannerService {
  scan(req: ScanRequest): Promise<ScanResponse>;
  handleUrl(url: string | URL): Promise<ScanResponse>;
}

// ────────────────────────────────────────────────────────────────────────────
// Factory
// ────────────────────────────────────────────────────────────────────────────

export function createScannerService(config: ScannerServiceConfig): ScannerService {
  const {
    serviceKey,
    allowlist = [],
    requireVerification = true,
    validateTarget = validateHost,
    now = () => new Date(),
    adapters = {},
  } = config;

  async function scan(req: ScanRequest): Promise<ScanResponse> {
    // ── 1. Local service must be configured before accepting requests ─────
    if (!serviceKey) {
      return {
        status: 503,
        body: { ok: false, error: 'scanner service not configured' },
      };
    }

    // ── 2. Shared key check (before target validation or dispatch) ───────
    if (!req.key || req.key !== serviceKey) {
      return {
        status: 401,
        body: { ok: false, error: 'invalid scanner key' },
      };
    }

    // ── 3. Validate scan type (fail closed for unknowns) ────────────────
    if (!KNOWN_SCAN_TYPES.has(req.type)) {
      return {
        status: 404,
        body: {
          ok: false,
          error: 'scan type not available',
          available_scans: Object.keys(SCAN_DEFINITIONS),
        },
      };
    }

    const target = req.target.trim();
    if (!target) {
      return {
        status: 400,
        body: { ok: false, error: 'missing target' },
      };
    }

    const scanType = req.type as ScanType;
    const definition = SCAN_DEFINITIONS[scanType];

    // ── 4. SSRF / target validation ─────────────────────────────────────
    if (!isPassiveVulnEvidenceTarget(scanType, target)) {
      const validation = await validateTarget(target);
      if (!validation.ok) {
        return {
          status: 403,
          body: { ok: false, error: 'target blocked', reason: validation.reason },
        };
      }
    }

    // ── 5. Active-module allowlist gate ──────────────────────────────────
    if (definition.mode === 'active') {
      const allowed = isAllowedTarget(target, allowlist, requireVerification);
      if (!allowed) {
        return {
          status: 403,
          body: { ok: false, error: 'target not verified', mode: definition.mode },
        };
      }
    }

    // ── 6. Adapter dispatch ─────────────────────────────────────────────
    const adapter = adapters[scanType];
    const fetchedAt = now().toISOString();

    if (!adapter) {
      // Passive without adapter → normalized empty result
      if (definition.mode === 'passive') {
        return {
          status: 200,
          body: {
            ok: true,
            scan_type: scanType,
            mode: definition.mode,
            status: 'source_unavailable',
            source: 'aegisgrid-scanner-v2',
            fetched_at: fetchedAt,
            data: {},
          },
        };
      }
      // Active without adapter → fail closed
      return {
        status: 501,
        body: {
          ok: false,
          error: 'scan module unavailable',
          scan_type: scanType,
          mode: definition.mode,
        },
      };
    }

    // ── 6. Run the adapter and return normalized result ──────────────────
    let data: Record<string, unknown>;
    try {
      data = await adapter(target);
    } catch (error) {
      return {
        status: 502,
        body: {
          ok: false,
          error: 'scan module failed',
          scan_type: scanType,
          mode: definition.mode,
          detail: error instanceof Error ? error.message : 'unknown scanner module error',
        },
      };
    }

    return {
      status: 200,
      body: {
        ok: true,
        scan_type: scanType,
        mode: definition.mode,
        status: 'ok',
        source: 'aegisgrid-scanner-v2',
        fetched_at: fetchedAt,
        data,
      },
    };
  }

  async function handleUrl(url: string | URL): Promise<ScanResponse> {
    let parsed: URL;
    try {
      parsed = typeof url === 'string' ? new URL(url) : url;
    } catch {
      return {
        status: 400,
        body: { ok: false, error: 'invalid scanner url' },
      };
    }

    const type = scanTypeFromPath(parsed.pathname);
    if (!type) {
      return {
        status: 404,
        body: {
          ok: false,
          error: 'scan type not available',
          available_scans: Object.keys(SCAN_DEFINITIONS),
        },
      };
    }

    return scan({
      type,
      target: parsed.searchParams.get('target') ?? '',
      key: parsed.searchParams.get('key') ?? '',
    });
  }

  return { scan, handleUrl };
}
