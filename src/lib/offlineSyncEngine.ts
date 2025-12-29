import { get, set, del, keys } from 'idb-keyval'
import { supabase } from '@/integrations/supabase/client'

export type EntityType = 
  | 'sessions' 
  | 'session_exercises' 
  | 'sets' 
  | 'workout_templates' 
  | 'template_items' 
  | 'exercise_state'
  | 'exercises'
  | 'health_entries'
  | 'health_attachments'

export type ActionType = 'create' | 'update' | 'delete'

export type OperationStatus = 'queued' | 'syncing' | 'synced' | 'failed'

export interface SyncOperation {
  op_id: string
  created_at: number
  entity: EntityType
  action: ActionType
  payload: Record<string, unknown>
  idempotency_key: string
  status: OperationStatus
  last_error: string | null
  retries: number
}

export interface SyncState {
  isOnline: boolean
  pendingCount: number
  syncingCount: number
  failedCount: number
  lastSyncAt: number | null
}

const QUEUE_PREFIX = 'op_queue_'
const SYNC_TIMEOUT = 10000 // 10 seconds

type SyncListener = (state: SyncState) => void

class OfflineSyncEngine {
  private userId: string | null = null
  private listeners: Set<SyncListener> = new Set()
  private isSyncing = false
  private state: SyncState = {
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    pendingCount: 0,
    syncingCount: 0,
    failedCount: 0,
    lastSyncAt: null,
  }

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.handleOnline)
      window.addEventListener('offline', this.handleOffline)
    }
  }

  private handleOnline = () => {
    this.state.isOnline = true
    this.notifyListeners()
    this.processSyncQueue()
  }

  private handleOffline = () => {
    this.state.isOnline = false
    this.notifyListeners()
  }

  setUserId(userId: string | null) {
    this.userId = userId
    if (userId) {
      this.loadState()
    }
  }

  subscribe(listener: SyncListener): () => void {
    this.listeners.add(listener)
    listener(this.state)
    return () => this.listeners.delete(listener)
  }

  private notifyListeners() {
    this.listeners.forEach(listener => listener({ ...this.state }))
  }

  private getQueueKey(): string {
    return `${QUEUE_PREFIX}${this.userId}`
  }

  private async getQueue(): Promise<SyncOperation[]> {
    if (!this.userId) return []
    try {
      const queue = await get<SyncOperation[]>(this.getQueueKey())
      return queue || []
    } catch (error) {
      console.error('Failed to get sync queue:', error)
      return []
    }
  }

  private async saveQueue(queue: SyncOperation[]): Promise<void> {
    if (!this.userId) return
    try {
      await set(this.getQueueKey(), queue)
      await this.updateState(queue)
    } catch (error) {
      console.error('Failed to save sync queue:', error)
    }
  }

  private async updateState(queue?: SyncOperation[]): Promise<void> {
    const ops = queue ?? await this.getQueue()
    this.state.pendingCount = ops.filter(o => o.status === 'queued').length
    this.state.syncingCount = ops.filter(o => o.status === 'syncing').length
    this.state.failedCount = ops.filter(o => o.status === 'failed').length
    this.notifyListeners()
  }

  async loadState(): Promise<void> {
    await this.updateState()
    // Auto-sync on load if online
    if (this.state.isOnline && (this.state.pendingCount > 0 || this.state.failedCount > 0)) {
      this.processSyncQueue()
    }
  }

  generateId(): string {
    return crypto.randomUUID()
  }

  generateIdempotencyKey(entity: EntityType, action: ActionType, payload: Record<string, unknown>): string {
    const base = `${entity}_${action}_${JSON.stringify(payload)}_${Date.now()}`
    return btoa(base).slice(0, 32)
  }

  async enqueue(
    entity: EntityType,
    action: ActionType,
    payload: Record<string, unknown>,
    idempotencyKey?: string
  ): Promise<{ success: boolean; synced: boolean; error?: string }> {
    const opId = this.generateId()
    const idemKey = idempotencyKey || this.generateIdempotencyKey(entity, action, payload)

    // If online, try to execute immediately with timeout
    if (this.state.isOnline) {
      try {
        const result = await this.executeWithTimeout(entity, action, payload)
        if (result.success) {
          this.state.lastSyncAt = Date.now()
          this.notifyListeners()
          return { success: true, synced: true }
        }
        // If it's a non-network error, don't queue
        if (result.error && !this.isNetworkError(result.error)) {
          return { success: false, synced: false, error: result.error }
        }
      } catch (error) {
        // Network error or timeout - queue it
        console.log('Operation failed, queueing for later:', error)
      }
    }

    // Queue the operation
    const operation: SyncOperation = {
      op_id: opId,
      created_at: Date.now(),
      entity,
      action,
      payload,
      idempotency_key: idemKey,
      status: 'queued',
      last_error: null,
      retries: 0,
    }

    const queue = await this.getQueue()
    
    // Check for duplicate idempotency key
    const existingIndex = queue.findIndex(op => op.idempotency_key === idemKey)
    if (existingIndex >= 0) {
      // Already queued, return success
      return { success: true, synced: false }
    }

    queue.push(operation)
    await this.saveQueue(queue)

    return { success: true, synced: false }
  }

  private async executeWithTimeout(
    entity: EntityType,
    action: ActionType,
    payload: Record<string, unknown>
  ): Promise<{ success: boolean; error?: string }> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), SYNC_TIMEOUT)

    try {
      const result = await this.executeOperation(entity, action, payload)
      clearTimeout(timeoutId)
      return result
    } catch (error) {
      clearTimeout(timeoutId)
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Timeout')
      }
      throw error
    }
  }

  private async executeOperation(
    entity: EntityType,
    action: ActionType,
    payload: Record<string, unknown>
  ): Promise<{ success: boolean; error?: string }> {
    try {
      let result
      const table = supabase.from(entity)

      switch (action) {
        case 'create':
          result = await table.insert(payload as never)
          break
        case 'update':
          const { id, ...updateData } = payload
          result = await table.update(updateData as never).eq('id', id as string)
          break
        case 'delete':
          result = await table.delete().eq('id', payload.id as string)
          break
      }

      if (result.error) {
        return { success: false, error: result.error.message }
      }

      return { success: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return { success: false, error: message }
    }
  }

  private isNetworkError(error: string): boolean {
    const networkErrorPatterns = [
      'network',
      'fetch',
      'timeout',
      'abort',
      'connection',
      'offline',
      'ECONNREFUSED',
      'ETIMEDOUT',
    ]
    const lowerError = error.toLowerCase()
    return networkErrorPatterns.some(pattern => lowerError.includes(pattern))
  }

  async processSyncQueue(): Promise<void> {
    if (this.isSyncing || !this.state.isOnline || !this.userId) return

    this.isSyncing = true
    const queue = await this.getQueue()
    const toProcess = queue
      .filter(op => op.status === 'queued' || op.status === 'failed')
      .sort((a, b) => a.created_at - b.created_at)

    for (const operation of toProcess) {
      if (!this.state.isOnline) break

      // Update status to syncing
      operation.status = 'syncing'
      await this.saveQueue(queue)

      try {
        const result = await this.executeWithTimeout(
          operation.entity,
          operation.action,
          operation.payload
        )

        if (result.success) {
          operation.status = 'synced'
          this.state.lastSyncAt = Date.now()
        } else if (this.isNetworkError(result.error || '')) {
          // Network error - stop processing
          operation.status = 'queued'
          await this.saveQueue(queue)
          break
        } else {
          // Non-network error - mark as failed
          operation.status = 'failed'
          operation.last_error = result.error || 'Unknown error'
          operation.retries++
        }
      } catch (error) {
        // Timeout or network error - stop processing
        operation.status = 'queued'
        await this.saveQueue(queue)
        break
      }

      await this.saveQueue(queue)
    }

    // Clean up synced operations
    const cleanedQueue = queue.filter(op => op.status !== 'synced')
    await this.saveQueue(cleanedQueue)

    this.isSyncing = false
    this.notifyListeners()
  }

  async retryFailed(): Promise<void> {
    const queue = await this.getQueue()
    let hasChanges = false

    for (const op of queue) {
      if (op.status === 'failed') {
        op.status = 'queued'
        hasChanges = true
      }
    }

    if (hasChanges) {
      await this.saveQueue(queue)
      this.processSyncQueue()
    }
  }

  async clearSynced(): Promise<void> {
    const queue = await this.getQueue()
    const filtered = queue.filter(op => op.status !== 'synced')
    await this.saveQueue(filtered)
  }

  getState(): SyncState {
    return { ...this.state }
  }
}

export const syncEngine = new OfflineSyncEngine()
