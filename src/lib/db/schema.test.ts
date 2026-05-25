import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('database schema', () => {
  it('defines the core commercial persistence tables and indexes', async () => {
    const sql = await readFile(join(process.cwd(), 'db', 'schema.sql'), 'utf8');

    for (const table of ['users', 'entitlements', 'credit_ledger', 'reports']) {
      expect(sql).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
    }
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS idx_entitlements_user_capability_status');
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS idx_reports_user_created_at');
    expect(sql).toContain('CHECK (status IN');
  });
});
