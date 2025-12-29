import React, { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react'
import { syncEngine, SyncState, EntityType, ActionType, Dependency, OperationStatus } from '@/lib/offlineSyncEngine'
import { useAuth } from '@/contexts/AuthContext'

interface EnqueueOptions {
  local_id?: string
  depends_on?: Dependency[]
}

interface SyncContextType {
  state: SyncState
  enqueue: (
    entity: EntityType,
    action: ActionType,
    payload: Record<string, unknown>,
    idempotencyKey?: string,
    options?: EnqueueOptions
  ) => Promise<{ success: boolean; synced: boolean; error?: string; id?: string }>
  retryFailed: () => Promise<void>
  processSyncQueue: () => Promise<void>
  generateId: () => string
  getServerId: (entity: EntityType, localId: string) => string | undefined
  getOperationStatus: (entity: EntityType, localId: string) => Promise<OperationStatus | 'synced'>
}

const SyncContext = createContext<SyncContextType | undefined>(undefined)

export function SyncProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [state, setState] = useState<SyncState>(syncEngine.getState())

  useEffect(() => {
    syncEngine.setUserId(user?.id || null)
  }, [user?.id])

  useEffect(() => {
    const unsubscribe = syncEngine.subscribe(setState)
    return unsubscribe
  }, [])

  const enqueue = useCallback(
    async (
      entity: EntityType,
      action: ActionType,
      payload: Record<string, unknown>,
      idempotencyKey?: string,
      options?: EnqueueOptions
    ) => {
      return syncEngine.enqueue(entity, action, payload, idempotencyKey, options)
    },
    []
  )

  const retryFailed = useCallback(async () => {
    await syncEngine.retryFailed()
  }, [])

  const processSyncQueue = useCallback(async () => {
    await syncEngine.processSyncQueue()
  }, [])

  const generateId = useCallback(() => {
    return syncEngine.generateId()
  }, [])

  const getServerId = useCallback((entity: EntityType, localId: string) => {
    return syncEngine.getServerId(entity, localId)
  }, [])

  const getOperationStatus = useCallback(async (entity: EntityType, localId: string) => {
    return syncEngine.getOperationStatusAsync(entity, localId)
  }, [])

  return (
    <SyncContext.Provider value={{ 
      state, 
      enqueue, 
      retryFailed, 
      processSyncQueue, 
      generateId,
      getServerId,
      getOperationStatus
    }}>
      {children}
    </SyncContext.Provider>
  )
}

export function useSync() {
  const context = useContext(SyncContext)
  if (!context) {
    throw new Error('useSync must be used within a SyncProvider')
  }
  return context
}

// Hook for creating synced mutations with optimistic updates
export function useSyncedMutation<T extends Record<string, unknown>>(
  entity: EntityType,
  options?: {
    onSuccess?: () => void
    onError?: (error: string) => void
    onLocalSave?: () => void
  }
) {
  const { enqueue, generateId } = useSync()
  const [isLoading, setIsLoading] = useState(false)

  const create = useCallback(
    async (
      data: T, 
      idempotencyKey?: string,
      enqueueOptions?: EnqueueOptions
    ) => {
      setIsLoading(true)
      try {
        const id = (data.id as string) || enqueueOptions?.local_id || generateId()
        const payload = { ...data, id }
        const result = await enqueue(entity, 'create', payload, idempotencyKey, {
          ...enqueueOptions,
          local_id: id,
        })

        if (result.success) {
          if (result.synced) {
            options?.onSuccess?.()
          } else {
            options?.onLocalSave?.()
          }
        } else {
          options?.onError?.(result.error || 'Unknown error')
        }

        return { ...result, id }
      } finally {
        setIsLoading(false)
      }
    },
    [entity, enqueue, generateId, options]
  )

  const update = useCallback(
    async (
      id: string, 
      data: Partial<T>, 
      idempotencyKey?: string,
      enqueueOptions?: EnqueueOptions
    ) => {
      setIsLoading(true)
      try {
        const payload = { ...data, id }
        const result = await enqueue(entity, 'update', payload, idempotencyKey, enqueueOptions)

        if (result.success) {
          if (result.synced) {
            options?.onSuccess?.()
          } else {
            options?.onLocalSave?.()
          }
        } else {
          options?.onError?.(result.error || 'Unknown error')
        }

        return result
      } finally {
        setIsLoading(false)
      }
    },
    [entity, enqueue, options]
  )

  const remove = useCallback(
    async (id: string, idempotencyKey?: string) => {
      setIsLoading(true)
      try {
        const result = await enqueue(entity, 'delete', { id }, idempotencyKey)

        if (result.success) {
          if (result.synced) {
            options?.onSuccess?.()
          } else {
            options?.onLocalSave?.()
          }
        } else {
          options?.onError?.(result.error || 'Unknown error')
        }

        return result
      } finally {
        setIsLoading(false)
      }
    },
    [entity, enqueue, options]
  )

  return { create, update, remove, isLoading }
}

// Re-export types for convenience
export type { Dependency, EntityType, ActionType, OperationStatus } from '@/lib/offlineSyncEngine'
