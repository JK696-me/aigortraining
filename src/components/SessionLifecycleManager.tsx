import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useWorkout } from '@/contexts/WorkoutContext'
import { useActiveSessionCache } from '@/hooks/useActiveSessionCache'
import { toast } from 'sonner'
import { useLanguage } from '@/contexts/LanguageContext'
import { enqueueSessionOutboxItem } from '@/lib/sessionOutbox'
import { useAuth } from '@/contexts/AuthContext'
import { queryKeys } from '@/lib/queryKeys'
import { useQueryClient } from '@tanstack/react-query'
import type { SessionListItem } from '@/hooks/useHistorySessions'
import { calculateProgressionForSession } from '@/lib/progression'
import { supabase } from '@/integrations/supabase/client'

const INACTIVITY_MS = 30 * 60 * 1000

export function SessionLifecycleManager() {
  const { activeSessionId, clearDraft } = useWorkout()
  const { user } = useAuth()
  const { locale } = useLanguage()
  const queryClient = useQueryClient()
  const { session, setSessionStatusOptimistic } = useActiveSessionCache(activeSessionId)

  const timerRef = useRef<number | null>(null)

  const lastActivityAt = useMemo(() => {
    if (!session?.last_activity_at) return null
    const ms = new Date(session.last_activity_at).getTime()
    return Number.isFinite(ms) ? ms : null
  }, [session?.last_activity_at])

  const deadlineMs = useMemo(() => {
    if (!lastActivityAt) return null
    return lastActivityAt + INACTIVITY_MS
  }, [lastActivityAt])

  const isDraftNonEmpty = useMemo(() => {
    if (!session) return false

    for (const ex of session.exercises) {
      for (const s of ex.sets) {
        if (s.is_completed) return true
        if (s.weight > 0) return true
        if (s.reps > 0) return true
        if (s.rpe !== null) return true
      }
    }

    return false
  }, [session])

  const runAutoComplete = useCallback(async () => {
    if (!activeSessionId) return
    if (!user) return
    if (!session) return
    if (session.status !== 'draft') return
    if (!session.last_activity_at) return

    const completedAt = session.last_activity_at

    // Re-check deadline
    const isDeadlineReached = Date.now() >= new Date(completedAt).getTime() + INACTIVITY_MS
    if (!isDeadlineReached) return

    if (!isDraftNonEmpty) {
      toast(locale === 'ru' ? 'Черновик тренировки неактивен' : 'Workout draft is inactive', {
        duration: 2000,
        action: {
          label: locale === 'ru' ? 'Удалить черновик' : 'Delete draft',
          onClick: () => {
            clearDraft()
          },
        },
      })
      return
    }

    // PHASE A (optimistic): completed_pending + add to history + clear active draft
    setSessionStatusOptimistic({
      status: 'completed_pending',
      auto_completed: true,
    })

    const optimisticSession: SessionListItem & { _pending?: boolean; _auto_completed?: boolean } = {
      id: activeSessionId,
      date: session.date,
      completed_at: completedAt,
      undo_available_until: null,
      source: session.source,
      template_id: session.template_id,
      template_name: null,
      exercise_count: session.exercises.length,
      set_count: session.exercises.reduce((sum, ex) => sum + ex.sets.length, 0),
      _pending: true,
      _auto_completed: true,
    }

    queryClient.setQueryData(
      queryKeys.sessions.completedList(user.id),
      (oldData: { pages: { data: SessionListItem[]; nextCursor: string | null }[]; pageParams: (string | null)[] } | undefined) => {
        if (!oldData) {
          return {
            pages: [{ data: [optimisticSession], nextCursor: null }],
            pageParams: [null],
          }
        }
        return {
          ...oldData,
          pages: oldData.pages.map((page, idx) =>
            idx === 0
              ? { ...page, data: [optimisticSession, ...page.data.filter(s => s.id !== activeSessionId)] }
              : page
          ),
        }
      }
    )

    await clearDraft()

    toast.success(
      locale === 'ru'
        ? 'Тренировка завершена автоматически (нет действий 30 мин).'
        : 'Workout was auto-completed (30m inactivity).',
      { duration: 1500 }
    )

    // PHASE B: sync now or queue
    if (!navigator.onLine) {
      enqueueSessionOutboxItem({
        type: 'AUTO_COMPLETE_SESSION',
        payload: { sessionId: activeSessionId, completedAt },
      })
      toast(locale === 'ru' ? 'Сохранено локально' : 'Saved locally', { duration: 1500 })
      return
    }

    try {
      await calculateProgressionForSession(activeSessionId, user.id)
      const { error } = await supabase
        .from('sessions')
        .update({
          status: 'completed',
          completed_at: completedAt,
          timer_running: false,
          auto_completed: true,
        })
        .eq('id', activeSessionId)

      if (error) throw error

      // Remove pending flag in history cache
      queryClient.setQueryData(
        queryKeys.sessions.completedList(user.id),
        (oldData: { pages: { data: (SessionListItem & { _pending?: boolean })[]; nextCursor: string | null }[]; pageParams: (string | null)[] } | undefined) => {
          if (!oldData) return oldData
          return {
            ...oldData,
            pages: oldData.pages.map(page => ({
              ...page,
              data: page.data.map(s => (s.id === activeSessionId ? { ...s, _pending: undefined } : s)),
            })),
          }
        }
      )
    } catch {
      enqueueSessionOutboxItem({
        type: 'AUTO_COMPLETE_SESSION',
        payload: { sessionId: activeSessionId, completedAt },
      })
    }
  }, [activeSessionId, user, session, isDraftNonEmpty, locale, clearDraft, queryClient, setSessionStatusOptimistic])

  // Keep one timer to deadline
  useEffect(() => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }

    if (!activeSessionId) return
    if (!session) return
    if (session.status !== 'draft') return
    if (!deadlineMs) return

    const delay = Math.max(0, deadlineMs - Date.now())
    timerRef.current = window.setTimeout(() => {
      runAutoComplete()
    }, delay)

    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [activeSessionId, session, deadlineMs, runAutoComplete])

  // If app was backgrounded past deadline, trigger immediately on resume
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return
      if (!deadlineMs) return
      if (Date.now() >= deadlineMs) runAutoComplete()
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [deadlineMs, runAutoComplete])

  return null
}
