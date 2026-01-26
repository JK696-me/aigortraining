import { supabase } from '@/integrations/supabase/client'
import type { QueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/queryKeys'
import { generateCanonicalKey } from '@/lib/canonicalKey'

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
  matchStage: 'A' | 'B' | 'C' // Which stage found the match
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
  if (!isDebug && !import.meta.env.DEV) return
  if (payload !== undefined) console.log(message, payload)
  else console.log(message)
}

interface StageRow {
  id: string
  exercise: { name: string; canonical_key: string | null } | null
  session: { id: string; completed_at: string | null } | null
}

/**
 * Three-stage lookup for previous exercise performance:
 * A) By exercise_id (exact match - fastest)
 * B) By canonical_key (fuzzy match across name variations)
 * C) By alias table (explicit user-defined mappings)
 */
export async function getLastExercisePerformance({
  userId,
  exerciseId,
  exerciseName,
  activeSessionId,
  queryClient,
  isDebug = false,
}: GetLastExercisePerformanceParams): Promise<LastExercisePerformanceResult | null> {
  if (!userId || !exerciseId) return null

  const normalizedName = normalizeExerciseName(exerciseName)
  const canonicalKey = generateCanonicalKey(exerciseName)
  const cacheKey = queryKeys.exercises.lastExercisePerformance(userId, exerciseId, normalizedName)

  logDebug({ 
    isDebug, 
    message: '[Prev lookup] Starting search', 
    payload: { exerciseName, canonicalKey, exerciseId } 
  })

  // Check cache first
  const cached = queryClient?.getQueryData<LastExercisePerformanceResult | null>(cacheKey)
  if (!navigator.onLine) {
    logDebug({ isDebug, message: '[Prev lookup] Offline, using cache', payload: cached ? 'found' : 'not found' })
    return cached ?? null
  }
  if (cached) {
    logDebug({ isDebug, message: '[Prev lookup] Cache hit', payload: { stage: cached.matchStage, sessionExerciseId: cached.sourceSessionExerciseId } })
    return cached
  }

  let source: StageRow | null = null
  let matchStage: 'A' | 'B' | 'C' = 'A'

  // ===== STAGE A: Fast path - by exercise_id =====
  let stageAQuery = supabase
    .from('session_exercises')
    .select(`
      id,
      exercise:exercises(name, canonical_key),
      session:sessions!inner(id, user_id, status, completed_at)
    `.trim())
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

  source = (stageA as unknown as StageRow | null) ?? null
  matchStage = 'A'

  // ===== STAGE B: By canonical_key (fuzzy match) =====
  if (!source && canonicalKey) {
    logDebug({ isDebug, message: '[Prev lookup B] Searching by canonical_key', payload: canonicalKey })
    
    // First, try to find exercises with matching canonical_key in DB
    const { data: matchingExercises } = await supabase
      .from('exercises')
      .select('id')
      .eq('user_id', userId)
      .eq('canonical_key', canonicalKey)
    
    const matchingExerciseIds = matchingExercises?.map(e => e.id) || []
    
    if (matchingExerciseIds.length > 0) {
      let stageBQuery = supabase
        .from('session_exercises')
        .select(`
          id,
          exercise:exercises(name, canonical_key),
          session:sessions!inner(id, user_id, status, completed_at)
        `.trim())
        .in('exercise_id', matchingExerciseIds)
        .eq('sessions.user_id', userId)
        .in('sessions.status', ['completed', 'completed_pending'])
        .order('sessions(completed_at)', { ascending: false })
        .limit(1)

      if (activeSessionId) stageBQuery = stageBQuery.neq('sessions.id', activeSessionId)

      const { data: stageB } = await stageBQuery.maybeSingle()
      
      if (stageB) {
        source = stageB as unknown as StageRow
        matchStage = 'B'
        logDebug({ isDebug, message: '[Prev lookup B by canonical_key]', payload: 'found' })
      }
    }
    
    // If no DB match, try computing canonical_key on the fly from recent history
    if (!source) {
      let stageBFallbackQuery = supabase
        .from('session_exercises')
        .select(`
          id,
          exercise:exercises(name, canonical_key),
          session:sessions!inner(id, user_id, status, completed_at)
        `.trim())
        .eq('sessions.user_id', userId)
        .in('sessions.status', ['completed', 'completed_pending'])
        .order('sessions(completed_at)', { ascending: false })
        .limit(50)

      if (activeSessionId) stageBFallbackQuery = stageBFallbackQuery.neq('sessions.id', activeSessionId)

      const { data: stageBFallback } = await stageBFallbackQuery
      const rows = (stageBFallback as unknown as StageRow[] | null) ?? []

      // Match by computed canonical key
      source = rows.find((row) => {
        const name = row.exercise?.name
        if (!name) return false
        const rowCanonicalKey = generateCanonicalKey(name)
        return rowCanonicalKey === canonicalKey
      }) ?? null

      if (source) {
        matchStage = 'B'
        logDebug({ isDebug, message: '[Prev lookup B by computed canonical_key]', payload: 'found' })
      }
    }
  }

  // ===== STAGE C: By alias table =====
  if (!source) {
    logDebug({ isDebug, message: '[Prev lookup C] Searching by alias', payload: exerciseName })
    
    // Look up canonical_key from alias table
    const { data: aliasMatch } = await supabase
      .from('exercise_aliases')
      .select('canonical_key')
      .eq('user_id', userId)
      .eq('alias_name', exerciseName)
      .maybeSingle()
    
    const aliasCanonicalKey = aliasMatch?.canonical_key
    
    if (aliasCanonicalKey) {
      logDebug({ isDebug, message: '[Prev lookup C] Found alias canonical_key', payload: aliasCanonicalKey })
      
      // Find exercises with this canonical_key
      const { data: aliasExercises } = await supabase
        .from('exercises')
        .select('id')
        .eq('user_id', userId)
        .eq('canonical_key', aliasCanonicalKey)
      
      const aliasExerciseIds = aliasExercises?.map(e => e.id) || []
      
      if (aliasExerciseIds.length > 0) {
        let stageCQuery = supabase
          .from('session_exercises')
          .select(`
            id,
            exercise:exercises(name, canonical_key),
            session:sessions!inner(id, user_id, status, completed_at)
          `.trim())
          .in('exercise_id', aliasExerciseIds)
          .eq('sessions.user_id', userId)
          .in('sessions.status', ['completed', 'completed_pending'])
          .order('sessions(completed_at)', { ascending: false })
          .limit(1)

        if (activeSessionId) stageCQuery = stageCQuery.neq('sessions.id', activeSessionId)

        const { data: stageC } = await stageCQuery.maybeSingle()
        
        if (stageC) {
          source = stageC as unknown as StageRow
          matchStage = 'C'
          logDebug({ isDebug, message: '[Prev lookup C by alias]', payload: 'found' })
        }
      }
      
      // Also try to find by computed canonical key from alias
      if (!source) {
        let stageCFallbackQuery = supabase
          .from('session_exercises')
          .select(`
            id,
            exercise:exercises(name, canonical_key),
            session:sessions!inner(id, user_id, status, completed_at)
          `.trim())
          .eq('sessions.user_id', userId)
          .in('sessions.status', ['completed', 'completed_pending'])
          .order('sessions(completed_at)', { ascending: false })
          .limit(50)

        if (activeSessionId) stageCFallbackQuery = stageCFallbackQuery.neq('sessions.id', activeSessionId)

        const { data: stageCFallback } = await stageCFallbackQuery
        const rows = (stageCFallback as unknown as StageRow[] | null) ?? []

        source = rows.find((row) => {
          const name = row.exercise?.name
          if (!name) return false
          return generateCanonicalKey(name) === aliasCanonicalKey
        }) ?? null

        if (source) {
          matchStage = 'C'
          logDebug({ isDebug, message: '[Prev lookup C by alias computed key]', payload: 'found' })
        }
      }
    }
  }

  // ===== FINAL FALLBACK: Normalized name match (original behavior) =====
  if (!source) {
    let fallbackQuery = supabase
      .from('session_exercises')
      .select(`
        id,
        exercise:exercises(name, canonical_key),
        session:sessions!inner(id, user_id, status, completed_at)
      `.trim())
      .eq('sessions.user_id', userId)
      .in('sessions.status', ['completed', 'completed_pending'])
      .order('sessions(completed_at)', { ascending: false })
      .limit(50)

    if (activeSessionId) fallbackQuery = fallbackQuery.neq('sessions.id', activeSessionId)

    const { data: fallbackData, error: fallbackError } = await fallbackQuery
    if (fallbackError) {
      logDebug({ isDebug, message: '[Prev lookup fallback] error', payload: fallbackError.message })
      return null
    }

    const rows = (fallbackData as unknown as StageRow[] | null) ?? []

    source = rows.find((row) => {
      const name = row.exercise?.name
      if (!name) return false
      return normalizeExerciseName(name) === normalizedName
    }) ?? null

    if (source) {
      matchStage = 'B' // Count as fuzzy match
      logDebug({ isDebug, message: '[Prev lookup fallback by normalized name]', payload: 'found' })
    }
  }

  if (!source?.session?.id) {
    logDebug({ isDebug, message: '[Prev lookup] No source found after all stages' })
    return null
  }

  logDebug({
    isDebug,
    message: '[Prev source session]',
    payload: { sessionId: source.session.id, sessionExerciseId: source.id, stage: matchStage },
  })

  // Fetch sets in one batch (include RPE!)
  const { data: setsData, error: setsError } = await supabase
    .from('sets')
    .select('set_index, weight, reps, rpe')
    .eq('session_exercise_id', source.id)
    .order('set_index')

  if (setsError || !setsData || setsData.length === 0) {
    logDebug({ isDebug, message: '[Prev lookup] No sets found for source' })
    return null
  }

  const result: LastExercisePerformanceResult = {
    sourceSessionId: source.session.id,
    sourceSessionExerciseId: source.id,
    matchStage,
    sets: setsData.map((s) => ({
      set_index: s.set_index,
      weight: s.weight,
      reps: s.reps,
      rpe: s.rpe,
    })),
  }

  // Cache the result
  queryClient?.setQueryData(cacheKey, result)
  logDebug({ 
    isDebug, 
    message: '[Prev lookup] Result cached', 
    payload: { sets: result.sets.length, stage: matchStage, hasRpe: result.sets.some(s => s.rpe !== null) } 
  })
  
  return result
}
