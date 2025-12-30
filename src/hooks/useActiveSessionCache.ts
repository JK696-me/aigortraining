import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { queryKeys, CACHE_TTL } from '@/lib/queryKeys';
import { useCallback, useMemo } from 'react';

export interface CachedSet {
  id: string;
  session_exercise_id: string;
  set_index: number;
  weight: number;
  reps: number;
  is_completed: boolean;
}

export interface CachedSessionExercise {
  id: string;
  session_id: string;
  exercise_id: string;
  rpe: number | null;
  active_set_index: number | null;
  sort_order: number | null;
  exercise: {
    id: string;
    name: string;
    type: number;
    increment_kind: string;
    increment_value: number;
  } | null;
  sets: CachedSet[];
}

export interface CachedSession {
  id: string;
  status: string;
  source: string;
  template_id: string | null;
  exercises: CachedSessionExercise[];
}

interface ActiveSessionCache {
  session: CachedSession | null;
  isLoading: boolean;
  isFetching: boolean;
  getExercise: (sessionExerciseId: string) => CachedSessionExercise | undefined;
  getSets: (sessionExerciseId: string) => CachedSet[];
  updateSetOptimistic: (sessionExerciseId: string, setId: string, updates: Partial<CachedSet>) => void;
  updateExerciseOptimistic: (sessionExerciseId: string, updates: Partial<Pick<CachedSessionExercise, 'rpe' | 'active_set_index'>>) => void;
  addSetOptimistic: (sessionExerciseId: string, newSet: CachedSet) => void;
  deleteSetOptimistic: (sessionExerciseId: string, setId: string) => void;
  refetch: () => void;
}

export function useActiveSessionCache(sessionId: string | null): ActiveSessionCache {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const cacheKey = queryKeys.sessions.fullCache(sessionId || '');

  const { data: session, isLoading, isFetching, refetch } = useQuery({
    queryKey: cacheKey,
    queryFn: async (): Promise<CachedSession | null> => {
      if (!sessionId || !user) return null;

      // Fetch session
      const { data: sessionData, error: sessionError } = await supabase
        .from('sessions')
        .select('id, status, source, template_id')
        .eq('id', sessionId)
        .single();

      if (sessionError || !sessionData) return null;

      // Fetch all session exercises with their exercise details
      const { data: exercisesData, error: exercisesError } = await supabase
        .from('session_exercises')
        .select(`
          id,
          session_id,
          exercise_id,
          rpe,
          active_set_index,
          sort_order,
          exercise:exercises(id, name, type, increment_kind, increment_value)
        `)
        .eq('session_id', sessionId)
        .order('sort_order', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true });

      if (exercisesError) return null;

      // Fetch all sets for all exercises in one query
      const exerciseIds = exercisesData?.map(e => e.id) || [];
      let allSets: CachedSet[] = [];

      if (exerciseIds.length > 0) {
        const { data: setsData } = await supabase
          .from('sets')
          .select('id, session_exercise_id, set_index, weight, reps, is_completed')
          .in('session_exercise_id', exerciseIds)
          .order('set_index');

        allSets = setsData || [];
      }

      // Build the cached session structure
      const exercises: CachedSessionExercise[] = (exercisesData || []).map(e => ({
        id: e.id,
        session_id: e.session_id,
        exercise_id: e.exercise_id,
        rpe: e.rpe,
        active_set_index: e.active_set_index,
        sort_order: e.sort_order,
        exercise: e.exercise as CachedSessionExercise['exercise'],
        sets: allSets
          .filter(s => s.session_exercise_id === e.id)
          .sort((a, b) => a.set_index - b.set_index),
      }));

      return {
        id: sessionData.id,
        status: sessionData.status,
        source: sessionData.source,
        template_id: sessionData.template_id,
        exercises,
      };
    },
    enabled: !!sessionId && !!user,
    staleTime: CACHE_TTL.LONG, // Don't refetch on navigation
    gcTime: CACHE_TTL.LONG * 2,
    refetchOnMount: false, // Critical: don't refetch when component mounts
    refetchOnWindowFocus: false,
  });

  // Get exercise by ID from cache
  const getExercise = useCallback((sessionExerciseId: string): CachedSessionExercise | undefined => {
    return session?.exercises.find(e => e.id === sessionExerciseId);
  }, [session]);

  // Get sets by exercise ID from cache
  const getSets = useCallback((sessionExerciseId: string): CachedSet[] => {
    return session?.exercises.find(e => e.id === sessionExerciseId)?.sets || [];
  }, [session]);

  // Optimistic update for a set
  const updateSetOptimistic = useCallback((
    sessionExerciseId: string,
    setId: string,
    updates: Partial<CachedSet>
  ) => {
    queryClient.setQueryData(cacheKey, (old: CachedSession | null | undefined) => {
      if (!old) return old;

      return {
        ...old,
        exercises: old.exercises.map(exercise => {
          if (exercise.id !== sessionExerciseId) return exercise;

          return {
            ...exercise,
            sets: exercise.sets.map(set => 
              set.id === setId ? { ...set, ...updates } : set
            ),
          };
        }),
      };
    });

    // Also update the individual sets query for backwards compatibility
    queryClient.setQueryData(
      queryKeys.sets.bySessionExercise(sessionExerciseId),
      (old: CachedSet[] | undefined) => {
        if (!old) return old;
        return old.map(set => set.id === setId ? { ...set, ...updates } : set);
      }
    );
  }, [queryClient, cacheKey]);

  // Optimistic update for exercise (rpe, active_set_index)
  const updateExerciseOptimistic = useCallback((
    sessionExerciseId: string,
    updates: Partial<Pick<CachedSessionExercise, 'rpe' | 'active_set_index'>>
  ) => {
    queryClient.setQueryData(cacheKey, (old: CachedSession | null | undefined) => {
      if (!old) return old;

      return {
        ...old,
        exercises: old.exercises.map(exercise => 
          exercise.id === sessionExerciseId 
            ? { ...exercise, ...updates } 
            : exercise
        ),
      };
    });
  }, [queryClient, cacheKey]);

  // Add set optimistically
  const addSetOptimistic = useCallback((sessionExerciseId: string, newSet: CachedSet) => {
    queryClient.setQueryData(cacheKey, (old: CachedSession | null | undefined) => {
      if (!old) return old;

      return {
        ...old,
        exercises: old.exercises.map(exercise => {
          if (exercise.id !== sessionExerciseId) return exercise;

          return {
            ...exercise,
            sets: [...exercise.sets, newSet].sort((a, b) => a.set_index - b.set_index),
          };
        }),
      };
    });

    // Also update individual sets query
    queryClient.setQueryData(
      queryKeys.sets.bySessionExercise(sessionExerciseId),
      (old: CachedSet[] | undefined) => {
        if (!old) return [newSet];
        return [...old, newSet].sort((a, b) => a.set_index - b.set_index);
      }
    );
  }, [queryClient, cacheKey]);

  // Delete set optimistically
  const deleteSetOptimistic = useCallback((sessionExerciseId: string, setId: string) => {
    queryClient.setQueryData(cacheKey, (old: CachedSession | null | undefined) => {
      if (!old) return old;

      return {
        ...old,
        exercises: old.exercises.map(exercise => {
          if (exercise.id !== sessionExerciseId) return exercise;

          return {
            ...exercise,
            sets: exercise.sets.filter(set => set.id !== setId),
          };
        }),
      };
    });

    queryClient.setQueryData(
      queryKeys.sets.bySessionExercise(sessionExerciseId),
      (old: CachedSet[] | undefined) => {
        if (!old) return old;
        return old.filter(set => set.id !== setId);
      }
    );
  }, [queryClient, cacheKey]);

  return {
    session,
    isLoading,
    isFetching,
    getExercise,
    getSets,
    updateSetOptimistic,
    updateExerciseOptimistic,
    addSetOptimistic,
    deleteSetOptimistic,
    refetch,
  };
}
