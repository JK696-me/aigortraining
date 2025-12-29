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
  next_retry_at?: number
  local_id?: string
  server_id?: string
  depends_on?: Dependency[]
  local_updated_at?: number
}

export interface SyncState {
  isOnline: boolean
  pendingCount: number
  syncingCount: number
  failedCount: number
  lastSyncAt: number | null
  hasConflict: boolean
  conflictMessage?: string
}

export type IdMap = Record<string, string>

const QUEUE_PREFIX = 'op_queue_'
const ID_MAP_PREFIX = 'id_map_'
const SYNC_TIMEOUT = 10000

// Exponential backoff delays in ms: 2s, 5s, 15s, 30s, 60s
const RETRY_DELAYS = [2000, 5000, 15000, 30000, 60000]
const MAX_RETRIES = 5

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
  private retryTimeoutId: NodeJS.Timeout | null = null
  private state: SyncState = {
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    pendingCount: 0,
    syncingCount: 0,
    failedCount: 0,
    lastSyncAt: null,
    hasConflict: false,
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

  // Generate dedup key for merging updates
  private getDedupeKey(entity: EntityType, action: ActionType, payload: Record<string, unknown>): string | null {
    if (action !== 'update') return null
    
    const id = payload.id as string
    if (!id) return null

    // Special handling for sets - dedupe by session_exercise_id + set_index
    if (entity === 'sets') {
      const sessionExerciseId = payload.session_exercise_id as string
      const setIndex = payload.set_index as number
      if (sessionExerciseId !== undefined && setIndex !== undefined) {
        return `sets:${sessionExerciseId}:${setIndex}`
      }
    }

    return `${entity}:${id}`
  }

  private areDependenciesResolved(operation: SyncOperation): boolean {
    if (!operation.depends_on || operation.depends_on.length === 0) return true
    return operation.depends_on.every(dep => {
      const serverId = this.getServerId(dep.entity, dep.local_id)
      return !!serverId
    })
  }

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
    const localUpdatedAt = Date.now()

    // For create operations, ensure we have an id in payload for idempotency
    if (action === 'create' && !payload.id) {
      payload = { ...payload, id: localId }
    }

    // Add updated_at to payload for versioning
    if (action === 'create' || action === 'update') {
      payload = { ...payload, updated_at: new Date().toISOString() }
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
            if (action === 'create') {
              await this.setIdMapping(entity, localId, localId)
            }
            this.state.lastSyncAt = Date.now()
            this.notifyListeners()
            return { success: true, synced: true, id: localId }
          }
          
          // Check for duplicate key error on create - treat as success
          if (action === 'create' && result.error?.includes('duplicate key')) {
            await this.setIdMapping(entity, localId, localId)
            return { success: true, synced: true, id: localId }
          }
          
          if (result.error && !this.isNetworkError(result.error)) {
            return { success: false, synced: false, error: result.error }
          }
        } catch (error) {
          console.log('Operation failed, queueing for later:', error)
        }
      }
    }

    // Get queue and handle deduplication
    const queue = await this.getQueue()
    const dedupeKey = this.getDedupeKey(entity, action, payload)
    
    if (dedupeKey && action === 'update') {
      // Find existing update operation for same entity+id
      const existingIndex = queue.findIndex(op => {
        if (op.action !== 'update' || op.entity !== entity) return false
        const opDedupeKey = this.getDedupeKey(op.entity, op.action, op.payload)
        return opDedupeKey === dedupeKey
      })

      if (existingIndex >= 0) {
        // Merge payloads - keep last values
        const existing = queue[existingIndex]
        existing.payload = { ...existing.payload, ...payload }
        existing.local_updated_at = localUpdatedAt
        existing.created_at = Date.now() // Update timestamp to latest
        existing.status = 'queued' // Reset status if it was failed
        existing.last_error = null
        await this.saveQueue(queue)
        return { success: true, synced: false, id: localId }
      }
    }

    // Check for duplicate idempotency key
    const existingIndex = queue.findIndex(op => op.idempotency_key === idemKey)
    if (existingIndex >= 0) {
      return { success: true, synced: false, id: localId }
    }

    // Queue the new operation
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
      local_updated_at: localUpdatedAt,
    }

    queue.push(operation)
    await this.saveQueue(queue)

    if (action === 'create') {
      await this.setIdMapping(entity, localId, localId)
    }

    return { success: true, synced: false, id: localId }
  }

  private async executeWithTimeout(
    entity: EntityType,
    action: ActionType,
    payload: Record<string, unknown>
  ): Promise<{ success: boolean; error?: string; serverId?: string; serverUpdatedAt?: string }> {
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
  ): Promise<{ success: boolean; error?: string; serverId?: string; serverUpdatedAt?: string }> {
    try {
      let result
      const table = supabase.from(entity)

      switch (action) {
        case 'create':
          // First check if record already exists (idempotency)
          const existingCheck = await table.select('id').eq('id', payload.id as string).maybeSingle()
          if (existingCheck.data) {
            // Record already exists - treat as success
            return { success: true, serverId: payload.id as string }
          }
          result = await table.upsert(payload as never, { onConflict: 'id' }).select('id, updated_at').single()
          break
        case 'update':
          const { id, ...updateData } = payload
          result = await table.update(updateData as never).eq('id', id as string).select('id, updated_at').single()
          break
        case 'delete':
          result = await table.delete().eq('id', payload.id as string)
          break
      }

      if (result.error) {
        return { success: false, error: result.error.message }
      }

      const data = result.data as { id: string; updated_at?: string } | null
      return { 
        success: true, 
        serverId: data?.id || (payload.id as string),
        serverUpdatedAt: data?.updated_at
      }
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

  private isConflictError(error: string): boolean {
    const conflictPatterns = ['conflict', 'concurrent', 'modified', 'stale']
    const lowerError = error.toLowerCase()
    return conflictPatterns.some(pattern => lowerError.includes(pattern))
  }

  private getNextRetryDelay(retries: number): number {
    const index = Math.min(retries, RETRY_DELAYS.length - 1)
    return RETRY_DELAYS[index]
  }

  private sortOperationsByDependency(operations: SyncOperation[]): SyncOperation[] {
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
    const now = Date.now()
    
    // Filter operations that are ready to process
    const toProcess = queue.filter(op => {
      if (op.status === 'synced' || op.status === 'syncing') return false
      if (op.status === 'failed' && op.retries >= MAX_RETRIES) return false
      if (op.next_retry_at && op.next_retry_at > now) return false
      return op.status === 'queued' || op.status === 'failed'
    })
    
    const sorted = this.sortOperationsByDependency(toProcess)
    let madeProgress = true
    let earliestRetry: number | null = null

    while (madeProgress && this.state.isOnline) {
      madeProgress = false
      
      for (const operation of sorted) {
        if (!this.state.isOnline) break
        if (operation.status === 'synced' || operation.status === 'syncing') continue

        if (!this.areDependenciesResolved(operation)) {
          continue
        }

        // Update status to syncing
        operation.status = 'syncing'
        queue = await this.getQueue()
        const queueOp = queue.find(op => op.op_id === operation.op_id)
        if (queueOp) queueOp.status = 'syncing'
        await this.saveQueue(queue)

        try {
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
            
            if (operation.action === 'create' && operation.local_id && result.serverId) {
              await this.setIdMapping(operation.entity, operation.local_id, result.serverId)
            }
            
            this.state.lastSyncAt = Date.now()
            madeProgress = true
          } else if (this.isNetworkError(result.error || '')) {
            // Network error - stop processing, will retry on online
            if (updatedOp) updatedOp.status = 'queued'
            operation.status = 'queued'
            await this.saveQueue(queue)
            this.isSyncing = false
            return
          } else if (this.isConflictError(result.error || '')) {
            // Conflict - handle LWW
            await this.handleConflict(operation, updatedOp, queue)
          } else {
            // Non-network error - mark as failed with retry
            if (updatedOp) {
              updatedOp.status = 'failed'
              updatedOp.last_error = result.error || 'Unknown error'
              updatedOp.retries++
              if (updatedOp.retries < MAX_RETRIES) {
                updatedOp.next_retry_at = Date.now() + this.getNextRetryDelay(updatedOp.retries)
                if (!earliestRetry || updatedOp.next_retry_at < earliestRetry) {
                  earliestRetry = updatedOp.next_retry_at
                }
              }
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

    // Schedule next retry if needed
    if (earliestRetry && this.state.isOnline) {
      const delay = Math.max(0, earliestRetry - Date.now())
      this.scheduleRetry(delay)
    }
  }

  private async handleConflict(
    operation: SyncOperation,
    queueOp: SyncOperation | undefined,
    queue: SyncOperation[]
  ): Promise<void> {
    // LWW: Refetch server data and notify user
    try {
      const table = supabase.from(operation.entity)
      const { data: serverData } = await table
        .select('*')
        .eq('id', operation.payload.id as string)
        .single()

      if (serverData) {
        // Server has data - show conflict notification
        this.state.hasConflict = true
        this.state.conflictMessage = 'Данные обновлены с другого устройства'
        this.notifyListeners()

        // Mark operation as failed for user to decide
        if (queueOp) {
          queueOp.status = 'failed'
          queueOp.last_error = 'Конфликт: данные были изменены на сервере'
          queueOp.retries++
        }
        operation.status = 'failed'
      }
    } catch (error) {
      console.error('Failed to handle conflict:', error)
      if (queueOp) {
        queueOp.status = 'failed'
        queueOp.last_error = 'Ошибка обработки конфликта'
      }
    }
  }

  private scheduleRetry(delay: number) {
    if (this.retryTimeoutId) {
      clearTimeout(this.retryTimeoutId)
    }
    this.retryTimeoutId = setTimeout(() => {
      this.processSyncQueue()
    }, delay)
  }

  clearConflict() {
    this.state.hasConflict = false
    this.state.conflictMessage = undefined
    this.notifyListeners()
  }

  async retryFailed(): Promise<void> {
    const queue = await this.getQueue()
    let hasChanges = false

    for (const op of queue) {
      if (op.status === 'failed') {
        op.status = 'queued'
        op.next_retry_at = undefined
        hasChanges = true
      }
    }

    if (hasChanges) {
      await this.saveQueue(queue)
      this.processSyncQueue()
    }
  }

  async retryOperation(opId: string): Promise<void> {
    const queue = await this.getQueue()
    const op = queue.find(o => o.op_id === opId)
    if (op && op.status === 'failed') {
      op.status = 'queued'
      op.next_retry_at = undefined
      await this.saveQueue(queue)
      this.processSyncQueue()
    }
  }

  async clearSynced(): Promise<void> {
    const queue = await this.getQueue()
    const filtered = queue.filter(op => op.status !== 'synced')
    await this.saveQueue(filtered)
  }

  getOperationStatus(entity: EntityType, localId: string): OperationStatus | 'synced' {
    const serverId = this.getServerId(entity, localId)
    if (serverId && serverId !== localId) return 'synced'
    return 'synced'
  }

  async getOperationStatusAsync(entity: EntityType, localId: string): Promise<OperationStatus | 'synced'> {
    const queue = await this.getQueue()
    const operation = queue.find(
      op => op.entity === entity && op.local_id === localId
    )
    return operation?.status || 'synced'
  }

  async getPendingOperations(entity?: EntityType): Promise<SyncOperation[]> {
    const queue = await this.getQueue()
    const pending = queue.filter(op => op.status !== 'synced')
    if (entity) {
      return pending.filter(op => op.entity === entity)
    }
    return pending
  }

  async getFailedOperations(): Promise<SyncOperation[]> {
    const queue = await this.getQueue()
    return queue.filter(op => op.status === 'failed')
  }

  async getAllOperations(): Promise<SyncOperation[]> {
    return this.getQueue()
  }

  getState(): SyncState {
    return { ...this.state }
  }

  getIdMap(): IdMap {
    return { ...this.idMap }
  }
}

export const syncEngine = new OfflineSyncEngine()
