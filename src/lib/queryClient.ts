import { QueryClient } from '@tanstack/react-query'
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'
import { get, set, del, createStore } from 'idb-keyval'
import { getStaleTime, getGcTime } from './queryKeys'

// Create a custom IDB store for React Query cache
const queryStore = createStore('react-query-cache', 'queries')

// Custom persister using IndexedDB for better performance with large data
export function createIDBPersister(userId: string) {
  const key = `react-query-cache-${userId}`
  
  return {
    persistClient: async (client: unknown) => {
      try {
        await set(key, client, queryStore)
      } catch (error) {
        console.warn('[QueryCache] Failed to persist cache:', error)
      }
    },
    restoreClient: async () => {
      try {
        return await get(key, queryStore)
      } catch (error) {
        console.warn('[QueryCache] Failed to restore cache:', error)
        return undefined
      }
    },
    removeClient: async () => {
      try {
        await del(key, queryStore)
      } catch (error) {
        console.warn('[QueryCache] Failed to remove cache:', error)
      }
    },
  }
}

// Fallback to localStorage persister for simple cases
export function createLocalStoragePersister(userId: string) {
  const key = `react-query-cache-${userId}`
  
  return createSyncStoragePersister({
    key,
    storage: window.localStorage,
    serialize: (data) => JSON.stringify(data),
    deserialize: (data) => JSON.parse(data),
  })
}

// Create QueryClient with optimal defaults
export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Use dynamic staleTime based on query key
        staleTime: 5 * 60 * 1000, // Default 5 minutes
        gcTime: 10 * 60 * 1000, // Default 10 minutes
        // Retry failed requests up to 2 times
        retry: 2,
        retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
        // Refetch on reconnect and window focus for fresh data
        refetchOnReconnect: true,
        refetchOnWindowFocus: false, // Disable auto-refetch on focus, we control this manually
        // Keep previous data while fetching new
        placeholderData: (previousData: unknown) => previousData,
      },
      mutations: {
        // Retry mutations once on failure
        retry: 1,
      },
    },
  })
}

// Clear all cache for a specific user
export async function clearUserCache(userId: string) {
  const key = `react-query-cache-${userId}`
  
  // Clear IndexedDB
  try {
    await del(key, queryStore)
  } catch (error) {
    console.warn('[QueryCache] Failed to clear IDB cache:', error)
  }
  
  // Clear localStorage fallback
  try {
    localStorage.removeItem(key)
  } catch (error) {
    console.warn('[QueryCache] Failed to clear localStorage cache:', error)
  }
}

// Debug utilities for development
export const cacheDebug = {
  requestCount: 0,
  cacheHits: [] as { key: string; status: 'HIT' | 'MISS' | 'STALE'; timestamp: number }[],
  
  recordRequest() {
    this.requestCount++
  },
  
  recordCacheStatus(key: string, status: 'HIT' | 'MISS' | 'STALE') {
    this.cacheHits.unshift({ key, status, timestamp: Date.now() })
    // Keep only last 10
    if (this.cacheHits.length > 10) {
      this.cacheHits.pop()
    }
  },
  
  getStats() {
    return {
      totalRequests: this.requestCount,
      recentCacheOps: this.cacheHits,
    }
  },
  
  reset() {
    this.requestCount = 0
    this.cacheHits = []
  },
}
