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
