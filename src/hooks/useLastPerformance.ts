import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { queryKeys, CACHE_TTL } from '@/lib/queryKeys'
import { 
  getLastExercisePerformance, 
  LastExercisePerformanceResult, 
  LastExercisePerformanceSet 
} from '@/lib/lastExercisePerformance'

export type { LastExercisePerformanceSet, LastExercisePerformanceResult }

// Legacy interface for backward compatibility
export interface LastSetPerformance {
  set_index: number
  weight: number
  reps: number
  rpe: number | null
}

export interface LastExercisePerformance {
  session_exercise_id: string
  completed_at: string
  sets: LastSetPerformance[]
}

interface UseLastPerformanceOptions {
  exerciseId: string | null | undefined
  exerciseName?: string
  activeSessionId?: string | null
  enabled?: boolean
  isDebug?: boolean
}

/**
 * Hook to fetch last workout performance data for a specific exercise.
 * Uses two-stage lookup: first by exercise_id, then fallback by name.
 * Caches results during the active workout session.
 */
export function useLastPerformance({
  exerciseId,
  exerciseName = '',
  activeSessionId,
  enabled = true,
  isDebug = false,
}: UseLastPerformanceOptions) {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const normalizedName = exerciseName.trim().toLowerCase().replace(/\s+/g, ' ')
  
  const { data, isLoading, refetch } = useQuery({
    queryKey: queryKeys.exercises.lastExercisePerformance(
      user?.id || '',
      exerciseId || '',
      normalizedName
    ),
    queryFn: async (): Promise<LastExercisePerformanceResult | null> => {
      if (!exerciseId || !user || !exerciseName) return null

      return getLastExercisePerformance({
        userId: user.id,
        exerciseId,
        exerciseName,
        activeSessionId,
        queryClient,
        isDebug,
      })
    },
    enabled: enabled && !!exerciseId && !!user && !!exerciseName,
    staleTime: CACHE_TTL.LONG,
    gcTime: CACHE_TTL.LONG * 2,
  })

  return {
    lastPerformance: data,
    isLoading,
    refetch,
  }
}

/**
 * Fetch last performance synchronously for use in handlers.
 * Returns null if not found or on error.
 */
export async function fetchLastPerformanceWithFallback({
  userId,
  exerciseId,
  exerciseName,
  activeSessionId,
  queryClient,
  isDebug = false,
}: {
  userId: string
  exerciseId: string
  exerciseName: string
  activeSessionId?: string | null
  queryClient?: QueryClient
  isDebug?: boolean
}): Promise<LastExercisePerformanceResult | null> {
  return getLastExercisePerformance({
    userId,
    exerciseId,
    exerciseName,
    activeSessionId,
    queryClient,
    isDebug,
  })
}

// Re-export for convenience
import type { QueryClient } from '@tanstack/react-query'
