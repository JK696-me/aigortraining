import { syncEngine, EntityType, ActionType } from '@/lib/offlineSyncEngine'
import { supabase } from '@/integrations/supabase/client'

const SYNC_TIMEOUT = 10000

interface SyncedWriteResult<T = unknown> {
  success: boolean
  synced: boolean
  data?: T
  error?: string
}

/**
 * Performs a write operation with offline support.
 * If online and successful, returns immediately.
 * If offline or network error, queues for later sync.
 */
export async function syncedWrite<T = unknown>(
  entity: EntityType,
  action: ActionType,
  payload: Record<string, unknown>,
  options?: {
    idempotencyKey?: string
    select?: boolean
    userId?: string
  }
): Promise<SyncedWriteResult<T>> {
  const isOnline = navigator.onLine

  if (!isOnline) {
    // Queue immediately if offline
    const result = await syncEngine.enqueue(entity, action, payload, options?.idempotencyKey)
    return { success: result.success, synced: false }
  }

  // Try to execute with timeout
  try {
    const result = await executeWithTimeout<T>(entity, action, payload, options?.select)
    
    if (result.success) {
      return { success: true, synced: true, data: result.data }
    }

    // If network error, queue it
    if (result.error && isNetworkError(result.error)) {
      const queueResult = await syncEngine.enqueue(entity, action, payload, options?.idempotencyKey)
      return { success: queueResult.success, synced: false }
    }

    // Non-network error, return failure
    return { success: false, synced: false, error: result.error }
  } catch (error) {
    // Timeout or other error - queue it
    const queueResult = await syncEngine.enqueue(entity, action, payload, options?.idempotencyKey)
    return { success: queueResult.success, synced: false }
  }
}

async function executeWithTimeout<T>(
  entity: EntityType,
  action: ActionType,
  payload: Record<string, unknown>,
  select?: boolean
): Promise<{ success: boolean; data?: T; error?: string }> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), SYNC_TIMEOUT)

  try {
    const result = await executeOperation<T>(entity, action, payload, select)
    clearTimeout(timeoutId)
    return result
  } catch (error) {
    clearTimeout(timeoutId)
    throw error
  }
}

async function executeOperation<T>(
  entity: EntityType,
  action: ActionType,
  payload: Record<string, unknown>,
  select?: boolean
): Promise<{ success: boolean; data?: T; error?: string }> {
  try {
    const table = supabase.from(entity)

    switch (action) {
      case 'create': {
        let query = table.insert(payload as never)
        if (select) {
          const { data, error } = await query.select().single()
          if (error) return { success: false, error: error.message }
          return { success: true, data: data as T }
        } else {
          const { error } = await query
          if (error) return { success: false, error: error.message }
          return { success: true }
        }
      }
      case 'update': {
        const { id, ...updateData } = payload
        let query = table.update(updateData as never).eq('id', id as string)
        if (select) {
          const { data, error } = await query.select().single()
          if (error) return { success: false, error: error.message }
          return { success: true, data: data as T }
        } else {
          const { error } = await query
          if (error) return { success: false, error: error.message }
          return { success: true }
        }
      }
      case 'delete': {
        const { error } = await table.delete().eq('id', payload.id as string)
        if (error) return { success: false, error: error.message }
        return { success: true }
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: message }
  }
}

function isNetworkError(error: string): boolean {
  const networkErrorPatterns = [
    'network',
    'fetch',
    'timeout',
    'abort',
    'connection',
    'offline',
    'ECONNREFUSED',
    'ETIMEDOUT',
    'Failed to fetch',
  ]
  const lowerError = error.toLowerCase()
  return networkErrorPatterns.some(pattern => lowerError.includes(pattern.toLowerCase()))
}

/**
 * Generates a deterministic ID for idempotent operations
 */
export function generateDeterministicId(
  userId: string,
  entityType: string,
  uniqueData: string
): string {
  const base = `${userId}_${entityType}_${uniqueData}`
  // Simple hash-like ID generation
  let hash = 0
  for (let i = 0; i < base.length; i++) {
    const char = base.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  // Convert to UUID-like format
  const hexHash = Math.abs(hash).toString(16).padStart(8, '0')
  const uuid = `${hexHash.slice(0, 8)}-${Date.now().toString(16).slice(-4)}-4${hexHash.slice(8, 11)}-8${hexHash.slice(11, 14)}-${hexHash}${hexHash.slice(0, 4)}`
  return uuid
}
