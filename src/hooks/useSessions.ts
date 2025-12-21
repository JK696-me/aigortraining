import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface Session {
  id: string;
  user_id: string;
  date: string;
  source: 'empty' | 'repeat' | 'template';
  template_id: string | null;
  created_at: string;
}

export interface SessionExercise {
  id: string;
  session_id: string;
  exercise_id: string;
  rpe: number | null;
  performed_sets_count: number | null;
  created_at: string;
  exercise?: {
    id: string;
    name: string;
    type: number;
    increment_kind: string;
    increment_value: number;
  };
}

export interface Set {
  id: string;
  session_exercise_id: string;
  set_index: number;
  weight: number;
  reps: number;
  created_at: string;
}

export function useSessions() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ['sessions', user?.id],
    queryFn: async () => {
      if (!user) return [];
      
      const { data, error } = await supabase
        .from('sessions')
        .select('*')
        .eq('user_id', user.id)
        .order('date', { ascending: false });
      
      if (error) throw error;
      return data as Session[];
    },
    enabled: !!user,
  });

  const createSession = useMutation({
    mutationFn: async (source: 'empty' | 'repeat' | 'template' = 'empty') => {
      if (!user) throw new Error('Not authenticated');
      
      const { data, error } = await supabase
        .from('sessions')
        .insert({ 
          user_id: user.id, 
          date: new Date().toISOString(),
          source 
        })
        .select()
        .single();
      
      if (error) throw error;
      return data as Session;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions', user?.id] });
    },
  });

  return {
    sessions,
    isLoading,
    createSession: createSession.mutateAsync,
    isCreating: createSession.isPending,
  };
}

export function useSession(sessionId: string | null) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['session', sessionId],
    queryFn: async () => {
      if (!sessionId || !user) return null;
      
      const { data, error } = await supabase
        .from('sessions')
        .select('*')
        .eq('id', sessionId)
        .single();
      
      if (error) throw error;
      return data as Session;
    },
    enabled: !!sessionId && !!user,
  });
}

export function useSessionExercises(sessionId: string | null) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: exercises = [], isLoading } = useQuery({
    queryKey: ['session-exercises', sessionId],
    queryFn: async () => {
      if (!sessionId || !user) return [];
      
      const { data, error } = await supabase
        .from('session_exercises')
        .select(`
          *,
          exercise:exercises(id, name, type, increment_kind, increment_value)
        `)
        .eq('session_id', sessionId)
        .order('created_at');
      
      if (error) throw error;
      return data as SessionExercise[];
    },
    enabled: !!sessionId && !!user,
  });

  const addExercise = useMutation({
    mutationFn: async ({ exerciseId, initialSets }: { exerciseId: string; initialSets: { weight: number; reps: number }[] }) => {
      if (!sessionId || !user) throw new Error('Not authenticated');
      
      // Create session_exercise
      const { data: sessionExercise, error: seError } = await supabase
        .from('session_exercises')
        .insert({ 
          session_id: sessionId, 
          exercise_id: exerciseId 
        })
        .select()
        .single();
      
      if (seError) throw seError;

      // Create initial sets
      if (initialSets.length > 0) {
        const setsToInsert = initialSets.map((set, index) => ({
          session_exercise_id: sessionExercise.id,
          set_index: index + 1,
          weight: set.weight,
          reps: set.reps,
        }));

        const { error: setsError } = await supabase
          .from('sets')
          .insert(setsToInsert);

        if (setsError) throw setsError;
      }

      return sessionExercise;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['session-exercises', sessionId] });
    },
  });

  const updateRpe = useMutation({
    mutationFn: async ({ sessionExerciseId, rpe }: { sessionExerciseId: string; rpe: number | null }) => {
      const { error } = await supabase
        .from('session_exercises')
        .update({ rpe })
        .eq('id', sessionExerciseId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['session-exercises', sessionId] });
    },
  });

  const deleteExercise = useMutation({
    mutationFn: async (sessionExerciseId: string) => {
      // Delete sets first (due to FK)
      await supabase
        .from('sets')
        .delete()
        .eq('session_exercise_id', sessionExerciseId);
      
      // Delete session exercise
      const { error } = await supabase
        .from('session_exercises')
        .delete()
        .eq('id', sessionExerciseId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['session-exercises', sessionId] });
    },
  });

  const replaceExercise = useMutation({
    mutationFn: async ({ 
      oldSessionExerciseId, 
      newExerciseId, 
      initialSets 
    }: { 
      oldSessionExerciseId: string; 
      newExerciseId: string; 
      initialSets: { weight: number; reps: number }[] 
    }) => {
      if (!sessionId || !user) throw new Error('Not authenticated');

      // Delete old session exercise and its sets
      await supabase
        .from('sets')
        .delete()
        .eq('session_exercise_id', oldSessionExerciseId);
      
      await supabase
        .from('session_exercises')
        .delete()
        .eq('id', oldSessionExerciseId);

      // Create new session exercise
      const { data: sessionExercise, error: seError } = await supabase
        .from('session_exercises')
        .insert({ 
          session_id: sessionId, 
          exercise_id: newExerciseId 
        })
        .select()
        .single();
      
      if (seError) throw seError;

      // Create initial sets for new exercise
      if (initialSets.length > 0) {
        const setsToInsert = initialSets.map((set, index) => ({
          session_exercise_id: sessionExercise.id,
          set_index: index + 1,
          weight: set.weight,
          reps: set.reps,
        }));

        await supabase.from('sets').insert(setsToInsert);
      }

      return sessionExercise;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['session-exercises', sessionId] });
    },
  });

  return {
    exercises,
    isLoading,
    addExercise: addExercise.mutateAsync,
    updateRpe: updateRpe.mutate,
    deleteExercise: deleteExercise.mutateAsync,
    replaceExercise: replaceExercise.mutateAsync,
    isAdding: addExercise.isPending,
    isDeleting: deleteExercise.isPending,
    isReplacing: replaceExercise.isPending,
  };
}

export function useSets(sessionExerciseId: string | null) {
  const queryClient = useQueryClient();

  const { data: sets = [], isLoading, refetch } = useQuery({
    queryKey: ['sets', sessionExerciseId],
    queryFn: async () => {
      if (!sessionExerciseId) return [];
      
      const { data, error } = await supabase
        .from('sets')
        .select('*')
        .eq('session_exercise_id', sessionExerciseId)
        .order('set_index');
      
      if (error) throw error;
      return data as Set[];
    },
    enabled: !!sessionExerciseId,
  });

  const updateSet = useMutation({
    mutationFn: async ({ setId, updates }: { setId: string; updates: Partial<Pick<Set, 'weight' | 'reps'>> }) => {
      const { error } = await supabase
        .from('sets')
        .update(updates)
        .eq('id', setId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sets', sessionExerciseId] });
    },
  });

  const addSet = useMutation({
    mutationFn: async ({ weight, reps }: { weight: number; reps: number }) => {
      if (!sessionExerciseId) throw new Error('No session exercise');
      
      const nextIndex = sets.length > 0 ? Math.max(...sets.map(s => s.set_index)) + 1 : 1;
      
      const { data, error } = await supabase
        .from('sets')
        .insert({
          session_exercise_id: sessionExerciseId,
          set_index: nextIndex,
          weight,
          reps,
        })
        .select()
        .single();
      
      if (error) throw error;
      return data as Set;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sets', sessionExerciseId] });
    },
  });

  const deleteSet = useMutation({
    mutationFn: async (setId: string) => {
      const { error } = await supabase
        .from('sets')
        .delete()
        .eq('id', setId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sets', sessionExerciseId] });
    },
  });

  return {
    sets,
    isLoading,
    updateSet: updateSet.mutate,
    addSet: addSet.mutate,
    deleteSet: deleteSet.mutate,
    isUpdating: updateSet.isPending,
    isAdding: addSet.isPending,
    isDeleting: deleteSet.isPending,
    refetch,
  };
}

// Get last session's sets for an exercise
export function useLastExerciseSets(exerciseId: string | null) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['last-exercise-sets', exerciseId, user?.id],
    queryFn: async () => {
      if (!exerciseId || !user) return null;
      
      // Find the last session_exercise for this exercise
      const { data: lastSessionExercise, error: seError } = await supabase
        .from('session_exercises')
        .select(`
          id,
          session:sessions!inner(user_id, date)
        `)
        .eq('exercise_id', exerciseId)
        .eq('sessions.user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (seError || !lastSessionExercise) return null;

      // Get its sets
      const { data: sets, error: setsError } = await supabase
        .from('sets')
        .select('*')
        .eq('session_exercise_id', lastSessionExercise.id)
        .order('set_index');
      
      if (setsError) return null;
      return sets as Set[];
    },
    enabled: !!exerciseId && !!user,
  });
}

// Get exercise state for initial sets count
export function useExerciseState(exerciseId: string | null) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['exercise-state', exerciseId, user?.id],
    queryFn: async () => {
      if (!exerciseId || !user) return null;
      
      const { data, error } = await supabase
        .from('exercise_state')
        .select('*')
        .eq('exercise_id', exerciseId)
        .eq('user_id', user.id)
        .maybeSingle();
      
      if (error) return null;
      return data;
    },
    enabled: !!exerciseId && !!user,
  });
}
