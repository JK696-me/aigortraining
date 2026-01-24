import { useCallback, useEffect, useRef } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from 'sonner'
import { useLanguage } from '@/contexts/LanguageContext'
import {
  getSessionOutbox,
  removeSessionOutboxItem,
  type SessionOutboxItem,
} from '@/lib/sessionOutbox'
import { calculateProgressionForSession } from '@/lib/progression'

export function useSessionOutboxSync() {
  const { user } = useAuth()
  const { locale } = useLanguage()
  const isSyncingRef = useRef(false)

  const syncOutbox = useCallback(async () => {
    if (!user) return
    if (!navigator.onLine) return
    if (isSyncingRef.current) return

    const items = getSessionOutbox()
    if (items.length === 0) return

    isSyncingRef.current = true
    let synced = 0

    for (const item of items) {
      const result = await processItem({ item, userId: user.id })
      if (!result.ok) continue
      removeSessionOutboxItem(item.id)
      synced++
    }

    isSyncingRef.current = false

    if (synced > 0) {
      toast.success(locale === 'ru' ? 'Синхронизировано' : 'Synced', { duration: 1500 })
    }
  }, [user, locale])

  useEffect(() => {
    if (!user) return
    if (!navigator.onLine) return
    const timeout = setTimeout(syncOutbox, 1000)
    return () => clearTimeout(timeout)
  }, [user, syncOutbox])

  useEffect(() => {
    const handleOnline = () => syncOutbox()
    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
  }, [syncOutbox])

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') syncOutbox()
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [syncOutbox])

  return { syncOutbox }
}

async function processItem({
  item,
  userId,
}: {
  item: SessionOutboxItem
  userId: string
}): Promise<{ ok: boolean }> {
  if (item.type === 'TOUCH_SESSION_ACTIVITY') {
    const sessionId = item.payload.sessionId as string | undefined
    const lastActivityAt = item.payload.lastActivityAt as string | undefined
    if (!sessionId || !lastActivityAt) return { ok: true }

    const { error } = await supabase
      .from('sessions')
      .update({ last_activity_at: lastActivityAt })
      .eq('id', sessionId)

    if (error) return { ok: false }
    return { ok: true }
  }

  if (item.type === 'AUTO_COMPLETE_SESSION') {
    const sessionId = item.payload.sessionId as string | undefined
    const completedAt = item.payload.completedAt as string | undefined
    if (!sessionId || !completedAt) return { ok: true }

    // Ensure progression computed before finalizing
    await calculateProgressionForSession(sessionId, userId)

    const { error } = await supabase
      .from('sessions')
      .update({
        status: 'completed',
        completed_at: completedAt,
        timer_running: false,
        auto_completed: true,
      })
      .eq('id', sessionId)

    if (error) return { ok: false }
    return { ok: true }
  }

  return { ok: true }
}
