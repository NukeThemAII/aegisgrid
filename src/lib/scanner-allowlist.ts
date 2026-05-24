import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import {
  isAllowedTarget,
  normalizeAllowlistEntry,
  parseAllowlist,
} from './scanner-scope';

const DEFAULT_ALLOWLIST_PATH = '.data/scanner-admin-allowlist.json';
const MAX_NOTE_LENGTH = 240;

export type ScannerAllowlistSource = 'env' | 'file';

export interface ScannerAllowlistEntry {
  target: string;
  source: ScannerAllowlistSource;
  added_at?: string;
  added_by?: string;
  note?: string;
}

function allowlistPath(): string {
  return process.env.SCANNER_ADMIN_ALLOWLIST_PATH?.trim() || DEFAULT_ALLOWLIST_PATH;
}

function normalizeTargetOrThrow(target: string): string {
  const normalized = normalizeAllowlistEntry(target);
  if (!normalized) throw new Error('Invalid allowlist target');
  return normalized;
}

function sanitizeNote(note: string | undefined): string | undefined {
  const clean = note?.replace(/[\x00-\x1f\x7f]/g, '').trim();
  if (!clean) return undefined;
  return clean.slice(0, MAX_NOTE_LENGTH);
}

function sanitizeAddedBy(subjectId: string | undefined): string | undefined {
  const clean = subjectId?.replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 80);
  return clean || undefined;
}

function normalizeFileEntry(entry: unknown): ScannerAllowlistEntry | null {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
  const record = entry as Record<string, unknown>;
  if (typeof record.target !== 'string') return null;
  try {
    const target = normalizeTargetOrThrow(record.target);
    return {
      target,
      source: 'file',
      ...(typeof record.added_at === 'string' ? { added_at: record.added_at } : {}),
      ...(typeof record.added_by === 'string' ? { added_by: sanitizeAddedBy(record.added_by) } : {}),
      ...(typeof record.note === 'string' ? { note: sanitizeNote(record.note) } : {}),
    };
  } catch {
    return null;
  }
}

async function readFileEntries(): Promise<ScannerAllowlistEntry[]> {
  const path = allowlistPath();
  try {
    const raw = await readFile(/* turbopackIgnore: true */ path, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const byTarget = new Map<string, ScannerAllowlistEntry>();
    for (const item of parsed) {
      const entry = normalizeFileEntry(item);
      if (entry) byTarget.set(entry.target, entry);
    }
    return [...byTarget.values()].sort((a, b) => a.target.localeCompare(b.target));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

async function writeFileEntries(entries: ScannerAllowlistEntry[]): Promise<void> {
  const path = allowlistPath();
  const normalized = new Map<string, ScannerAllowlistEntry>();
  for (const entry of entries) {
    const normalizedEntry = normalizeFileEntry(entry);
    if (normalizedEntry) normalized.set(normalizedEntry.target, normalizedEntry);
  }

  const out = [...normalized.values()].sort((a, b) => a.target.localeCompare(b.target));
  await mkdir(/* turbopackIgnore: true */ dirname(path), { recursive: true });
  const tmpPath = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(/* turbopackIgnore: true */ tmpPath, JSON.stringify(out, null, 2), { encoding: 'utf8', mode: 0o600 });
  await rename(/* turbopackIgnore: true */ tmpPath, path);
}

function envEntries(): ScannerAllowlistEntry[] {
  return parseAllowlist(process.env.SCANNER_ALLOWED_TARGETS || '').map((target) => ({
    target,
    source: 'env' as const,
  }));
}

export async function listAdminAllowlistEntries(): Promise<ScannerAllowlistEntry[]> {
  const byTarget = new Map<string, ScannerAllowlistEntry>();
  for (const entry of envEntries()) byTarget.set(entry.target, entry);
  for (const entry of await readFileEntries()) {
    if (!byTarget.has(entry.target)) byTarget.set(entry.target, entry);
  }
  return [...byTarget.values()].sort((a, b) => a.target.localeCompare(b.target));
}

export async function addAdminAllowlistEntry(
  target: string,
  addedBy: string | undefined,
  note?: string,
): Promise<ScannerAllowlistEntry> {
  const normalizedTarget = normalizeTargetOrThrow(target);
  const entries = await readFileEntries();
  const existing = entries.find(entry => entry.target === normalizedTarget);
  const next: ScannerAllowlistEntry = {
    target: normalizedTarget,
    source: 'file',
    added_at: existing?.added_at ?? new Date().toISOString(),
    ...(sanitizeAddedBy(addedBy) ? { added_by: sanitizeAddedBy(addedBy) } : {}),
    ...(sanitizeNote(note) ? { note: sanitizeNote(note) } : {}),
  };
  await writeFileEntries([...entries.filter(entry => entry.target !== normalizedTarget), next]);
  return next;
}

export async function removeAdminAllowlistEntry(target: string): Promise<boolean> {
  const normalizedTarget = normalizeTargetOrThrow(target);
  const entries = await readFileEntries();
  const next = entries.filter(entry => entry.target !== normalizedTarget);
  await writeFileEntries(next);
  return next.length !== entries.length;
}

export async function isAdminAllowlistedTarget(target: string): Promise<boolean> {
  const entries = await listAdminAllowlistEntries();
  return isAllowedTarget(target, entries.map(entry => entry.target), true);
}
