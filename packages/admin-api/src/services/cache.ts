import { LRUCache } from "lru-cache";

// Cache with 60 second TTL
const cache = new LRUCache<string, any>({
  max: 100, // Maximum 100 items
  ttl: 60 * 1000, // 60 seconds TTL
});

/**
 * Get value from cache
 */
export const getCached = <T>(key: string): T | undefined => {
  return cache.get(key) as T | undefined;
};

/**
 * Set value in cache
 */
export const setCached = <T>(key: string, value: T): void => {
  cache.set(key, value);
};

/**
 * Get or compute cached value
 */
export const getOrCompute = async <T>(
  key: string,
  compute: () => Promise<T>
): Promise<T> => {
  const cached = getCached<T>(key);
  if (cached !== undefined) {
    console.log(`[cache] HIT: ${key}`);
    return cached;
  }

  console.log(`[cache] MISS: ${key}`);
  const value = await compute();
  setCached(key, value);
  return value;
};

/**
 * Clear all cache
 */
export const clearCache = (): void => {
  cache.clear();
};
