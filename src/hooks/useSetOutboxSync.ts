import { useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import {
  getSetOutbox,
  removeSetOutboxItem,
  SetOutboxItem,
} from '@/lib/setOutbox'

const SYNC_INTERVAL_MS = 5000
const DEV_MODE = import.meta.env.DEV

function log(...args: unknown[]) {
  if (DEV_MODE) {
    console.log('[SetOutboxSync]', ...args)
  }
}

export function useSetOutboxSync() {
  const { user } = useAuth()
  const isSyncingRef = useRef(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const processItem = useCallback(async (item: SetOutboxItem): Promise<boolean> => {
    try {
      if (item.type === 'UPSERT_SET') {
        log('Processing UPSERT_SET:', item.set_id, item.payload)
        
        const { error } = await supabase
          .from('sets')
          .update({
            ...(item.payload.weight !== undefined && { weight: item.payload.weight }),
            ...(item.payload.reps !== undefined && { reps: item.payload.reps }),
            ...(item.payload.rpe !== undefined && { rpe: item.payload.rpe }),
            ...(item.payload.is_completed !== undefined && { is_completed: item.payload.is_completed }),
          })
          .eq('id', item.set_id)
        
        if (error) {
          // Check if set doesn't exist (might be temporary ID)
          if (error.code === 'PGRST116') {
            log('Set not found, removing from outbox:', item.set_id)
            return true // Remove from outbox, can't sync non-existent set
          }
          throw error
        }
        
        log('UPSERT_SET success:', item.set_id)
        return true
      }
      
      if (item.type === 'DELETE_SET') {
        log('Processing DELETE_SET:', item.set_id)
        
        const { error } = await supabase
          .from('sets')
          .delete()
          .eq('id', item.set_id)
        
        if (error && error.code !== 'PGRST116') {
          throw error
        }
        
        log('DELETE_SET success:', item.set_id)
        return true
      }
      
      return false
    } catch (error) {
      log('Error processing item:', item.id, error)
      return false
    }
  }, [])

  const flushOutbox = useCallback(async (): Promise<{ success: number; failed: number }> => {
    if (isSyncingRef.current || !navigator.onLine || !user) {
      return { success: 0, failed: 0 }
    }

    isSyncingRef.current = true
    let success = 0
    let failed = 0

    try {
      const items = getSetOutbox()
      
      if (items.length === 0) {
        return { success: 0, failed: 0 }
      }

      log('Flushing', items.length, 'items')

      for (const item of items) {
        const ok = await processItem(item)
        if (ok) {
          removeSetOutboxItem(item.id)
          success++
        } else {
          failed++
        }
      }

      log('Flush complete:', { success, failed })
    } finally {
      isSyncingRef.current = false
    }

    return { success, failed }
  }, [user, processItem])

  // Run sync on interval
  useEffect(() => {
    if (!user) return

    // Initial sync
    flushOutbox()

    // Periodic sync
    intervalRef.current = setInterval(flushOutbox, SYNC_INTERVAL_MS)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [user, flushOutbox])

  // Sync on online
  useEffect(() => {
    const handleOnline = () => {
      log('Online detected, flushing...')
      flushOutbox()
    }

    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
  }, [flushOutbox])

  // Sync on visibility change
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        flushOutbox()
      }
    }

    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [flushOutbox])

  return { flushOutbox }
}
