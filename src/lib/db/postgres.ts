import { Pool } from 'pg';
import type { QueryResultRow } from 'pg';

interface GlobalWithPgPool {
  __aegisgridPgPool?: Pool;
}

function globalStore(): GlobalWithPgPool {
  return globalThis as typeof globalThis & GlobalWithPgPool;
}

export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

export function databaseProvider(url = process.env.DATABASE_URL): string | null {
  if (!url?.trim()) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol.replace(/:$/, '') || 'unknown';
  } catch {
    return 'unknown';
  }
}

export function parsePositiveIntEnv(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function getPgPool(): Pool | null {
  if (!isDatabaseConfigured()) return null;

  const store = globalStore();
  if (!store.__aegisgridPgPool) {
    store.__aegisgridPgPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: parsePositiveIntEnv('DATABASE_POOL_MAX', 5),
      idleTimeoutMillis: parsePositiveIntEnv('DATABASE_IDLE_TIMEOUT_MS', 30_000),
      connectionTimeoutMillis: parsePositiveIntEnv('DATABASE_CONNECT_TIMEOUT_MS', 3_000),
      application_name: 'aegisgrid',
    });
  }

  return store.__aegisgridPgPool;
}

export async function queryPg<T extends QueryResultRow = QueryResultRow>(
  text: string,
  values: readonly unknown[] = [],
): Promise<{ rows: T[] }> {
  const pool = getPgPool();
  if (!pool) {
    throw new Error('DATABASE_URL is not configured');
  }

  return pool.query<T>(text, [...values]);
}
