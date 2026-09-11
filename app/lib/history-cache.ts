/**
 * Shared in-process cache for /api/history responses.
 *
 * Keeping the cache in a dedicated module (instead of inside route.ts) means
 * any other API route that mutates history.json can call `invalidateHistoryCache()`
 * without needing a circular import or an extra HTTP round-trip.
 *
 * Cache key: `${type}|${lang}` — matches the query params used by GET /api/history.
 */

export interface HistoryCacheEntry {
  etag: string;
  payload: { topics: any[] };
}

// Module-level singleton — shared across all imports within the same Node process.
export const historyResponseCache = new Map<string, HistoryCacheEntry>();

/**
 * Drop all cached history responses.
 * Call this whenever history.json or queue.json is mutated outside of
 * the GET /api/history handler (e.g. capcut route, sync-sheets route,
 * agent direct file writes).
 */
export function invalidateHistoryCache(): void {
  historyResponseCache.clear();
}
