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
  rpe: number | null;
  // Previous workout values for comparison (optional, not persisted to DB)
  prev_weight?: number | null;
  prev_reps?: number | null;
  prev_rpe?: number | null;
}

export interface CachedSessionExercise {
  id: string;
  session_id: string;
  exercise_id: string;
  rpe: number | null;
  rpe_display: number | null;
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
  date: string;
  source: string;
  template_id: string | null;
  last_activity_at: string | null;
  auto_completed: boolean;
  exercises: CachedSessionExercise[];
}

interface ActiveSessionCache {
  session: CachedSession | null;
  isLoading: boolean;
  isFetching: boolean;
  getExercise: (sessionExerciseId: string) => CachedSessionExercise | undefined;
  getSets: (sessionExerciseId: string) => CachedSet[];
  touchSessionActivityOptimistic: (lastActivityAt: string) => void;
  setSessionStatusOptimistic: (updates: Partial<Pick<CachedSession, 'status' | 'auto_completed' | 'last_activity_at'>>) => void;
  updateSetOptimistic: (sessionExerciseId: string, setId: string, updates: Partial<CachedSet>) => void;
  updateExerciseOptimistic: (sessionExerciseId: string, updates: Partial<Pick<CachedSessionExercise, 'rpe' | 'active_set_index' | 'rpe_display'>>) => void;
  addSetOptimistic: (sessionExerciseId: string, newSet: CachedSet) => void;
  deleteSetOptimistic: (sessionExerciseId: string, setId: string) => void;
  addExerciseOptimistic: (newExercise: CachedSessionExercise) => void;
  deleteExerciseOptimistic: (sessionExerciseId: string) => void;
  replaceExerciseOptimistic: (sessionExerciseId: string, newExerciseId: string, exerciseInfo: CachedSessionExercise['exercise'], newSets: CachedSet[]) => void;
  updateExerciseSortOrderOptimistic: (updates: { id: string; sort_order: number }[]) => void;
  updateRpeDisplayOptimistic: (sessionExerciseId: string, rpeDisplay: number | null) => void;
  initializeEmptySession: (sessionId: string, source?: string, templateId?: string | null) => void;
  syncExerciseWithServerIds: (tempSessionExerciseId: string, serverSessionExerciseId: string, serverSets: { id: string; set_index: number; weight: number; reps: number }[]) => void;
  syncSetIdsForExercise: (sessionExerciseId: string, serverSets: { id: string; set_index: number; weight: number; reps: number }[]) => void;
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
        .select('id, status, date, source, template_id, last_activity_at, auto_completed')
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
          rpe_display,
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
          .select('id, session_exercise_id, set_index, weight, reps, is_completed, rpe')
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
        rpe_display: e.rpe_display,
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
        date: sessionData.date,
        source: sessionData.source,
        template_id: sessionData.template_id,
        last_activity_at: sessionData.last_activity_at,
        auto_completed: sessionData.auto_completed ?? false,
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

  const touchSessionActivityOptimistic = useCallback((lastActivityAt: string) => {
    queryClient.setQueryData(cacheKey, (old: CachedSession | null | undefined) => {
      if (!old) return old;
      return {
        ...old,
        last_activity_at: lastActivityAt,
      };
    });
  }, [queryClient, cacheKey]);

  const setSessionStatusOptimistic = useCallback((
    updates: Partial<Pick<CachedSession, 'status' | 'auto_completed' | 'last_activity_at'>>
  ) => {
    queryClient.setQueryData(cacheKey, (old: CachedSession | null | undefined) => {
      if (!old) return old;
      return { ...old, ...updates };
    });
  }, [queryClient, cacheKey]);

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

  // Add exercise optimistically
  const addExerciseOptimistic = useCallback((newExercise: CachedSessionExercise) => {
    queryClient.setQueryData(cacheKey, (old: CachedSession | null | undefined) => {
      if (!old) {
        // Create a new session cache if it doesn't exist
        return {
          id: newExercise.session_id,
          status: 'draft',
          source: 'empty',
          template_id: null,
          exercises: [newExercise],
        };
      }

      return {
        ...old,
        exercises: [...old.exercises, newExercise].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
      };
    });
  }, [queryClient, cacheKey]);

  // Delete exercise optimistically
  const deleteExerciseOptimistic = useCallback((sessionExerciseId: string) => {
    queryClient.setQueryData(cacheKey, (old: CachedSession | null | undefined) => {
      if (!old) return old;

      return {
        ...old,
        exercises: old.exercises.filter(e => e.id !== sessionExerciseId),
      };
    });
  }, [queryClient, cacheKey]);

  // Replace exercise optimistically (in-place update)
  const replaceExerciseOptimistic = useCallback((
    sessionExerciseId: string,
    newExerciseId: string,
    exerciseInfo: CachedSessionExercise['exercise'],
    newSets: CachedSet[]
  ) => {
    queryClient.setQueryData(cacheKey, (old: CachedSession | null | undefined) => {
      if (!old) return old;

      return {
        ...old,
        exercises: old.exercises.map(exercise => {
          if (exercise.id !== sessionExerciseId) return exercise;

          return {
            ...exercise,
            exercise_id: newExerciseId,
            exercise: exerciseInfo,
            active_set_index: 1,
            rpe: null,
            sets: newSets,
          };
        }),
      };
    });

    // Also update the individual sets query
    queryClient.setQueryData(
      queryKeys.sets.bySessionExercise(sessionExerciseId),
      newSets
    );
  }, [queryClient, cacheKey]);

  // Update sort order for multiple exercises optimistically
  const updateExerciseSortOrderOptimistic = useCallback((
    updates: { id: string; sort_order: number }[]
  ) => {
    queryClient.setQueryData(cacheKey, (old: CachedSession | null | undefined) => {
      if (!old) return old;

      const updatesMap = new Map(updates.map(u => [u.id, u.sort_order]));

      return {
        ...old,
        exercises: old.exercises
          .map(exercise => {
            const newSortOrder = updatesMap.get(exercise.id);
            if (newSortOrder !== undefined) {
              return { ...exercise, sort_order: newSortOrder };
            }
            return exercise;
          })
          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
      };
    });
  }, [queryClient, cacheKey]);

  // Update rpe_display optimistically
  const updateRpeDisplayOptimistic = useCallback((
    sessionExerciseId: string,
    rpeDisplay: number | null
  ) => {
    queryClient.setQueryData(cacheKey, (old: CachedSession | null | undefined) => {
      if (!old) return old;

      return {
        ...old,
        exercises: old.exercises.map(exercise => 
          exercise.id === sessionExerciseId 
            ? { ...exercise, rpe_display: rpeDisplay } 
            : exercise
        ),
      };
    });
  }, [queryClient, cacheKey]);

  // Initialize an empty session in the cache (for new workouts)
  const initializeEmptySession = useCallback((
    newSessionId: string,
    source: string = 'empty',
    templateId: string | null = null
  ) => {
    const newCacheKey = queryKeys.sessions.fullCache(newSessionId);
    queryClient.setQueryData(newCacheKey, {
      id: newSessionId,
      status: 'draft',
      source,
      template_id: templateId,
      exercises: [],
    });
  }, [queryClient]);

  // Sync temporary IDs with real server IDs after server response
  const syncExerciseWithServerIds = useCallback((
    tempSessionExerciseId: string,
    serverSessionExerciseId: string,
    serverSets: { id: string; set_index: number; weight: number; reps: number }[]
  ) => {
    queryClient.setQueryData(cacheKey, (old: CachedSession | null | undefined) => {
      if (!old) return old;

      return {
        ...old,
        exercises: old.exercises.map(exercise => {
          if (exercise.id !== tempSessionExerciseId) return exercise;

          // Map old sets to new real IDs by set_index
          const updatedSets = exercise.sets.map(oldSet => {
            const serverSet = serverSets.find(s => s.set_index === oldSet.set_index);
            if (serverSet) {
              return {
                ...oldSet,
                id: serverSet.id,
                session_exercise_id: serverSessionExerciseId,
              };
            }
            return oldSet;
          });

          return {
            ...exercise,
            id: serverSessionExerciseId,
            sets: updatedSets,
          };
        }),
      };
    });
  }, [queryClient, cacheKey]);

  // Sync set IDs for a specific exercise (after replace)
  const syncSetIdsForExercise = useCallback((
    sessionExerciseId: string,
    serverSets: { id: string; set_index: number; weight: number; reps: number }[]
  ) => {
    queryClient.setQueryData(cacheKey, (old: CachedSession | null | undefined) => {
      if (!old) return old;

      return {
        ...old,
        exercises: old.exercises.map(exercise => {
          if (exercise.id !== sessionExerciseId) return exercise;

          // Map sets to real IDs by set_index
          const updatedSets = exercise.sets.map(oldSet => {
            const serverSet = serverSets.find(s => s.set_index === oldSet.set_index);
            if (serverSet) {
              return {
                ...oldSet,
                id: serverSet.id,
              };
            }
            return oldSet;
          });

          return {
            ...exercise,
            sets: updatedSets,
          };
        }),
      };
    });

    // Also update individual sets query
    queryClient.setQueryData(
      queryKeys.sets.bySessionExercise(sessionExerciseId),
      (old: CachedSet[] | undefined) => {
        if (!old) return old;
        return old.map(oldSet => {
          const serverSet = serverSets.find(s => s.set_index === oldSet.set_index);
          if (serverSet) {
            return { ...oldSet, id: serverSet.id };
          }
          return oldSet;
        });
      }
    );
  }, [queryClient, cacheKey]);

  return {
    session,
    isLoading,
    isFetching,
    getExercise,
    getSets,
    touchSessionActivityOptimistic,
    setSessionStatusOptimistic,
    updateSetOptimistic,
    updateExerciseOptimistic,
    addSetOptimistic,
    deleteSetOptimistic,
    addExerciseOptimistic,
    deleteExerciseOptimistic,
    replaceExerciseOptimistic,
    updateExerciseSortOrderOptimistic,
    updateRpeDisplayOptimistic,
    initializeEmptySession,
    syncExerciseWithServerIds,
    syncSetIdsForExercise,
    refetch,
  };
}
