import { NextResponse } from 'next/server';
import { validateHost, isRateLimited, getClientIp } from '@/lib/ssrf-guard';
import {
  isAuthenticatedScannerSubject,
  parseScannerSubject,
} from '@/lib/scanner-auth';
import { isAdminAllowlistedTarget } from '@/lib/scanner-allowlist';
import { isSubjectVerifiedTarget } from '@/lib/scanner-targets';
import {
  canBypassHostValidation,
  classifyScanRequest,
  SCAN_DEFINITIONS,
  type ScanType,
} from '@/lib/scanner-policy';
import { createPassiveAdapters } from '@/server/scanner-v2/passive-adapters';
import {
  recordScanAudit,
  classifyTarget,
  sanitizeTargetForLog,
} from '@/lib/scanner-audit';

/**
 * AEGISGRID — Scanner Route (V2 Passive Integration)
 *
 * Dual-path routing:
 *   1. Passive scan types (rdns, whois, subdomains, geoloc, vuln) run
 *      in-process using Scanner V2 adapters — no external backend needed.
 *   2. Active scan types (quick, ssl, headers, tech) require an authenticated
 *      scanner subject, target entitlement (DNS TXT verified subject target
 *      or admin allowlist), and an external scanner backend
 *      (SCANNER_URL + SCANNER_KEY). They fail closed otherwise.
 *
 * Rate-limited, target-validated, scope-restricted, audit-logged.
 */

// ── Configuration (read once at module load) ─────────────────────────────

const SCANNER_URL = process.env.SCANNER_URL || '';
const SCANNER_KEY = process.env.SCANNER_KEY || '';

const scannerBackendConfigured = Boolean(SCANNER_URL && SCANNER_KEY);

type TargetEntitlement = 'none' | 'admin_allowlist' | 'subject_verified';

function targetEntitlement(adminAllowlisted: boolean, subjectVerified: boolean): TargetEntitlement {
  if (adminAllowlisted) return 'admin_allowlist';
  if (subjectVerified) return 'subject_verified';
  return 'none';
}

// ── Passive adapters singleton ───────────────────────────────────────────

const passiveAdapters = createPassiveAdapters();

// ── Active scan proxy timeouts ───────────────────────────────────────────

const ACTIVE_TIMEOUTS: Partial<Record<ScanType, number>> = {
  quick:   15_000,
  ssl:     10_000,
  headers: 10_000,
  tech:    15_000,
};

// ── Route handler ────────────────────────────────────────────────────────

export async function GET(req: Request) {
  const startTime = Date.now();
  const { searchParams } = new URL(req.url);
  const target = searchParams.get('target')?.trim() ?? '';
  const scanType = searchParams.get('type') || 'quick';

  // 1. Rate limit by client IP
  const clientIp = getClientIp(req);
  const subject = parseScannerSubject(req, clientIp);
  const subjectAudit = {
    subject_role: subject.role,
    ...(subject.subjectId ? { subject_id: subject.subjectId } : {}),
  };

  if (isRateLimited(clientIp, 5, 60_000)) {
    await recordScanAudit({
      scan_type: scanType,
      target_classification: classifyTarget(target),
      sanitized_target: sanitizeTargetForLog(target),
      mode: 'unknown',
      decision: 'denied',
      denial_reason: 'RATE_LIMITED',
      result_status: 429,
      duration_ms: Date.now() - startTime,
      client_ip: clientIp,
      ...subjectAudit,
    });

    return NextResponse.json({
      error: 'Rate limit exceeded',
      code: 'RATE_LIMITED',
      detail: 'Maximum 5 scans per minute. Please wait before scanning again.',
    }, { status: 429 });
  }

  // 2. Validate params
  if (!target) {
    await recordScanAudit({
      scan_type: scanType,
      target_classification: 'unknown',
      sanitized_target: '',
      mode: 'unknown',
      decision: 'denied',
      denial_reason: 'MISSING_TARGET',
      result_status: 400,
      duration_ms: Date.now() - startTime,
      client_ip: clientIp,
      ...subjectAudit,
    });

    return NextResponse.json({
      error: 'Missing target parameter',
      code: 'MISSING_TARGET',
    }, { status: 400 });
  }

  // 3. Classify the scan request (passive/active/unknown)
  const adminAllowlisted = await isAdminAllowlistedTarget(target);
  const subjectVerified = subject.subjectId
    ? await isSubjectVerifiedTarget(subject.subjectId, target)
    : false;
  const activeTargetEntitlement = targetEntitlement(adminAllowlisted, subjectVerified);
  const policyAudit = {
    ...subjectAudit,
    target_entitlement: activeTargetEntitlement,
  };
  const policy = classifyScanRequest(
    scanType,
    activeTargetEntitlement !== 'none',
    scannerBackendConfigured,
    isAuthenticatedScannerSubject(subject),
  );

  // 4. If denied by policy, return early with normalized error
  if (!policy.allowed) {
    await recordScanAudit({
      scan_type: scanType,
      target_classification: classifyTarget(target),
      sanitized_target: sanitizeTargetForLog(target),
      mode: policy.mode,
      decision: 'denied',
      denial_reason: policy.code,
      result_status: policy.denial_status ?? 403,
      duration_ms: Date.now() - startTime,
      client_ip: clientIp,
      ...policyAudit,
    });

    return NextResponse.json({
      error: policy.denial_reason,
      code: policy.code,
      ...(policy.available_scans ? { available_scans: policy.available_scans } : {}),
    }, { status: policy.denial_status ?? 403 });
  }

  // 5. SSRF / target validation — skip only for vuln CVE/CPE evidence strings
  if (!canBypassHostValidation(scanType, target)) {
    const guard = await validateHost(target);
    if (!guard.ok) {
      await recordScanAudit({
        scan_type: scanType,
        target_classification: classifyTarget(target),
        sanitized_target: sanitizeTargetForLog(target),
        mode: policy.mode,
        decision: 'denied',
        denial_reason: 'SSRF_BLOCKED',
        result_status: 403,
        duration_ms: Date.now() - startTime,
        client_ip: clientIp,
        ...policyAudit,
      });

      return NextResponse.json({
        error: 'Target blocked',
        code: 'TARGET_BLOCKED',
        detail: `Target validation failed: ${guard.reason}`,
      }, { status: 403 });
    }
  }

  // ── PATH A: Passive scan — run Scanner V2 adapter in-process ──────────

  if (policy.mode === 'passive') {
    const adapter = passiveAdapters[scanType as ScanType];
    const definition = SCAN_DEFINITIONS[scanType as ScanType];

    if (!adapter) {
      // Passive module exists in definitions but has no adapter wired yet
      await recordScanAudit({
        scan_type: scanType,
        target_classification: classifyTarget(target),
        sanitized_target: sanitizeTargetForLog(target),
        mode: 'passive',
        decision: 'allowed',
        result_status: 200,
        duration_ms: Date.now() - startTime,
        client_ip: clientIp,
        ...policyAudit,
      });

      return NextResponse.json({
        ok: true,
        scan_type: scanType,
        mode: 'passive',
        status: 'source_unavailable',
        source: 'aegisgrid-scanner-v2',
        fetched_at: new Date().toISOString(),
        data: {},
      });
    }

    try {
      const data = await adapter(target);

      await recordScanAudit({
        scan_type: scanType,
        target_classification: classifyTarget(target),
        sanitized_target: sanitizeTargetForLog(target),
        mode: 'passive',
        decision: 'allowed',
        result_status: 200,
        duration_ms: Date.now() - startTime,
        client_ip: clientIp,
        ...policyAudit,
      });

      return NextResponse.json({
        ok: true,
        scan_type: scanType,
        mode: 'passive',
        label: definition.label,
        status: 'ok',
        source: 'aegisgrid-scanner-v2',
        fetched_at: new Date().toISOString(),
        data,
      });
    } catch {
      await recordScanAudit({
        scan_type: scanType,
        target_classification: classifyTarget(target),
        sanitized_target: sanitizeTargetForLog(target),
        mode: 'passive',
        decision: 'allowed',
        result_status: 502,
        duration_ms: Date.now() - startTime,
        client_ip: clientIp,
        ...policyAudit,
      });

      return NextResponse.json({
        ok: false,
        error: 'Scan module failed',
        code: 'ADAPTER_ERROR',
        scan_type: scanType,
        mode: 'passive',
        detail: 'Passive scanner module failed.',
      }, { status: 502 });
    }
  }

  // ── PATH B: Active scan — proxy to external scanner backend ───────────
  // Policy already verified: authenticated subject, target entitlement, and backend configured.

  const timeout = ACTIVE_TIMEOUTS[scanType as ScanType] ?? 15_000;

  try {
    const params = new URLSearchParams({ key: SCANNER_KEY, target });
    const endpoint = `/scan/${scanType}`;
    const res = await fetch(`${SCANNER_URL}${endpoint}?${params.toString()}`, {
      signal: AbortSignal.timeout(timeout),
      redirect: 'manual',
    });
    const data = await res.json();

    await recordScanAudit({
      scan_type: scanType,
      target_classification: classifyTarget(target),
      sanitized_target: sanitizeTargetForLog(target),
      mode: 'active',
      decision: 'allowed',
      result_status: res.status,
      duration_ms: Date.now() - startTime,
      client_ip: clientIp,
      ...policyAudit,
    });

    return NextResponse.json(data, { status: res.status });
  } catch {
    await recordScanAudit({
      scan_type: scanType,
      target_classification: classifyTarget(target),
      sanitized_target: sanitizeTargetForLog(target),
      mode: 'active',
      decision: 'allowed',
      result_status: 502,
      duration_ms: Date.now() - startTime,
      client_ip: clientIp,
      ...policyAudit,
    });

    return NextResponse.json({
      error: 'Scanner unreachable',
      code: 'SCANNER_UNREACHABLE',
      detail: 'Active scanner backend request failed.',
    }, { status: 502 });
  }
}
