import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { queryKeys, CACHE_TTL } from '@/lib/queryKeys';

export interface LastSetPerformance {
  set_index: number;
  weight: number;
  reps: number;
  rpe: number | null;
}

export interface LastExercisePerformance {
  session_exercise_id: string;
  completed_at: string;
  sets: LastSetPerformance[];
}

/**
 * Hook to fetch last workout performance data for a specific exercise.
 * Caches results during the active workout session.
 */
export function useLastPerformance(exerciseId: string | null | undefined) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data, isLoading, refetch } = useQuery({
    queryKey: queryKeys.exercises.lastPerformance(exerciseId || ''),
    queryFn: async (): Promise<LastExercisePerformance | null> => {
      if (!exerciseId || !user) return null;

      // Find the last completed session with this exercise
      const { data: lastSessionExercise, error: seError } = await supabase
        .from('session_exercises')
        .select(`
          id,
          session:sessions!inner(id, status, completed_at)
        `)
        .eq('exercise_id', exerciseId)
        .eq('sessions.status', 'completed')
        .order('sessions(completed_at)', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (seError || !lastSessionExercise) return null;

      // Get all sets from that session exercise
      const { data: setsData, error: setsError } = await supabase
        .from('sets')
        .select('set_index, weight, reps, rpe')
        .eq('session_exercise_id', lastSessionExercise.id)
        .order('set_index');

      if (setsError || !setsData) return null;

      const session = lastSessionExercise.session as unknown as { completed_at: string };

      return {
        session_exercise_id: lastSessionExercise.id,
        completed_at: session.completed_at,
        sets: setsData.map(s => ({
          set_index: s.set_index,
          weight: s.weight,
          reps: s.reps,
          rpe: s.rpe,
        })),
      };
    },
    enabled: !!exerciseId && !!user,
    staleTime: CACHE_TTL.LONG, // Cache for duration of workout
    gcTime: CACHE_TTL.LONG * 2,
  });

  return {
    lastPerformance: data,
    isLoading,
    refetch,
  };
}

/**
 * Fetch last performance synchronously for use in handleSelectExercise.
 * Returns null if not found or on error.
 */
export async function fetchLastPerformance(
  exerciseId: string,
  userId: string
): Promise<LastExercisePerformance | null> {
  try {
    // Find the last completed session with this exercise
    const { data: lastSessionExercise, error: seError } = await supabase
      .from('session_exercises')
      .select(`
        id,
        session:sessions!inner(id, status, completed_at)
      `)
      .eq('exercise_id', exerciseId)
      .eq('sessions.status', 'completed')
      .order('sessions(completed_at)', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (seError || !lastSessionExercise) return null;

    // Get all sets from that session exercise
    const { data: setsData, error: setsError } = await supabase
      .from('sets')
      .select('set_index, weight, reps, rpe')
      .eq('session_exercise_id', lastSessionExercise.id)
      .order('set_index');

    if (setsError || !setsData || setsData.length === 0) return null;

    const session = lastSessionExercise.session as unknown as { completed_at: string };

    return {
      session_exercise_id: lastSessionExercise.id,
      completed_at: session.completed_at,
      sets: setsData.map(s => ({
        set_index: s.set_index,
        weight: s.weight,
        reps: s.reps,
        rpe: s.rpe,
      })),
    };
  } catch (error) {
    console.error('Failed to fetch last performance:', error);
    return null;
  }
}
