/**
 * Client-side caching utilities with automatic expiry management.
 * Provides a simple API for storing and retrieving data from localStorage
 * with built-in TTL (time-to-live) functionality.
 */

const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface CacheItem<T> {
  value: T;
  expiry: number;
}

export const CacheKeys = {
  POSTS: "posts",
  HIGHLIGHT: "highlightPost",
  TEAM_MEMBERS: "teamMembers",
  PARTNERS: "partners",
} as const;

export type CacheKey = (typeof CacheKeys)[keyof typeof CacheKeys];

/**
 * Save data to localStorage with automatic expiry timestamp
 */
export function saveToCache<T>(
  key: CacheKey | string,
  data: T,
  ttlMs: number = DEFAULT_TTL_MS,
): void {
  try {
    const item: CacheItem<T> = {
      value: data,
      expiry: Date.now() + ttlMs,
    };
    localStorage.setItem(key, JSON.stringify(item));
  } catch (error) {
    console.warn(`Failed to save to cache: ${key}`, error);
  }
}

/**
 * Load data from localStorage, checking if it has expired
 * Returns null if not found or expired
 */
export function loadFromCache<T>(key: CacheKey | string): T | null {
  try {
    const itemStr = localStorage.getItem(key);
    if (!itemStr) {
      return null;
    }

    const item: CacheItem<T> = JSON.parse(itemStr);
    if (Date.now() > item.expiry) {
      // Data has expired, clean it up
      localStorage.removeItem(key);
      return null;
    }

    return item.value;
  } catch (error) {
    console.warn(`Failed to load from cache: ${key}`, error);
    return null;
  }
}

/**
 * Remove specific cache entry
 */
export function clearCache(key: CacheKey | string): void {
  try {
    localStorage.removeItem(key);
  } catch (error) {
    console.warn(`Failed to clear cache: ${key}`, error);
  }
}

/**
 * Clear all app-related cache entries
 */
export function clearAllCache(): void {
  Object.values(CacheKeys).forEach((key) => {
    clearCache(key);
  });
}

/**
 * Check if cache entry exists and is not expired
 */
export function hasCacheEntry(key: CacheKey | string): boolean {
  return loadFromCache(key) !== null;
}
