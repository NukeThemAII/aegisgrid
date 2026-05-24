import { readFile } from 'node:fs/promises';
import { getScannerAuditConfig } from './scanner-audit';

export interface AuditQueryOptions {
  logPath?: string;
  limit?: number;
}

export interface AuditJsonResponse {
  ok: true;
  count: number;
  entries: Record<string, unknown>[];
}

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 1000;
const SENSITIVE_KEY_RE = /(api_?key|secret|token|auth|authorization|password|credential)/i;

function clampLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit)) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, Math.floor(limit ?? DEFAULT_LIMIT)));
}

function sanitizeAuditEntry(entry: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(entry)) {
    if (SENSITIVE_KEY_RE.test(key)) continue;
    sanitized[key] = value;
  }
  return sanitized;
}

export async function readAuditEntries(options: AuditQueryOptions = {}): Promise<Record<string, unknown>[]> {
  const logPath = options.logPath ?? getScannerAuditConfig().log_path;
  const limit = clampLimit(options.limit);
  if (!logPath) return [];

  let raw: string;
  try {
    raw = await readFile(logPath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }

  const entries: Record<string, unknown>[] = [];
  const lines = raw.split('\n').filter(line => line.trim()).reverse();
  for (const line of lines) {
    if (entries.length >= limit) break;
    try {
      const parsed: unknown = JSON.parse(line);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        entries.push(sanitizeAuditEntry(parsed as Record<string, unknown>));
      }
    } catch {
      // Skip malformed historical lines rather than failing export.
    }
  }

  return entries;
}

export function formatAuditResponse(
  entries: Record<string, unknown>[],
  format: 'json' | 'jsonl' = 'json',
): AuditJsonResponse | string {
  if (format === 'jsonl') {
    return entries.map(entry => JSON.stringify(entry)).join('\n');
  }

  return {
    ok: true,
    count: entries.length,
    entries,
  };
}
