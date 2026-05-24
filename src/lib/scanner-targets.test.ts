import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  normalizeTargetKey,
  generateDnsTxtChallenge,
  loadVerifiedTargets,
  saveVerifiedTarget,
  removeVerifiedTarget,
  isSubjectVerifiedTarget,
  verifyDnsTxtChallenge,
} from './scanner-targets';

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.SCANNER_TARGETS_DIR;
  delete process.env.SCANNER_VERIFIED_TARGETS;
});

// ── normalizeTargetKey ──────────────────────────────────────────────

describe('normalizeTargetKey', () => {
  it('lowercases, trims, and strips trailing dot', () => {
    expect(normalizeTargetKey('  Example.COM.  ')).toBe('example.com');
  });

  it('passes through bare IPv4 addresses', () => {
    expect(normalizeTargetKey('8.8.8.8')).toBe('8.8.8.8');
  });

  it('strips surrounding brackets from IPv6', () => {
    expect(normalizeTargetKey('[::1]')).toBe('::1');
  });

  it('returns empty string for empty input', () => {
    expect(normalizeTargetKey('')).toBe('');
  });

  it('returns empty string for whitespace-only input', () => {
    expect(normalizeTargetKey('   ')).toBe('');
  });

  it('strips only one trailing dot', () => {
    expect(normalizeTargetKey('example.com..')).toBe('example.com.');
  });

  it('handles already-normalized values', () => {
    expect(normalizeTargetKey('example.com')).toBe('example.com');
  });
});

// ── generateDnsTxtChallenge ─────────────────────────────────────────

describe('generateDnsTxtChallenge', () => {
  it('returns a well-formed challenge object', () => {
    const challenge = generateDnsTxtChallenge('example.com', 'subject-1');

    expect(challenge.record_name).toBe('_aegisgrid-verify.example.com');
    expect(challenge.record_type).toBe('TXT');
    expect(challenge.record_value).toMatch(/^aegisgrid-verify=[a-f0-9]{64}$/);
    expect(typeof challenge.instructions).toBe('string');
    expect(challenge.instructions.length).toBeGreaterThan(0);
  });

  it('is deterministic: same inputs produce the same hash', () => {
    const a = generateDnsTxtChallenge('example.com', 'subject-1');
    const b = generateDnsTxtChallenge('example.com', 'subject-1');

    expect(a.record_value).toBe(b.record_value);
  });

  it('different subjects produce different challenges for the same domain', () => {
    const a = generateDnsTxtChallenge('example.com', 'subject-1');
    const b = generateDnsTxtChallenge('example.com', 'subject-2');

    expect(a.record_value).not.toBe(b.record_value);
  });

  it('different domains produce different challenges for the same subject', () => {
    const a = generateDnsTxtChallenge('example.com', 'subject-1');
    const b = generateDnsTxtChallenge('other.org', 'subject-1');

    expect(a.record_value).not.toBe(b.record_value);
    expect(a.record_name).not.toBe(b.record_name);
  });

  it('does NOT contain the subjectId literally in the challenge value', () => {
    const challenge = generateDnsTxtChallenge('example.com', 'my-secret-subject');

    expect(challenge.record_value).not.toContain('my-secret-subject');
  });

  it('does NOT perform any DNS queries (returns synchronously)', () => {
    // If it were async/doing DNS, this would need await.
    // The function is sync and returns immediately.
    const result = generateDnsTxtChallenge('nonexistent.invalid', 'subject-1');
    expect(result.record_name).toBe('_aegisgrid-verify.nonexistent.invalid');
  });
});

// ── loadVerifiedTargets / saveVerifiedTarget / removeVerifiedTarget ──

describe('verified targets file persistence', () => {
  let tmpDir: string;

  async function setup(): Promise<string> {
    tmpDir = await mkdtemp(join(tmpdir(), 'aegisgrid-targets-'));
    process.env.SCANNER_TARGETS_DIR = tmpDir;
    return tmpDir;
  }

  afterEach(async () => {
    if (tmpDir) {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('returns empty array for non-existent subject', async () => {
    await setup();
    const targets = await loadVerifiedTargets('nonexistent-subject');
    expect(targets).toEqual([]);
  });

  it('saves and loads targets correctly', async () => {
    await setup();
    await saveVerifiedTarget('subject-1', 'example.com');
    await saveVerifiedTarget('subject-1', 'test.org');

    const targets = await loadVerifiedTargets('subject-1');
    expect(targets).toContain('example.com');
    expect(targets).toContain('test.org');
    expect(targets).toHaveLength(2);
  });

  it('removes targets correctly', async () => {
    await setup();
    await saveVerifiedTarget('subject-1', 'example.com');
    await saveVerifiedTarget('subject-1', 'test.org');
    await removeVerifiedTarget('subject-1', 'example.com');

    const targets = await loadVerifiedTargets('subject-1');
    expect(targets).toEqual(['test.org']);
  });

  it('normalizes targets before saving', async () => {
    await setup();
    await saveVerifiedTarget('subject-1', '  Example.COM.  ');

    const targets = await loadVerifiedTargets('subject-1');
    expect(targets).toEqual(['example.com']);
  });

  it('normalizes targets when removing', async () => {
    await setup();
    await saveVerifiedTarget('subject-1', 'example.com');
    await removeVerifiedTarget('subject-1', '  Example.COM.  ');

    const targets = await loadVerifiedTargets('subject-1');
    expect(targets).toEqual([]);
  });

  it('does not create duplicate entries', async () => {
    await setup();
    await saveVerifiedTarget('subject-1', 'example.com');
    await saveVerifiedTarget('subject-1', 'example.com');
    await saveVerifiedTarget('subject-1', '  Example.COM.  ');

    const targets = await loadVerifiedTargets('subject-1');
    expect(targets).toEqual(['example.com']);
  });

  it('stores data in a JSON file with the subjectId as filename', async () => {
    const dir = await setup();
    await saveVerifiedTarget('my-subject', 'example.com');

    const raw = await readFile(join(dir, 'my-subject.json'), 'utf8');
    const parsed = JSON.parse(raw) as string[];
    expect(parsed).toEqual(['example.com']);
  });

  it('isolates targets between different subjects', async () => {
    await setup();
    await saveVerifiedTarget('subject-1', 'example.com');
    await saveVerifiedTarget('subject-2', 'test.org');

    expect(await loadVerifiedTargets('subject-1')).toEqual(['example.com']);
    expect(await loadVerifiedTargets('subject-2')).toEqual(['test.org']);
  });

  it('removing from non-existent subject is a no-op', async () => {
    await setup();
    // Should not throw
    await removeVerifiedTarget('nonexistent', 'example.com');
    const targets = await loadVerifiedTargets('nonexistent');
    expect(targets).toEqual([]);
  });

  // ── Path traversal rejection ──

  it('rejects subjectId containing forward slash', async () => {
    await setup();
    await expect(saveVerifiedTarget('foo/bar', 'example.com')).rejects.toThrow();
    await expect(loadVerifiedTargets('foo/bar')).rejects.toThrow();
    await expect(removeVerifiedTarget('foo/bar', 'example.com')).rejects.toThrow();
  });

  it('rejects subjectId containing backslash', async () => {
    await setup();
    await expect(saveVerifiedTarget('foo\\bar', 'example.com')).rejects.toThrow();
  });

  it('rejects subjectId containing ..', async () => {
    await setup();
    await expect(saveVerifiedTarget('../etc', 'example.com')).rejects.toThrow();
    await expect(loadVerifiedTargets('../etc')).rejects.toThrow();
  });

  it('rejects subjectId with URL-encoded path traversal', async () => {
    await setup();
    await expect(saveVerifiedTarget('..%2Fetc', 'example.com')).rejects.toThrow();
    await expect(saveVerifiedTarget('..%2fetc', 'example.com')).rejects.toThrow();
    await expect(saveVerifiedTarget('foo%5Cbar', 'example.com')).rejects.toThrow();
  });
});

// ── verifyDnsTxtChallenge ─────────────────────────────────────────

describe('verifyDnsTxtChallenge', () => {
  it('returns true when DNS TXT records contain the expected challenge value', async () => {
    const challenge = generateDnsTxtChallenge('example.com', 'subject-1');
    const verified = await verifyDnsTxtChallenge(
      'example.com',
      'subject-1',
      async () => [['unrelated'], [challenge.record_value]],
    );

    expect(verified).toBe(true);
  });

  it('returns false when DNS TXT records do not contain the expected challenge value', async () => {
    const verified = await verifyDnsTxtChallenge(
      'example.com',
      'subject-1',
      async () => [['wrong-value']],
    );

    expect(verified).toBe(false);
  });

  it('returns false on DNS resolver errors', async () => {
    const verified = await verifyDnsTxtChallenge(
      'example.com',
      'subject-1',
      async () => { throw new Error('NXDOMAIN'); },
    );

    expect(verified).toBe(false);
  });
});

// ── isSubjectVerifiedTarget ─────────────────────────────────────────

describe('isSubjectVerifiedTarget', () => {
  let tmpDir: string;

  async function setup(): Promise<void> {
    tmpDir = await mkdtemp(join(tmpdir(), 'aegisgrid-targets-'));
    process.env.SCANNER_TARGETS_DIR = tmpDir;
  }

  afterEach(async () => {
    if (tmpDir) {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('returns false for non-existent subject', async () => {
    await setup();
    expect(await isSubjectVerifiedTarget('nobody', 'example.com')).toBe(false);
  });

  it('returns true after saving target', async () => {
    await setup();
    await saveVerifiedTarget('subject-1', 'example.com');
    expect(await isSubjectVerifiedTarget('subject-1', 'example.com')).toBe(true);
  });

  it('returns false after removing target', async () => {
    await setup();
    await saveVerifiedTarget('subject-1', 'example.com');
    await removeVerifiedTarget('subject-1', 'example.com');
    expect(await isSubjectVerifiedTarget('subject-1', 'example.com')).toBe(false);
  });

  it('normalizes the target before lookup', async () => {
    await setup();
    await saveVerifiedTarget('subject-1', 'example.com');
    expect(await isSubjectVerifiedTarget('subject-1', '  Example.COM.  ')).toBe(true);
  });

  it('reads targets from SCANNER_VERIFIED_TARGETS env', async () => {
    await setup();
    process.env.SCANNER_VERIFIED_TARGETS = 'subj1:example.com,subj2:test.org';

    expect(await isSubjectVerifiedTarget('subj1', 'example.com')).toBe(true);
    expect(await isSubjectVerifiedTarget('subj2', 'test.org')).toBe(true);
    expect(await isSubjectVerifiedTarget('subj1', 'test.org')).toBe(false);
    expect(await isSubjectVerifiedTarget('subj3', 'example.com')).toBe(false);
  });

  it('env targets are merged with file targets', async () => {
    await setup();
    process.env.SCANNER_VERIFIED_TARGETS = 'subj1:env-target.com';
    await saveVerifiedTarget('subj1', 'file-target.com');

    expect(await isSubjectVerifiedTarget('subj1', 'env-target.com')).toBe(true);
    expect(await isSubjectVerifiedTarget('subj1', 'file-target.com')).toBe(true);
  });

  it('env targets are read-only (cannot be removed)', async () => {
    await setup();
    process.env.SCANNER_VERIFIED_TARGETS = 'subj1:example.com';

    await removeVerifiedTarget('subj1', 'example.com');
    expect(await isSubjectVerifiedTarget('subj1', 'example.com')).toBe(true);
  });

  it('normalizes env targets during lookup', async () => {
    await setup();
    process.env.SCANNER_VERIFIED_TARGETS = 'subj1:Example.COM.';

    expect(await isSubjectVerifiedTarget('subj1', 'example.com')).toBe(true);
  });
});
