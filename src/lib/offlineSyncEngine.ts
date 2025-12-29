import { get, set } from 'idb-keyval'
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

export interface Dependency {
  entity: EntityType
  local_id: string
}

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
  // New fields for dependency tracking
  local_id?: string
  server_id?: string
  depends_on?: Dependency[]
}

export interface SyncState {
  isOnline: boolean
  pendingCount: number
  syncingCount: number
  failedCount: number
  lastSyncAt: number | null
}

// ID mapping structure: { "<entity>:<local_id>": "<server_id>" }
export type IdMap = Record<string, string>

const QUEUE_PREFIX = 'op_queue_'
const ID_MAP_PREFIX = 'id_map_'
const SYNC_TIMEOUT = 10000 // 10 seconds

// Entity sync order (topological)
const ENTITY_SYNC_ORDER: EntityType[] = [
  'exercises',
  'sessions',
  'session_exercises',
  'sets',
  'workout_templates',
  'template_items',
  'exercise_state',
  'health_entries',
  'health_attachments',
]

// Foreign key mappings for each entity
const FOREIGN_KEY_MAPPINGS: Record<EntityType, { field: string; entity: EntityType }[]> = {
  sessions: [{ field: 'template_id', entity: 'workout_templates' }],
  session_exercises: [
    { field: 'session_id', entity: 'sessions' },
    { field: 'exercise_id', entity: 'exercises' },
  ],
  sets: [{ field: 'session_exercise_id', entity: 'session_exercises' }],
  workout_templates: [],
  template_items: [
    { field: 'template_id', entity: 'workout_templates' },
    { field: 'exercise_id', entity: 'exercises' },
  ],
  exercise_state: [{ field: 'exercise_id', entity: 'exercises' }],
  exercises: [],
  health_entries: [],
  health_attachments: [{ field: 'health_entry_id', entity: 'health_entries' }],
}

type SyncListener = (state: SyncState) => void

class OfflineSyncEngine {
  private userId: string | null = null
  private listeners: Set<SyncListener> = new Set()
  private isSyncing = false
  private idMap: IdMap = {}
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
    } else {
      this.idMap = {}
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

  private getIdMapKey(): string {
    return `${ID_MAP_PREFIX}${this.userId}`
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

  private async loadIdMap(): Promise<void> {
    if (!this.userId) return
    try {
      const map = await get<IdMap>(this.getIdMapKey())
      this.idMap = map || {}
    } catch (error) {
      console.error('Failed to load ID map:', error)
      this.idMap = {}
    }
  }

  private async saveIdMap(): Promise<void> {
    if (!this.userId) return
    try {
      await set(this.getIdMapKey(), this.idMap)
    } catch (error) {
      console.error('Failed to save ID map:', error)
    }
  }

  private getIdMapKeyForEntity(entity: EntityType, localId: string): string {
    return `${entity}:${localId}`
  }

  getServerId(entity: EntityType, localId: string): string | undefined {
    const key = this.getIdMapKeyForEntity(entity, localId)
    return this.idMap[key]
  }

  async setIdMapping(entity: EntityType, localId: string, serverId: string): Promise<void> {
    const key = this.getIdMapKeyForEntity(entity, localId)
    this.idMap[key] = serverId
    await this.saveIdMap()
  }

  private async updateState(queue?: SyncOperation[]): Promise<void> {
    const ops = queue ?? await this.getQueue()
    this.state.pendingCount = ops.filter(o => o.status === 'queued').length
    this.state.syncingCount = ops.filter(o => o.status === 'syncing').length
    this.state.failedCount = ops.filter(o => o.status === 'failed').length
    this.notifyListeners()
  }

  async loadState(): Promise<void> {
    await this.loadIdMap()
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

  // Check if an operation has all dependencies resolved
  private areDependenciesResolved(operation: SyncOperation): boolean {
    if (!operation.depends_on || operation.depends_on.length === 0) return true

    return operation.depends_on.every(dep => {
      const serverId = this.getServerId(dep.entity, dep.local_id)
      return !!serverId
    })
  }

  // Rewrite foreign keys in payload using id_map
  private rewriteForeignKeys(entity: EntityType, payload: Record<string, unknown>): Record<string, unknown> {
    const mappings = FOREIGN_KEY_MAPPINGS[entity]
    if (!mappings || mappings.length === 0) return payload

    const rewritten = { ...payload }

    for (const mapping of mappings) {
      const localId = rewritten[mapping.field] as string | undefined
      if (localId) {
        const serverId = this.getServerId(mapping.entity, localId)
        if (serverId) {
          rewritten[mapping.field] = serverId
        }
        // If no serverId found, keep local_id (might be a real server id already)
      }
    }

    return rewritten
  }

  async enqueue(
    entity: EntityType,
    action: ActionType,
    payload: Record<string, unknown>,
    idempotencyKey?: string,
    options?: {
      local_id?: string
      depends_on?: Dependency[]
    }
  ): Promise<{ success: boolean; synced: boolean; error?: string; id?: string }> {
    const opId = this.generateId()
    const idemKey = idempotencyKey || this.generateIdempotencyKey(entity, action, payload)
    const localId = options?.local_id || (payload.id as string) || this.generateId()

    // For create operations, ensure we have an id in payload for idempotency
    if (action === 'create' && !payload.id) {
      payload = { ...payload, id: localId }
    }

    // If online and no dependencies (or all resolved), try to execute immediately
    if (this.state.isOnline) {
      const hasDeps = options?.depends_on && options.depends_on.length > 0
      const depsResolved = !hasDeps || this.areDependenciesResolved({
        depends_on: options?.depends_on
      } as SyncOperation)

      if (depsResolved) {
        try {
          const rewrittenPayload = this.rewriteForeignKeys(entity, payload)
          const result = await this.executeWithTimeout(entity, action, rewrittenPayload)
          
          if (result.success) {
            // For create, store id mapping (local_id == server_id since we use deterministic id)
            if (action === 'create') {
              await this.setIdMapping(entity, localId, localId)
            }
            this.state.lastSyncAt = Date.now()
            this.notifyListeners()
            return { success: true, synced: true, id: localId }
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
      local_id: localId,
      depends_on: options?.depends_on,
    }

    const queue = await this.getQueue()
    
    // Check for duplicate idempotency key
    const existingIndex = queue.findIndex(op => op.idempotency_key === idemKey)
    if (existingIndex >= 0) {
      // Already queued, return success
      return { success: true, synced: false, id: localId }
    }

    queue.push(operation)
    await this.saveQueue(queue)

    // For create operations, pre-register the local_id mapping (will be updated on sync)
    if (action === 'create') {
      // Local id maps to itself until synced
      await this.setIdMapping(entity, localId, localId)
    }

    return { success: true, synced: false, id: localId }
  }

  private async executeWithTimeout(
    entity: EntityType,
    action: ActionType,
    payload: Record<string, unknown>
  ): Promise<{ success: boolean; error?: string; serverId?: string }> {
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
  ): Promise<{ success: boolean; error?: string; serverId?: string }> {
    try {
      let result
      const table = supabase.from(entity)

      switch (action) {
        case 'create':
          // Use upsert for idempotency - if record with this id exists, update it
          result = await table.upsert(payload as never, { onConflict: 'id' }).select('id').single()
          break
        case 'update':
          const { id, ...updateData } = payload
          result = await table.update(updateData as never).eq('id', id as string).select('id').single()
          break
        case 'delete':
          result = await table.delete().eq('id', payload.id as string)
          break
      }

      if (result.error) {
        return { success: false, error: result.error.message }
      }

      const serverId = (result.data as { id: string } | null)?.id || (payload.id as string)
      return { success: true, serverId }
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

  private sortOperationsByDependency(operations: SyncOperation[]): SyncOperation[] {
    // Sort by entity order first, then by created_at within same entity
    return [...operations].sort((a, b) => {
      const orderA = ENTITY_SYNC_ORDER.indexOf(a.entity)
      const orderB = ENTITY_SYNC_ORDER.indexOf(b.entity)
      if (orderA !== orderB) return orderA - orderB
      return a.created_at - b.created_at
    })
  }

  async processSyncQueue(): Promise<void> {
    if (this.isSyncing || !this.state.isOnline || !this.userId) return

    this.isSyncing = true
    let queue = await this.getQueue()
    const toProcess = queue
      .filter(op => op.status === 'queued' || op.status === 'failed')
    
    // Sort by dependency order
    const sorted = this.sortOperationsByDependency(toProcess)
    let madeProgress = true

    while (madeProgress && this.state.isOnline) {
      madeProgress = false
      
      for (const operation of sorted) {
        if (!this.state.isOnline) break
        if (operation.status === 'synced' || operation.status === 'syncing') continue

        // Check dependencies
        if (!this.areDependenciesResolved(operation)) {
          // Skip - dependencies not yet resolved
          continue
        }

        // Update status to syncing
        operation.status = 'syncing'
        queue = await this.getQueue()
        const queueOp = queue.find(op => op.op_id === operation.op_id)
        if (queueOp) queueOp.status = 'syncing'
        await this.saveQueue(queue)

        try {
          // Rewrite foreign keys before sending
          const rewrittenPayload = this.rewriteForeignKeys(operation.entity, operation.payload)
          
          const result = await this.executeWithTimeout(
            operation.entity,
            operation.action,
            rewrittenPayload
          )

          queue = await this.getQueue()
          const updatedOp = queue.find(op => op.op_id === operation.op_id)
          
          if (result.success) {
            if (updatedOp) {
              updatedOp.status = 'synced'
              updatedOp.server_id = result.serverId
            }
            operation.status = 'synced'
            
            // Store id mapping for creates
            if (operation.action === 'create' && operation.local_id && result.serverId) {
              await this.setIdMapping(operation.entity, operation.local_id, result.serverId)
            }
            
            this.state.lastSyncAt = Date.now()
            madeProgress = true
          } else if (this.isNetworkError(result.error || '')) {
            // Network error - stop processing
            if (updatedOp) updatedOp.status = 'queued'
            operation.status = 'queued'
            await this.saveQueue(queue)
            this.isSyncing = false
            return
          } else {
            // Non-network error - mark as failed
            if (updatedOp) {
              updatedOp.status = 'failed'
              updatedOp.last_error = result.error || 'Unknown error'
              updatedOp.retries++
            }
            operation.status = 'failed'
          }
        } catch (error) {
          // Timeout or network error - stop processing
          queue = await this.getQueue()
          const failedOp = queue.find(op => op.op_id === operation.op_id)
          if (failedOp) failedOp.status = 'queued'
          operation.status = 'queued'
          await this.saveQueue(queue)
          this.isSyncing = false
          return
        }

        await this.saveQueue(queue)
      }
    }

    // Clean up synced operations
    queue = await this.getQueue()
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

  // Get sync status for a specific local_id
  getOperationStatus(entity: EntityType, localId: string): OperationStatus | 'synced' {
    // If we have a server_id that's different from local_id, it's fully synced
    const serverId = this.getServerId(entity, localId)
    if (serverId && serverId !== localId) return 'synced'
    
    // Otherwise check the queue
    // We need to check synchronously from cached state
    return 'synced' // Default - actual check done async
  }

  async getOperationStatusAsync(entity: EntityType, localId: string): Promise<OperationStatus | 'synced'> {
    const queue = await this.getQueue()
    const operation = queue.find(
      op => op.entity === entity && op.local_id === localId
    )
    return operation?.status || 'synced'
  }

  // Get all pending operations for an entity type
  async getPendingOperations(entity?: EntityType): Promise<SyncOperation[]> {
    const queue = await this.getQueue()
    const pending = queue.filter(op => op.status !== 'synced')
    if (entity) {
      return pending.filter(op => op.entity === entity)
    }
    return pending
  }

  getState(): SyncState {
    return { ...this.state }
  }

  getIdMap(): IdMap {
    return { ...this.idMap }
  }
}

export const syncEngine = new OfflineSyncEngine()
