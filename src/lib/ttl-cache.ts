type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

const memoryCache = new Map<string, CacheEntry<unknown>>();

export async function ttlCache<T>(key: string, ttlMs: number, loader: () => Promise<T>) {
  const now = Date.now();
  const existing = memoryCache.get(key) as CacheEntry<T> | undefined;

  if (existing && existing.expiresAt > now) {
    return existing.value;
  }

  const value = await loader();
  memoryCache.set(key, { expiresAt: now + ttlMs, value });

  if (memoryCache.size > 500) {
    pruneExpiredCache(now);
  }

  return value;
}

export function invalidateTtlCache(prefix: string) {
  for (const key of memoryCache.keys()) {
    if (key.startsWith(prefix)) {
      memoryCache.delete(key);
    }
  }
}

function pruneExpiredCache(now: number) {
  for (const [key, entry] of memoryCache.entries()) {
    if (entry.expiresAt <= now) {
      memoryCache.delete(key);
    }
  }
}
