import { createHmac } from 'node:crypto';
import { resolveTxt } from 'node:dns/promises';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const DEFAULT_TARGETS_DIR = '.data/scanner-targets';
const SUBJECT_ID_RE = /^[a-zA-Z0-9._-]{1,80}$/;

export interface DnsTxtChallenge {
  target: string;
  subject_id: string;
  record_name: string;
  record_type: 'TXT';
  record_value: string;
  instructions: string;
}

export function normalizeTargetKey(target: string): string {
  return target.trim().toLowerCase().replace(/^\[/, '').replace(/\]$/, '').replace(/\.$/, '');
}

function getTargetsDir(): string {
  return process.env.SCANNER_TARGETS_DIR?.trim() || DEFAULT_TARGETS_DIR;
}

function verificationSecret(): string {
  return process.env.SCANNER_VERIFICATION_SECRET
    || process.env.AUTH_SECRET
    || 'aegisgrid-development-scanner-verification-secret';
}

function validateSubjectId(subjectId: string): string {
  const trimmed = subjectId.trim();
  let decoded = trimmed;
  try {
    decoded = decodeURIComponent(trimmed);
  } catch {
    decoded = trimmed;
  }

  if (!SUBJECT_ID_RE.test(trimmed) || decoded.includes('..') || decoded.includes('/') || decoded.includes('\\')) {
    throw new Error('Invalid scanner subject id');
  }

  return trimmed;
}

function subjectPath(subjectId: string): string {
  const safeId = validateSubjectId(subjectId);
  return join(getTargetsDir(), `${safeId}.json`);
}

function parseEnvVerifiedTargets(subjectId: string): string[] {
  const safeId = validateSubjectId(subjectId);
  const raw = process.env.SCANNER_VERIFIED_TARGETS?.trim();
  if (!raw) return [];

  const targets = new Set<string>();
  for (const entry of raw.split(',')) {
    const separator = entry.indexOf(':');
    if (separator <= 0) continue;
    const entrySubject = entry.slice(0, separator).trim();
    const target = normalizeTargetKey(entry.slice(separator + 1));
    if (entrySubject === safeId && target) targets.add(target);
  }
  return [...targets].sort();
}

function uniqueNormalizedTargets(targets: string[]): string[] {
  return [...new Set(targets.map(normalizeTargetKey).filter(Boolean))].sort();
}

async function loadFileTargets(subjectId: string): Promise<string[]> {
  const path = subjectPath(subjectId);
  try {
    const raw = await readFile(/* turbopackIgnore: true */ path, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return uniqueNormalizedTargets(parsed.filter((value): value is string => typeof value === 'string'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

async function writeFileTargets(subjectId: string, targets: string[]): Promise<void> {
  const path = subjectPath(subjectId);
  await mkdir(/* turbopackIgnore: true */ dirname(path), { recursive: true });
  const normalized = uniqueNormalizedTargets(targets);
  const tmpPath = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(/* turbopackIgnore: true */ tmpPath, JSON.stringify(normalized, null, 2), { encoding: 'utf8', mode: 0o600 });
  await rename(/* turbopackIgnore: true */ tmpPath, path);
}

export function generateDnsTxtChallenge(target: string, subjectId: string): DnsTxtChallenge {
  const normalizedTarget = normalizeTargetKey(target);
  const safeId = validateSubjectId(subjectId);
  const digest = createHmac('sha256', verificationSecret())
    .update(`${safeId}\n${normalizedTarget}`)
    .digest('hex');
  const recordValue = `aegisgrid-verify=${digest}`;

  return {
    target: normalizedTarget,
    subject_id: safeId,
    record_name: `_aegisgrid-verify.${normalizedTarget}`,
    record_type: 'TXT',
    record_value: recordValue,
    instructions:
      `Create a TXT record named _aegisgrid-verify.${normalizedTarget} with value ${recordValue}. ` +
      'Then ask AegisGrid to verify the target before running active scans.',
  };
}

export type TxtResolver = (recordName: string) => Promise<string[][]>;

export async function verifyDnsTxtChallenge(
  target: string,
  subjectId: string,
  resolver: TxtResolver = resolveTxt,
): Promise<boolean> {
  const challenge = generateDnsTxtChallenge(target, subjectId);
  try {
    const records = await resolver(challenge.record_name);
    return records.flat().some(value => value.trim() === challenge.record_value);
  } catch {
    return false;
  }
}

export async function loadVerifiedTargets(subjectId: string): Promise<string[]> {
  const fileTargets = await loadFileTargets(subjectId);
  const envTargets = parseEnvVerifiedTargets(subjectId);
  return uniqueNormalizedTargets([...fileTargets, ...envTargets]);
}

export async function saveVerifiedTarget(subjectId: string, target: string): Promise<void> {
  const normalized = normalizeTargetKey(target);
  if (!normalized) throw new Error('Invalid scanner target');
  const current = await loadFileTargets(subjectId);
  await writeFileTargets(subjectId, [...current, normalized]);
}

export async function removeVerifiedTarget(subjectId: string, target: string): Promise<void> {
  const normalized = normalizeTargetKey(target);
  if (!normalized) return;
  const current = await loadFileTargets(subjectId);
  await writeFileTargets(subjectId, current.filter(entry => entry !== normalized));
}

export async function isSubjectVerifiedTarget(subjectId: string, target: string): Promise<boolean> {
  const normalized = normalizeTargetKey(target);
  if (!normalized) return false;
  const targets = await loadVerifiedTargets(subjectId);
  return targets.includes(normalized);
}
