import { supabase } from '@/integrations/supabase/client'
import type { QueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/queryKeys'

export interface LastExercisePerformanceSet {
  set_index: number
  weight: number
  reps: number
  rpe: number | null
}

export interface LastExercisePerformanceResult {
  sourceSessionId: string
  sourceSessionExerciseId: string
  sets: LastExercisePerformanceSet[]
}

interface GetLastExercisePerformanceParams {
  userId: string
  exerciseId: string
  exerciseName: string
  activeSessionId?: string | null
  queryClient?: QueryClient
  isDebug?: boolean
}

function normalizeExerciseName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

function logDebug({ isDebug, message, payload }: { isDebug?: boolean; message: string; payload?: unknown }) {
  if (!isDebug) return
  if (payload !== undefined) console.log(message, payload)
  else console.log(message)
}

export async function getLastExercisePerformance({
  userId,
  exerciseId,
  exerciseName,
  activeSessionId,
  queryClient,
  isDebug,
}: GetLastExercisePerformanceParams): Promise<LastExercisePerformanceResult | null> {
  if (!userId || !exerciseId) return null

  const normalizedName = normalizeExerciseName(exerciseName)
  const cacheKey = queryKeys.exercises.lastExercisePerformance(userId, exerciseId, normalizedName)

  const cached = queryClient?.getQueryData<LastExercisePerformanceResult | null>(cacheKey)
  if (!navigator.onLine) return cached ?? null
  if (cached) return cached

  // A) fast path: by exercise_id
  let stageAQuery = supabase
    .from('session_exercises')
    .select(
      `
      id,
      exercise:exercises(name),
      session:sessions!inner(id, user_id, status, completed_at)
    `.trim()
    )
    .eq('exercise_id', exerciseId)
    .eq('sessions.user_id', userId)
    .in('sessions.status', ['completed', 'completed_pending'])
    .order('sessions(completed_at)', { ascending: false })
    .limit(1)

  if (activeSessionId) stageAQuery = stageAQuery.neq('sessions.id', activeSessionId)

  const { data: stageA, error: stageAError } = await stageAQuery.maybeSingle()
  logDebug({
    isDebug,
    message: '[Prev lookup A by exercise_id]',
    payload: stageA ? 'found' : stageAError ? `error: ${stageAError.message}` : 'not found',
  })

  interface StageRow {
    id: string
    exercise: { name: string } | null
    session: { id: string; completed_at: string | null } | null
  }

  let source = (stageA as unknown as StageRow | null) ?? null

  // B) fallback: match by normalized name among recent completed session_exercises
  if (!source) {
    let stageBQuery = supabase
      .from('session_exercises')
      .select(
        `
        id,
        exercise:exercises(name),
        session:sessions!inner(id, user_id, status, completed_at)
      `.trim()
      )
      .eq('sessions.user_id', userId)
      .in('sessions.status', ['completed', 'completed_pending'])
      .order('sessions(completed_at)', { ascending: false })
      .limit(50)

    if (activeSessionId) stageBQuery = stageBQuery.neq('sessions.id', activeSessionId)

    const { data: stageB, error: stageBError } = await stageBQuery
    if (stageBError) {
      logDebug({ isDebug, message: '[Prev lookup B by name fallback] error', payload: stageBError.message })
      return null
    }

    const rows = (stageB as unknown as StageRow[] | null) ?? []

    source =
      rows.find((row) => {
        const name = row.exercise?.name
        if (!name) return false
        return normalizeExerciseName(name) === normalizedName
      }) ?? null

    logDebug({
      isDebug,
      message: '[Prev lookup B by name fallback]',
      payload: source ? 'found' : 'not found',
    })
  }

  if (!source?.session?.id) return null

  logDebug({
    isDebug,
    message: '[Prev source session]',
    payload: { sessionId: source.session.id, sessionExerciseId: source.id },
  })

  const { data: setsData, error: setsError } = await supabase
    .from('sets')
    .select('set_index, weight, reps, rpe')
    .eq('session_exercise_id', source.id)
    .order('set_index')

  if (setsError || !setsData || setsData.length === 0) return null

  const result: LastExercisePerformanceResult = {
    sourceSessionId: source.session.id,
    sourceSessionExerciseId: source.id,
    sets: setsData.map((s) => ({
      set_index: s.set_index,
      weight: s.weight,
      reps: s.reps,
      rpe: s.rpe,
    })),
  }

  queryClient?.setQueryData(cacheKey, result)
  return result
}
