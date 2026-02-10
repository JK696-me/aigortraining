import { supabase } from '@/integrations/supabase/client'

export interface LoggedSet {
  set_index: number
  weight: number
  reps: number
  rpe: number | null
}

export interface LastLoggedSetsResult {
  sessionId: string
  sessionExerciseId: string
  completedAt: string
  sets: LoggedSet[]
  matchMethod: 'exercise_id' | 'name_fallback'
}

interface GetLastLoggedSetsParams {
  userId: string
  exerciseId: string
  exerciseName?: string
  excludeSessionId?: string | null
}

function normalizeExerciseName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

/**
 * Returns sets from the last completed session containing this exercise.
 *
 * Stage 1: exact match by exercise_id (fast path).
 * Stage 2 (diagnostic fallback): normalized-name scan — logs a warning
 *         about potential duplicate exercises.
 *
 * Always excludes the given draft session and only considers
 * completed / completed_pending sessions.
 */
export async function getLastLoggedSets({
  userId,
  exerciseId,
  exerciseName,
  excludeSessionId,
}: GetLastLoggedSetsParams): Promise<LastLoggedSetsResult | null> {
  if (!userId || !exerciseId) return null

  // ── Stage 1: by exercise_id ──
  let q = supabase
    .from('session_exercises')
    .select(`
      id,
      session:sessions!inner(id, completed_at)
    `.trim())
    .eq('exercise_id', exerciseId)
    .eq('sessions.user_id', userId)
    .in('sessions.status', ['completed', 'completed_pending'])
    .order('sessions(completed_at)', { ascending: false })
    .limit(1)

  if (excludeSessionId) q = q.neq('sessions.id', excludeSessionId)

  const { data: hit } = await q.maybeSingle()

  type HitRow = {
    id: string
    session: { id: string; completed_at: string } | null
  }

  let source: HitRow | null = (hit as unknown as HitRow) ?? null
  let matchMethod: LastLoggedSetsResult['matchMethod'] = 'exercise_id'

  // ── Stage 2: diagnostic fallback by normalized name ──
  if (!source && exerciseName) {
    const normalized = normalizeExerciseName(exerciseName)

    let fallbackQ = supabase
      .from('session_exercises')
      .select(`
        id,
        exercise:exercises(id, name),
        session:sessions!inner(id, completed_at)
      `.trim())
      .eq('sessions.user_id', userId)
      .in('sessions.status', ['completed', 'completed_pending'])
      .order('sessions(completed_at)', { ascending: false })
      .limit(50)

    if (excludeSessionId) fallbackQ = fallbackQ.neq('sessions.id', excludeSessionId)

    const { data: rows } = await fallbackQ

    type FallbackRow = HitRow & {
      exercise: { id: string; name: string } | null
    }
    const typed = (rows as unknown as FallbackRow[] | null) ?? []

    const match = typed.find(r => {
      if (!r.exercise?.name) return false
      return normalizeExerciseName(r.exercise.name) === normalized
    })

    if (match) {
      source = match
      matchMethod = 'name_fallback'

      console.warn(
        `[getLastLoggedSets] ⚠️ exercise_id=${exerciseId} not found in history. ` +
        `Found match by name "${exerciseName}" → exercise ${match.exercise?.id}. ` +
        `Potential duplicate exercises detected.`
      )
    }
  }

  if (!source?.session?.id) return null

  // ── Fetch sets ──
  const { data: setsData, error: setsError } = await supabase
    .from('sets')
    .select('set_index, weight, reps, rpe')
    .eq('session_exercise_id', source.id)
    .order('set_index')

  if (setsError || !setsData?.length) return null

  return {
    sessionId: source.session.id,
    sessionExerciseId: source.id,
    completedAt: source.session.completed_at!,
    matchMethod,
    sets: setsData.map(s => ({
      set_index: s.set_index,
      weight: s.weight,
      reps: s.reps,
      rpe: s.rpe,
    })),
  }
}
