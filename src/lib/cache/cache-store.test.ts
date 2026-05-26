import { afterEach, describe, expect, it, vi } from 'vitest';

interface FakeRedisCall {
  command: string;
  args: unknown[];
}

class FakeRedisClient {
  calls: FakeRedisCall[] = [];
  values = new Map<string, string>();
  connected = false;
  closed = false;

  async connect(): Promise<void> {
    this.calls.push({ command: 'connect', args: [] });
    this.connected = true;
  }

  async get(key: string): Promise<string | null> {
    if (!this.connected) throw new Error('not connected');
    this.calls.push({ command: 'get', args: [key] });
    return this.values.get(key) ?? null;
  }

  async set(key: string, value: string, mode?: string, ttl?: number): Promise<'OK'> {
    if (!this.connected) throw new Error('not connected');
    this.calls.push({ command: 'set', args: [key, value, mode, ttl] });
    this.values.set(key, value);
    return 'OK';
  }

  async del(key: string): Promise<number> {
    if (!this.connected) throw new Error('not connected');
    this.calls.push({ command: 'del', args: [key] });
    const existed = this.values.delete(key);
    return existed ? 1 : 0;
  }

  async quit(): Promise<void> {
    this.calls.push({ command: 'quit', args: [] });
    this.closed = true;
  }
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('shared cache store', () => {
  it('uses an in-memory TTL cache when Redis is not configured', async () => {
    vi.resetModules();
    const { createCacheStore } = await import('./cache-store');
    const store = createCacheStore({ now: () => 1_000 });

    await store.setJson('feed:earthquakes', { count: 2 }, 2);
    await expect(store.getJson<{ count: number }>('feed:earthquakes')).resolves.toEqual({ count: 2 });

    store.setNowForTests(() => 3_001);
    await expect(store.getJson('feed:earthquakes')).resolves.toBeNull();
    expect(store.provider).toBe('memory');
  });

  it('uses Redis SET EX and JSON parsing when a Redis client is provided', async () => {
    vi.resetModules();
    const redis = new FakeRedisClient();
    const { createCacheStore } = await import('./cache-store');
    const store = createCacheStore({ redisUrl: 'redis://localhost:6379/0', redisClient: redis });

    await store.setJson('feed:gdelt', { ok: true }, 45);
    await expect(store.getJson<{ ok: boolean }>('feed:gdelt')).resolves.toEqual({ ok: true });
    await store.delete('feed:gdelt');
    await store.close();

    expect(store.provider).toBe('redis');
    expect(redis.connected).toBe(true);
    expect(redis.closed).toBe(true);
    expect(redis.calls).toEqual([
      { command: 'connect', args: [] },
      { command: 'set', args: ['feed:gdelt', JSON.stringify({ ok: true }), 'EX', 45] },
      { command: 'get', args: ['feed:gdelt'] },
      { command: 'del', args: ['feed:gdelt'] },
      { command: 'quit', args: [] },
    ]);
  });

  it('returns null for corrupt cached JSON instead of throwing', async () => {
    vi.resetModules();
    const redis = new FakeRedisClient();
    redis.values.set('bad', '{not-json');
    const { createCacheStore } = await import('./cache-store');
    const store = createCacheStore({ redisUrl: 'redis://localhost:6379/0', redisClient: redis });

    await expect(store.getJson('bad')).resolves.toBeNull();
  });
});
