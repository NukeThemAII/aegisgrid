import Redis from 'ioredis';

export type CacheProvider = 'memory' | 'redis';

export interface RedisCacheClient {
  connect?(): Promise<void>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: 'EX', ttlSeconds: number): Promise<'OK' | string | null>;
  del(key: string): Promise<number>;
  quit?(): Promise<'OK' | string | void>;
  disconnect?(): void;
}

export interface CacheStore {
  readonly provider: CacheProvider;
  getJson<T = unknown>(key: string): Promise<T | null>;
  setJson(key: string, value: unknown, ttlSeconds: number): Promise<void>;
  delete(key: string): Promise<void>;
  close(): Promise<void>;
  setNowForTests(now: () => number): void;
}

export interface CacheStoreOptions {
  redisUrl?: string | null;
  redisClient?: RedisCacheClient | null;
  now?: () => number;
}

interface MemoryEntry {
  value: string;
  expiresAt: number;
}

const DEFAULT_REDIS_CONNECT_TIMEOUT_MS = 3_000;
const DEFAULT_REDIS_COMMAND_TIMEOUT_MS = 3_000;

function configured(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function sanitizeTtl(ttlSeconds: number): number {
  if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0) return 1;
  return Math.max(1, Math.min(Math.floor(ttlSeconds), 86_400));
}

function createRedisClient(redisUrl: string): RedisCacheClient {
  return new Redis(redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    connectTimeout: Number(process.env.REDIS_CONNECT_TIMEOUT_MS || DEFAULT_REDIS_CONNECT_TIMEOUT_MS),
    commandTimeout: Number(process.env.REDIS_COMMAND_TIMEOUT_MS || DEFAULT_REDIS_COMMAND_TIMEOUT_MS),
  });
}

export function createCacheStore(options: CacheStoreOptions = {}): CacheStore {
  const memory = new Map<string, MemoryEntry>();
  let now = options.now ?? Date.now;
  const redisUrl = configured(options.redisUrl ?? process.env.REDIS_URL);
  let redisClient = options.redisClient ?? null;
  let connectPromise: Promise<unknown> | null = null;

  function client(): RedisCacheClient | null {
    if (!redisUrl) return null;
    if (!redisClient) redisClient = createRedisClient(redisUrl);
    return redisClient;
  }

  async function connectedClient(): Promise<RedisCacheClient | null> {
    const redis = client();
    if (!redis) return null;
    if (redis.connect) {
      connectPromise ??= redis.connect().catch((error) => {
        connectPromise = null;
        throw error;
      });
      await connectPromise;
    }
    return redis;
  }

  return {
    get provider() {
      return redisUrl ? 'redis' : 'memory';
    },

    async getJson<T = unknown>(key: string): Promise<T | null> {
      const redis = await connectedClient();
      const raw = redis
        ? await redis.get(key)
        : (() => {
          const entry = memory.get(key);
          if (!entry) return null;
          if (entry.expiresAt <= now()) {
            memory.delete(key);
            return null;
          }
          return entry.value;
        })();

      if (!raw) return null;
      try {
        return JSON.parse(raw) as T;
      } catch {
        return null;
      }
    },

    async setJson(key: string, value: unknown, ttlSeconds: number): Promise<void> {
      const ttl = sanitizeTtl(ttlSeconds);
      const serialized = JSON.stringify(value);
      const redis = await connectedClient();
      if (redis) {
        await redis.set(key, serialized, 'EX', ttl);
        return;
      }
      memory.set(key, { value: serialized, expiresAt: now() + ttl * 1_000 });
    },

    async delete(key: string): Promise<void> {
      const redis = await connectedClient();
      if (redis) {
        await redis.del(key);
        return;
      }
      memory.delete(key);
    },

    async close(): Promise<void> {
      if (!redisClient) return;
      if (redisClient.quit) {
        await redisClient.quit();
        return;
      }
      redisClient.disconnect?.();
    },

    setNowForTests(nextNow: () => number): void {
      now = nextNow;
    },
  };
}

let defaultCacheStore: CacheStore | null = null;

export function getDefaultCacheStore(): CacheStore {
  if (!defaultCacheStore) {
    defaultCacheStore = createCacheStore();
  }
  return defaultCacheStore;
}

export function cacheStatus(): { status: 'memory_fallback' | 'redis_configured'; cache: 'memory' | 'wired'; queue: 'planned' } {
  const redisConfigured = Boolean(configured(process.env.REDIS_URL));
  return {
    status: redisConfigured ? 'redis_configured' : 'memory_fallback',
    cache: redisConfigured ? 'wired' : 'memory',
    queue: 'planned',
  };
}
