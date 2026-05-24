import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import {
  addAdminAllowlistEntry,
  isAdminAllowlistedTarget,
  listAdminAllowlistEntries,
  removeAdminAllowlistEntry,
} from './scanner-allowlist';

let tmpDir = '';

async function setupStore(): Promise<string> {
  tmpDir = await mkdtemp(join(tmpdir(), 'aegisgrid-allowlist-'));
  process.env.SCANNER_ADMIN_ALLOWLIST_PATH = join(tmpDir, 'allowlist.json');
  return tmpDir;
}

afterEach(async () => {
  delete process.env.SCANNER_ALLOWED_TARGETS;
  delete process.env.SCANNER_ADMIN_ALLOWLIST_PATH;
  if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
  tmpDir = '';
});

describe('scanner admin allowlist store', () => {
  it('merges env allowlist entries with file-backed admin entries', async () => {
    await setupStore();
    process.env.SCANNER_ALLOWED_TARGETS = 'env.example.com,*.trusted.example';
    await addAdminAllowlistEntry('file.example.com', 'admin', 'manual approval');

    const entries = await listAdminAllowlistEntries();

    expect(entries.map(entry => entry.target).sort()).toEqual([
      '*.trusted.example',
      'env.example.com',
      'file.example.com',
    ]);
    expect(entries.find(entry => entry.target === 'env.example.com')?.source).toBe('env');
    expect(entries.find(entry => entry.target === 'file.example.com')?.source).toBe('file');
  });

  it('normalizes and de-duplicates file entries', async () => {
    await setupStore();

    await addAdminAllowlistEntry('  Example.COM.  ', 'admin');
    await addAdminAllowlistEntry('example.com', 'admin');

    const entries = await listAdminAllowlistEntries();
    expect(entries.filter(entry => entry.source === 'file').map(entry => entry.target)).toEqual(['example.com']);
  });

  it('removes file entries but leaves env entries read-only', async () => {
    await setupStore();
    process.env.SCANNER_ALLOWED_TARGETS = 'env.example.com';
    await addAdminAllowlistEntry('file.example.com', 'admin');

    await removeAdminAllowlistEntry('env.example.com');
    await removeAdminAllowlistEntry('file.example.com');

    const entries = await listAdminAllowlistEntries();
    expect(entries.map(entry => entry.target)).toEqual(['env.example.com']);
  });

  it('supports exact and wildcard target checks', async () => {
    await setupStore();
    await addAdminAllowlistEntry('example.com', 'admin');
    await addAdminAllowlistEntry('*.trusted.example', 'admin');

    await expect(isAdminAllowlistedTarget('example.com')).resolves.toBe(true);
    await expect(isAdminAllowlistedTarget('api.trusted.example')).resolves.toBe(true);
    await expect(isAdminAllowlistedTarget('trusted.example')).resolves.toBe(false);
    await expect(isAdminAllowlistedTarget('evil.example')).resolves.toBe(false);
  });
});
