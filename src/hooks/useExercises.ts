import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { queryKeys, CACHE_TTL } from '@/lib/queryKeys';
import { generateCanonicalKey } from '@/lib/canonicalKey';

export interface Exercise {
  id: string;
  user_id: string;
  name: string;
  type: number;
  increment_kind: 'barbell' | 'dumbbells' | 'machine';
  increment_value: number;
  is_dumbbell_pair: boolean;
  canonical_key: string | null;
  created_at: string;
}

export type ExerciseInsert = Omit<Exercise, 'id' | 'user_id' | 'created_at' | 'canonical_key'>;
export type ExerciseUpdate = Partial<ExerciseInsert>;

export function useExercises(searchQuery?: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: exercises = [], isLoading, isFetching } = useQuery({
    queryKey: queryKeys.exercises.list(user?.id || '', searchQuery),
    queryFn: async () => {
      if (!user) return [];
      
      let query = supabase
        .from('exercises')
        .select('*')
        .eq('user_id', user.id)
        .order('name');
      
      if (searchQuery) {
        query = query.ilike('name', `%${searchQuery}%`);
      }
      
      const { data, error } = await query;
      
      if (error) throw error;
      return data as Exercise[];
    },
    enabled: !!user,
    staleTime: CACHE_TTL.LONG,
    gcTime: CACHE_TTL.LONG * 2,
  });

  const createExercise = useMutation({
    mutationFn: async (exercise: ExerciseInsert) => {
      if (!user) throw new Error('Not authenticated');
      
      // Generate canonical_key from name
      const canonical_key = generateCanonicalKey(exercise.name);
      
      const { data, error } = await supabase
        .from('exercises')
        .insert({ 
          ...exercise, 
          user_id: user.id,
          canonical_key: canonical_key || null,
        })
        .select()
        .single();
      
      if (error) throw error;
      return data as Exercise;
    },
    onSuccess: () => {
      // Invalidate all exercise queries for this user
      queryClient.invalidateQueries({ queryKey: queryKeys.exercises.all(user?.id || '') });
    },
  });

  const updateExercise = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: ExerciseUpdate }) => {
      if (!user) throw new Error('Not authenticated');
      
      // Regenerate canonical_key if name is being updated
      const updatePayload: ExerciseUpdate & { canonical_key?: string | null } = { ...updates };
      if (updates.name) {
        updatePayload.canonical_key = generateCanonicalKey(updates.name) || null;
      }
      
      const { data, error } = await supabase
        .from('exercises')
        .update(updatePayload)
        .eq('id', id)
        .eq('user_id', user.id)
        .select()
        .single();
      
      if (error) throw error;
      return data as Exercise;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.exercises.all(user?.id || '') });
    },
  });

  const deleteExercise = useMutation({
    mutationFn: async (id: string) => {
      if (!user) throw new Error('Not authenticated');
      
      const { error } = await supabase
        .from('exercises')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.exercises.all(user?.id || '') });
    },
  });

  return {
    exercises,
    isLoading,
    isFetching, // Useful for showing background refresh indicator
    createExercise: createExercise.mutate,
    updateExercise: updateExercise.mutate,
    deleteExercise: deleteExercise.mutate,
    isCreating: createExercise.isPending,
    isUpdating: updateExercise.isPending,
    isDeleting: deleteExercise.isPending,
  };
}
