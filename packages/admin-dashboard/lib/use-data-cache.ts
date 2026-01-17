"use client";

import { useState, useEffect, useCallback, useRef } from "react";

// Simple in-memory cache
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  lastFetchAttempt: number;
  isLoading: boolean;
}

const cache = new Map<string, CacheEntry<unknown>>();
const pendingRequests = new Map<string, Promise<unknown>>();

// Default stale time: 5 minutes
const DEFAULT_STALE_TIME = 5 * 60 * 1000;
// Minimum time between refetches: 30 seconds (prevents rapid re-fetching and rate limiting)
const MIN_REFETCH_INTERVAL = 30 * 1000;
// Minimum time between error retries: 60 seconds (exponential backoff starting point)
const ERROR_RETRY_INTERVAL = 60 * 1000;
// Track error counts for exponential backoff
const errorCounts = new Map<string, number>();

interface UseDataCacheOptions<T> {
  /** Unique cache key for this data */
  cacheKey: string;
  /** Function to fetch the data */
  fetcher: () => Promise<T>;
  /** Time in ms before data is considered stale (default: 5 min) */
  staleTime?: number;
  /** Whether to refetch on window focus (default: false) */
  refetchOnFocus?: boolean;
  /** Whether to enable background auto-refresh (default: false) */
  autoRefresh?: boolean;
  /** Auto-refresh interval in ms (default: 60 seconds) */
  autoRefreshInterval?: number;
}

interface UseDataCacheResult<T> {
  data: T | null;
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  lastUpdated: Date | null;
}

export function useDataCache<T>({
  cacheKey,
  fetcher,
  staleTime = DEFAULT_STALE_TIME,
  refetchOnFocus = false,
  autoRefresh = false,
  autoRefreshInterval = 60000,
}: UseDataCacheOptions<T>): UseDataCacheResult<T> {
  const [data, setData] = useState<T | null>(() => {
    // Initialize from cache if available
    const cached = cache.get(cacheKey) as CacheEntry<T> | undefined;
    return cached?.data ?? null;
  });
  const [isLoading, setIsLoading] = useState(() => {
    const cached = cache.get(cacheKey);
    return !cached?.data;
  });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(() => {
    const cached = cache.get(cacheKey);
    return cached ? new Date(cached.timestamp) : null;
  });

  const mountedRef = useRef(true);

  const fetchData = useCallback(
    async (forceRefresh = false) => {
      const now = Date.now();
      const cached = cache.get(cacheKey) as CacheEntry<T> | undefined;

      // Check if we should skip this fetch
      if (!forceRefresh) {
        // Don't refetch if data is fresh
        if (cached && now - cached.timestamp < staleTime) {
          console.log(`[Cache] ${cacheKey}: Using fresh cached data`);
          if (mountedRef.current) {
            setData(cached.data);
            setIsLoading(false);
            setLastUpdated(new Date(cached.timestamp));
          }
          return;
        }

        // Don't refetch too frequently (global per cache key)
        const lastAttempt = cached?.lastFetchAttempt ?? 0;
        const errorCount = errorCounts.get(cacheKey) ?? 0;
        // Use exponential backoff if there were errors
        const minInterval =
          errorCount > 0
            ? Math.min(
                ERROR_RETRY_INTERVAL * Math.pow(2, errorCount - 1),
                5 * 60 * 1000
              ) // Max 5 minutes
            : MIN_REFETCH_INTERVAL;

        if (now - lastAttempt < minInterval) {
          console.log(
            `[Cache] ${cacheKey}: Skipping fetch (too soon, wait ${Math.round((minInterval - (now - lastAttempt)) / 1000)}s)`
          );
          // If there's cached data, use it
          if (cached?.data && mountedRef.current) {
            setData(cached.data);
            setIsLoading(false);
            setLastUpdated(new Date(cached.timestamp));
          }
          return;
        }
      }

      // Update last fetch attempt time globally
      const existingEntry = cache.get(cacheKey) as CacheEntry<T> | undefined;
      if (existingEntry) {
        cache.set(cacheKey, { ...existingEntry, lastFetchAttempt: now });
      } else {
        // Create a placeholder entry to track the fetch attempt
        cache.set(cacheKey, {
          data: null as unknown as T,
          timestamp: 0,
          lastFetchAttempt: now,
          isLoading: true,
        });
      }

      // Check if there's already a pending request for this key
      const pendingRequest = pendingRequests.get(cacheKey);
      if (pendingRequest) {
        console.log(`[Cache] ${cacheKey}: Waiting for pending request`);
        try {
          const result = (await pendingRequest) as T;
          if (mountedRef.current) {
            setData(result);
            setIsLoading(false);
            setIsRefreshing(false);
            setError(null);
          }
        } catch {
          // Error handling is done in the original request
        }
        return;
      }

      // Set loading state
      if (mountedRef.current) {
        if (cached?.data) {
          setIsRefreshing(true);
        } else {
          setIsLoading(true);
        }
      }

      console.log(`[Cache] ${cacheKey}: Fetching data...`);

      // Create the fetch promise and store it
      const fetchPromise = fetcher()
        .then((result) => {
          const fetchTime = Date.now();
          // Update cache
          cache.set(cacheKey, {
            data: result,
            timestamp: fetchTime,
            lastFetchAttempt: fetchTime,
            isLoading: false,
          });

          // Reset error count on success
          errorCounts.delete(cacheKey);

          if (mountedRef.current) {
            setData(result);
            setLastUpdated(new Date());
            setError(null);
          }

          console.log(`[Cache] ${cacheKey}: Data fetched successfully`);
          return result;
        })
        .catch((err) => {
          // Increment error count for exponential backoff
          const currentErrors = errorCounts.get(cacheKey) ?? 0;
          errorCounts.set(cacheKey, currentErrors + 1);

          console.error(
            `[Cache] ${cacheKey}: Fetch failed (error #${currentErrors + 1}):`,
            err
          );
          const errorMessage =
            err instanceof Error ? err.message : "Failed to load data";

          // If we have cached data, keep using it and just show error as a toast
          const cachedData = cache.get(cacheKey) as CacheEntry<T> | undefined;
          if (cachedData?.data && mountedRef.current) {
            setData(cachedData.data);
            setLastUpdated(new Date(cachedData.timestamp));
          }

          if (mountedRef.current) {
            setError(errorMessage);
          }
          throw err;
        })
        .finally(() => {
          pendingRequests.delete(cacheKey);
          if (mountedRef.current) {
            setIsLoading(false);
            setIsRefreshing(false);
          }
        });

      pendingRequests.set(cacheKey, fetchPromise);

      try {
        await fetchPromise;
      } catch {
        // Error already handled above
      }
    },
    [cacheKey, fetcher, staleTime]
  );

  // Initial fetch on mount
  useEffect(() => {
    mountedRef.current = true;
    fetchData();

    return () => {
      mountedRef.current = false;
    };
  }, [fetchData]);

  // Optional: Refetch on window focus
  useEffect(() => {
    if (!refetchOnFocus) return;

    let debounceTimer: NodeJS.Timeout;

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        // Debounce to avoid rapid refetches
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          fetchData();
        }, 500);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      clearTimeout(debounceTimer);
    };
  }, [refetchOnFocus, fetchData]);

  // Optional: Auto-refresh in background
  useEffect(() => {
    if (!autoRefresh) return;

    const intervalId = setInterval(() => {
      if (document.visibilityState === "visible") {
        fetchData();
      }
    }, autoRefreshInterval);

    return () => clearInterval(intervalId);
  }, [autoRefresh, autoRefreshInterval, fetchData]);

  const refetch = useCallback(() => fetchData(true), [fetchData]);

  return {
    data,
    isLoading,
    isRefreshing,
    error,
    refetch,
    lastUpdated,
  };
}

/**
 * Clear all cached data (useful for logout)
 */
export function clearDataCache(): void {
  cache.clear();
  pendingRequests.clear();
  errorCounts.clear();
}

/**
 * Clear a specific cache key
 */
export function invalidateCache(cacheKey: string): void {
  cache.delete(cacheKey);
  errorCounts.delete(cacheKey);
}
