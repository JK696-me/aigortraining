import { useState, useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  DraftWorkout,
  DraftExercise,
  getDraft,
  saveDraft,
  deleteDraft,
  createNewDraft,
  addExerciseToDraft,
  updateExerciseInDraft,
  updateSetInDraft,
  addSetToDraft,
  deleteSetFromDraft,
  SyncState,
} from '@/lib/draftStorage';

interface UseDraftWorkoutOptions {
  userId: string | undefined;
  onRecoveryNeeded?: (draft: DraftWorkout) => void;
}

export function useDraftWorkout({ userId, onRecoveryNeeded }: UseDraftWorkoutOptions) {
  const [draft, setDraft] = useState<DraftWorkout | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const queryClient = useQueryClient();

  // Monitor online status
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      // Trigger sync when back online
      if (draft?.sync_state === 'dirty' || draft?.sync_state === 'error') {
        syncDraftToSupabase();
      }
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [draft]);

  // Load draft on mount
  useEffect(() => {
    if (!userId) {
      setIsLoading(false);
      return;
    }

    const loadDraft = async () => {
      const existingDraft = await getDraft(userId);
      if (existingDraft && existingDraft.exercises.length > 0) {
        setDraft(existingDraft);
        onRecoveryNeeded?.(existingDraft);
      }
      setIsLoading(false);
    };

    loadDraft();
  }, [userId, onRecoveryNeeded]);

  // Debounced save
  const scheduleSave = useCallback((updatedDraft: DraftWorkout) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      saveDraft(updatedDraft);
    }, 300);
  }, []);

  // Update draft and schedule save
  const updateDraft = useCallback((updater: (d: DraftWorkout) => DraftWorkout) => {
    setDraft(prev => {
      if (!prev) return prev;
      const updated = updater(prev);
      scheduleSave(updated);
      return updated;
    });
  }, [scheduleSave]);

  // Create new workout
  const startNewWorkout = useCallback(async (source: string = 'empty', templateId?: string | null): Promise<DraftWorkout | null> => {
    if (!userId) return null;

    const newDraft = createNewDraft(userId, source, templateId);
    setDraft(newDraft);
    await saveDraft(newDraft);
    
    // Sync immediately if online
    if (isOnline) {
      return await syncNewSession(newDraft);
    }
    
    return newDraft;
  }, [userId, isOnline]);

  // Sync new session to Supabase
  const syncNewSession = async (draftToSync: DraftWorkout): Promise<DraftWorkout | null> => {
    if (!draftToSync.user_id) return draftToSync;

    try {
      const { data: session, error } = await supabase
        .from('sessions')
        .insert({
          user_id: draftToSync.user_id,
          date: draftToSync.started_at,
          source: draftToSync.session.source,
          template_id: draftToSync.session.template_id,
          status: 'draft',
        })
        .select()
        .single();

      if (error) throw error;

      const updated = {
        ...draftToSync,
        session_id: session.id,
        sync_state: 'synced' as SyncState,
      };
      setDraft(updated);
      await saveDraft(updated);
      return updated;
    } catch (error) {
      console.error('Failed to sync new session:', error);
      const updated = { ...draftToSync, sync_state: 'error' as SyncState };
      setDraft(updated);
      await saveDraft(updated);
      return updated;
    }
  };

  // Sync entire draft to Supabase
  const syncDraftToSupabase = useCallback(async (): Promise<boolean> => {
    if (!draft || !userId || !isOnline) return false;

    setIsSyncing(true);
    try {
      let currentDraft = { ...draft };

      // A) Create session if doesn't exist
      if (!currentDraft.session_id) {
        const { data: session, error } = await supabase
          .from('sessions')
          .insert({
            user_id: userId,
            date: currentDraft.started_at,
            source: currentDraft.session.source,
            template_id: currentDraft.session.template_id,
            status: 'draft',
          })
          .select()
          .single();

        if (error) throw error;
        currentDraft.session_id = session.id;
      }

      // B) Sync exercises and sets
      for (const exercise of currentDraft.exercises) {
        // Check if session_exercise exists
        const { data: existingExercises } = await supabase
          .from('session_exercises')
          .select('id')
          .eq('session_id', currentDraft.session_id)
          .eq('exercise_id', exercise.exercise_id);

        let sessionExerciseId: string;

        if (!existingExercises || existingExercises.length === 0) {
          // Create session_exercise
          const { data: newSe, error: seError } = await supabase
            .from('session_exercises')
            .insert({
              session_id: currentDraft.session_id,
              exercise_id: exercise.exercise_id,
              rpe: exercise.rpe,
            })
            .select()
            .single();

          if (seError) throw seError;
          sessionExerciseId = newSe.id;
        } else {
          sessionExerciseId = existingExercises[0].id;
          // Update RPE if changed
          await supabase
            .from('session_exercises')
            .update({ rpe: exercise.rpe })
            .eq('id', sessionExerciseId);
        }

        // Sync sets
        const { data: existingSets } = await supabase
          .from('sets')
          .select('id, set_index')
          .eq('session_exercise_id', sessionExerciseId);

        const existingSetIndexes = new Set(existingSets?.map(s => s.set_index) || []);

        for (const set of exercise.sets) {
          if (existingSetIndexes.has(set.set_index)) {
            // Update existing set
            await supabase
              .from('sets')
              .update({ weight: set.weight, reps: set.reps })
              .eq('session_exercise_id', sessionExerciseId)
              .eq('set_index', set.set_index);
          } else {
            // Create new set
            await supabase
              .from('sets')
              .insert({
                session_exercise_id: sessionExerciseId,
                set_index: set.set_index,
                weight: set.weight,
                reps: set.reps,
              });
          }
        }

        // Delete extra sets that don't exist in draft
        const draftSetIndexes = new Set(exercise.sets.map(s => s.set_index));
        for (const existingSet of existingSets || []) {
          if (!draftSetIndexes.has(existingSet.set_index)) {
            await supabase
              .from('sets')
              .delete()
              .eq('id', existingSet.id);
          }
        }
      }

      // C) Handle pending complete
      if (currentDraft.pending_complete) {
        await supabase
          .from('sessions')
          .update({
            status: 'completed',
            completed_at: new Date().toISOString(),
          })
          .eq('id', currentDraft.session_id);

        await deleteDraft(userId);
        setDraft(null);
        queryClient.invalidateQueries({ queryKey: ['sessions'] });
        return true;
      }

      // Mark as synced
      currentDraft.sync_state = 'synced';
      currentDraft.last_saved_at = new Date().toISOString();
      setDraft(currentDraft);
      await saveDraft(currentDraft);

      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: ['session', currentDraft.session_id] });
      queryClient.invalidateQueries({ queryKey: ['session-exercises', currentDraft.session_id] });

      return true;
    } catch (error) {
      console.error('Failed to sync draft:', error);
      const errorDraft = { ...draft, sync_state: 'error' as SyncState };
      setDraft(errorDraft);
      await saveDraft(errorDraft);
      toast.error('Не удалось синхронизировать, данные сохранены на устройстве');
      return false;
    } finally {
      setIsSyncing(false);
    }
  }, [draft, userId, isOnline, queryClient]);

  // Add exercise
  const addExercise = useCallback((exerciseId: string, initialSets: { weight: number; reps: number }[]) => {
    updateDraft(d => addExerciseToDraft(d, exerciseId, initialSets));
  }, [updateDraft]);

  // Update exercise RPE
  const updateExerciseRpe = useCallback((tempId: string, rpe: number | null) => {
    updateDraft(d => updateExerciseInDraft(d, tempId, { rpe }));
  }, [updateDraft]);

  // Update set
  const updateSet = useCallback((tempExerciseId: string, setIndex: number, updates: { weight?: number; reps?: number }) => {
    updateDraft(d => updateSetInDraft(d, tempExerciseId, setIndex, updates));
  }, [updateDraft]);

  // Add set
  const addSet = useCallback((tempExerciseId: string, weight: number, reps: number) => {
    updateDraft(d => addSetToDraft(d, tempExerciseId, weight, reps));
  }, [updateDraft]);

  // Delete set
  const deleteSet = useCallback((tempExerciseId: string, setIndex: number) => {
    updateDraft(d => deleteSetFromDraft(d, tempExerciseId, setIndex));
  }, [updateDraft]);

  // Mark workout for completion (offline-safe)
  const finishWorkout = useCallback(async () => {
    if (!draft) return false;

    const updatedDraft = { ...draft, pending_complete: true, sync_state: 'dirty' as SyncState };
    setDraft(updatedDraft);
    await saveDraft(updatedDraft);

    if (isOnline) {
      return await syncDraftToSupabase();
    }

    toast.success('Тренировка сохранена, будет завершена при подключении к сети');
    return true;
  }, [draft, isOnline, syncDraftToSupabase]);

  // Clear draft
  const clearDraft = useCallback(async () => {
    if (!userId) return;
    await deleteDraft(userId);
    setDraft(null);
  }, [userId]);

  // Continue from existing draft
  const continueDraft = useCallback((existingDraft: DraftWorkout) => {
    setDraft(existingDraft);
  }, []);

  // Get exercise from draft by temp ID
  const getExercise = useCallback((tempId: string): DraftExercise | undefined => {
    return draft?.exercises.find(e => e.temp_session_exercise_id === tempId);
  }, [draft]);

  return {
    draft,
    isLoading,
    isSyncing,
    isOnline,
    syncState: draft?.sync_state || null,
    startNewWorkout,
    addExercise,
    updateExerciseRpe,
    updateSet,
    addSet,
    deleteSet,
    finishWorkout,
    clearDraft,
    continueDraft,
    syncDraftToSupabase,
    getExercise,
  };
}
