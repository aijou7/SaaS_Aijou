type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

type InFlightEntry<T> = {
  cancelled: boolean;
  promise: Promise<T>;
};

const maxCacheEntries = 500;
const memoryCache = new Map<string, CacheEntry<unknown>>();
const inFlightLoads = new Map<string, InFlightEntry<unknown>>();

export async function ttlCache<T>(key: string, ttlMs: number, loader: () => Promise<T>) {
  const now = Date.now();
  const existing = memoryCache.get(key) as CacheEntry<T> | undefined;

  if (existing && existing.expiresAt > now) {
    return existing.value;
  }

  if (existing) {
    memoryCache.delete(key);
  }

  const inFlight = inFlightLoads.get(key) as InFlightEntry<T> | undefined;
  if (inFlight) {
    return inFlight.promise;
  }

  const entry: InFlightEntry<T> = {
    cancelled: false,
    promise: Promise.resolve().then(loader),
  };

  entry.promise = entry.promise
    .then((value) => {
      if (!entry.cancelled && ttlMs > 0) {
        memoryCache.set(key, { expiresAt: Date.now() + ttlMs, value });
        enforceCacheLimit(Date.now());
      }

      return value;
    })
    .finally(() => {
      if (inFlightLoads.get(key) === entry) {
        inFlightLoads.delete(key);
      }
    });

  inFlightLoads.set(key, entry as InFlightEntry<unknown>);

  return entry.promise;
}

export function invalidateTtlCache(prefix: string) {
  for (const key of memoryCache.keys()) {
    if (key.startsWith(prefix)) {
      memoryCache.delete(key);
    }
  }

  for (const [key, entry] of inFlightLoads.entries()) {
    if (key.startsWith(prefix)) {
      entry.cancelled = true;
      inFlightLoads.delete(key);
    }
  }
}

export function clearTtlCache() {
  memoryCache.clear();

  for (const entry of inFlightLoads.values()) {
    entry.cancelled = true;
  }

  inFlightLoads.clear();
}

export function getTtlCacheStats() {
  return {
    entries: memoryCache.size,
    inFlight: inFlightLoads.size,
    maxEntries: maxCacheEntries,
  };
}

function pruneExpiredCache(now: number) {
  for (const [key, entry] of memoryCache.entries()) {
    if (entry.expiresAt <= now) {
      memoryCache.delete(key);
    }
  }
}

function enforceCacheLimit(now: number) {
  pruneExpiredCache(now);

  if (memoryCache.size <= maxCacheEntries) {
    return;
  }

  const overflow = memoryCache.size - maxCacheEntries;
  const oldestExpirations = [...memoryCache.entries()]
    .sort(([, left], [, right]) => left.expiresAt - right.expiresAt)
    .slice(0, overflow);

  for (const [key] of oldestExpirations) {
    memoryCache.delete(key);
  }
}
