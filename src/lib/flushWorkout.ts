import { supabase } from '@/integrations/supabase/client'
import { getSetOutbox, setSetOutbox, SetOutboxItem } from '@/lib/setOutbox'

interface CachedSetForFlush {
  id: string
  session_exercise_id: string
  set_index: number
  weight: number
  reps: number
  is_completed: boolean
  rpe: number | null
}

interface FlushResult {
  flushed: number
  failed: number
  offline: boolean
}

/**
 * Flush ALL sets from the active session cache to the database in a single batch.
 * This MUST be called before marking a session as completed to prevent data loss.
 *
 * Strategy:
 * 1. Collect all sets from the session cache
 * 2. Drain the setOutbox (merge any pending updates)
 * 3. Batch upsert all sets by set.id
 * 4. If offline → enqueue everything into the outbox for later sync
 */
export async function flushWorkout(
  sets: CachedSetForFlush[],
  isOnline: boolean
): Promise<FlushResult> {
  if (sets.length === 0) return { flushed: 0, failed: 0, offline: false }

  // 1. Merge any pending outbox updates into the set data
  const outbox = getSetOutbox()
  const outboxBySetId = new Map<string, SetOutboxItem>()
  for (const item of outbox) {
    if (item.type === 'UPSERT_SET') {
      outboxBySetId.set(item.set_id, item)
    }
  }

  const mergedSets = sets.map(s => {
    const pending = outboxBySetId.get(s.id)
    if (!pending) return s
    return {
      ...s,
      weight: pending.payload.weight ?? s.weight,
      reps: pending.payload.reps ?? s.reps,
      rpe: pending.payload.rpe !== undefined ? pending.payload.rpe : s.rpe,
      is_completed: pending.payload.is_completed ?? s.is_completed,
    }
  })

  // 2. If offline → enqueue all sets into outbox and return
  if (!isOnline || !navigator.onLine) {
    const now = new Date().toISOString()
    // Clear existing outbox items for these sets, replace with full data
    const existingOutbox = getSetOutbox()
    const flushSetIds = new Set(mergedSets.map(s => s.id))
    const otherItems = existingOutbox.filter(i => !flushSetIds.has(i.set_id))

    const newItems: SetOutboxItem[] = mergedSets.map(s => ({
      id: crypto.randomUUID(),
      set_id: s.id,
      session_exercise_id: s.session_exercise_id,
      type: 'UPSERT_SET' as const,
      payload: {
        weight: s.weight,
        reps: s.reps,
        rpe: s.rpe,
        is_completed: s.is_completed,
      },
      created_at: now,
      updated_at: now,
    }))

    setSetOutbox([...otherItems, ...newItems])

    console.log('[flushWorkout] Offline — enqueued', mergedSets.length, 'sets to outbox')
    return { flushed: 0, failed: 0, offline: true }
  }

  // 3. Online: batch upsert all sets by set.id
  let flushed = 0
  let failed = 0

  // Supabase upsert supports batch — use it
  const upsertPayload = mergedSets.map(s => ({
    id: s.id,
    session_exercise_id: s.session_exercise_id,
    set_index: s.set_index,
    weight: s.weight,
    reps: s.reps,
    rpe: s.rpe,
    is_completed: s.is_completed,
  }))

  try {
    const { error } = await supabase
      .from('sets')
      .upsert(upsertPayload, { onConflict: 'id' })

    if (error) {
      console.error('[flushWorkout] Batch upsert failed:', error)
      // Fallback: try one by one
      for (const payload of upsertPayload) {
        try {
          const { error: singleError } = await supabase
            .from('sets')
            .upsert(payload, { onConflict: 'id' })
          
          if (singleError) {
            console.error('[flushWorkout] Single upsert failed for set', payload.id, singleError)
            failed++
          } else {
            flushed++
          }
        } catch {
          failed++
        }
      }
    } else {
      flushed = mergedSets.length
    }
  } catch (e) {
    console.error('[flushWorkout] Network error:', e)
    // Treat as offline
    return flushWorkout(sets, false)
  }

  // 4. Clear outbox items for successfully flushed sets
  if (flushed > 0) {
    const flushedIds = new Set(mergedSets.map(s => s.id))
    const remaining = getSetOutbox().filter(i => !flushedIds.has(i.set_id))
    setSetOutbox(remaining)
  }

  console.log('[flushWorkout] Flushed', flushed, 'sets, failed:', failed)
  return { flushed, failed, offline: false }
}
