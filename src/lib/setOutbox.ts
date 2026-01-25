// Set-level outbox for reliable data persistence
// Ensures all set updates (weight, reps, RPE) are synced to server

export interface SetOutboxItem {
  id: string
  set_id: string
  session_exercise_id: string
  type: 'UPSERT_SET' | 'DELETE_SET'
  payload: {
    set_index?: number
    weight?: number
    reps?: number
    rpe?: number | null
    is_completed?: boolean
  }
  created_at: string
  updated_at: string
}

const SET_OUTBOX_KEY = 'set_outbox_v1'

export function getSetOutbox(): SetOutboxItem[] {
  try {
    const raw = localStorage.getItem(SET_OUTBOX_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed as SetOutboxItem[]
  } catch {
    return []
  }
}

export function setSetOutbox(items: SetOutboxItem[]) {
  localStorage.setItem(SET_OUTBOX_KEY, JSON.stringify(items))
}

// Enqueue or merge a set update (deduplication by set_id)
export function enqueueSetUpdate(
  setId: string,
  sessionExerciseId: string,
  updates: Partial<SetOutboxItem['payload']>
): SetOutboxItem {
  const items = getSetOutbox()
  const now = new Date().toISOString()
  
  // Find existing item for this set_id
  const existingIndex = items.findIndex(i => i.set_id === setId && i.type === 'UPSERT_SET')
  
  if (existingIndex >= 0) {
    // Merge updates into existing item
    const existing = items[existingIndex]
    const merged: SetOutboxItem = {
      ...existing,
      payload: { ...existing.payload, ...updates },
      updated_at: now,
    }
    items[existingIndex] = merged
    setSetOutbox(items)
    return merged
  }
  
  // Create new item
  const item: SetOutboxItem = {
    id: crypto.randomUUID(),
    set_id: setId,
    session_exercise_id: sessionExerciseId,
    type: 'UPSERT_SET',
    payload: updates,
    created_at: now,
    updated_at: now,
  }
  
  setSetOutbox([...items, item])
  return item
}

export function enqueueSetDelete(setId: string, sessionExerciseId: string): SetOutboxItem {
  const items = getSetOutbox()
  const now = new Date().toISOString()
  
  // Remove any pending updates for this set
  const filtered = items.filter(i => i.set_id !== setId)
  
  const item: SetOutboxItem = {
    id: crypto.randomUUID(),
    set_id: setId,
    session_exercise_id: sessionExerciseId,
    type: 'DELETE_SET',
    payload: {},
    created_at: now,
    updated_at: now,
  }
  
  setSetOutbox([...filtered, item])
  return item
}

export function removeSetOutboxItem(itemId: string) {
  const items = getSetOutbox()
  setSetOutbox(items.filter(i => i.id !== itemId))
}

export function removeSetOutboxBySetId(setId: string) {
  const items = getSetOutbox()
  setSetOutbox(items.filter(i => i.set_id !== setId))
}

export function clearSetOutboxForSession(sessionExerciseId: string) {
  const items = getSetOutbox()
  setSetOutbox(items.filter(i => i.session_exercise_id !== sessionExerciseId))
}

export function getDirtySetCount(): number {
  return getSetOutbox().length
}

export function hasUnflushedSets(): boolean {
  return getSetOutbox().length > 0
}
