export interface ScannerV2Meta {
  ok?: boolean;
  scan_type?: string;
  mode?: string;
  label?: string;
  status?: string;
  source?: string;
  fetched_at?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' ? value : undefined;
}

function booleanField(record: Record<string, unknown>, key: string): boolean | undefined {
  const value = record[key];
  return typeof value === 'boolean' ? value : undefined;
}

export function getScannerV2Meta(result: unknown): ScannerV2Meta | null {
  if (!isRecord(result) || !isRecord(result.data)) return null;
  if (stringField(result, 'source') !== 'aegisgrid-scanner-v2') return null;

  return {
    ok: booleanField(result, 'ok'),
    scan_type: stringField(result, 'scan_type'),
    mode: stringField(result, 'mode'),
    label: stringField(result, 'label'),
    status: stringField(result, 'status'),
    source: stringField(result, 'source'),
    fetched_at: stringField(result, 'fetched_at'),
  };
}

export function getScannerV2Payload<T = Record<string, unknown>>(result: T): T | Record<string, unknown> {
  if (!isRecord(result) || !isRecord(result.data)) return result;
  if (stringField(result, 'source') !== 'aegisgrid-scanner-v2') return result;
  return result.data;
}

export function getStringArrayField(record: unknown, key: string): string[] {
  if (!isRecord(record)) return [];
  const value = record[key];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

// ── Allowed fields for scanner responses ────────────────────────────────

/** Fields the scanner API is allowed to return to clients. */
const ALLOWED_SCANNER_TOP_KEYS = new Set([
  'ok', 'scan_type', 'mode', 'label', 'status', 'source',
  'fetched_at', 'data', 'error', 'code', 'detail',
]);

/** Max allowed depth for nested objects in scanner responses. */
const MAX_SCANNER_RESPONSE_DEPTH = 5;

/**
 * Recursively strip unknown keys from a scanner response object.
 * Only allows whitelisted top-level keys and recursively strips
 * unknown keys from nested objects up to MAX_SCANNER_RESPONSE_DEPTH.
 */
function stripUnknownKeys(obj: unknown, depth: number = 0): unknown {
  if (depth > MAX_SCANNER_RESPONSE_DEPTH) return undefined;
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj.map(item => stripUnknownKeys(item, depth + 1));
  }

  const record = obj as Record<string, unknown>;
  const result: Record<string, unknown> = {};

  for (const key of Object.keys(record)) {
    const allowedAtTop = depth > 0 || ALLOWED_SCANNER_TOP_KEYS.has(key);
    if (!allowedAtTop) continue;
    result[key] = stripUnknownKeys(record[key], depth + 1);
  }

  return result;
}

/**
 * Sanitize a scanner response — strips unknown fields and enforces
 * a maximum nesting depth. Use this for responses from external
 * scanner backends before returning to the client.
 */
export function sanitizeScannerResponse(data: unknown): unknown {
  return stripUnknownKeys(data);
}
