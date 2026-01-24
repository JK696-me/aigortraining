import { useCallback } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { enqueueSessionOutboxItem } from '@/lib/sessionOutbox'
import { useActiveSessionCache } from '@/hooks/useActiveSessionCache'

export function useTouchSessionActivity({
  sessionId,
}: {
  sessionId: string | null
}): { touch: () => void } {
  const { touchSessionActivityOptimistic } = useActiveSessionCache(sessionId)

  const touch = useCallback(() => {
    if (!sessionId) return

    const lastActivityAt = new Date().toISOString()
    touchSessionActivityOptimistic(lastActivityAt)

    if (!navigator.onLine) {
      enqueueSessionOutboxItem({
        type: 'TOUCH_SESSION_ACTIVITY',
        payload: { sessionId, lastActivityAt },
      })
      return
    }

    supabase
      .from('sessions')
      .update({ last_activity_at: lastActivityAt })
      .eq('id', sessionId)
  }, [sessionId, touchSessionActivityOptimistic])

  return { touch }
}
