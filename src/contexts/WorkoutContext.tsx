import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
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
import { useAuth } from './AuthContext';

interface WorkoutContextType {
  draft: DraftWorkout | null;
  isLoading: boolean;
  isSyncing: boolean;
  isOnline: boolean;
  syncState: SyncState | null;
  hasActiveDraft: boolean;
  activeSessionId: string | null;
  startNewWorkout: (source?: string, templateId?: string | null) => Promise<DraftWorkout | null>;
  setActiveSession: (sessionId: string, draft?: DraftWorkout) => Promise<void>;
  addExercise: (exerciseId: string, initialSets: { weight: number; reps: number }[]) => void;
  updateExerciseRpe: (tempId: string, rpe: number | null) => void;
  updateSet: (tempExerciseId: string, setIndex: number, updates: { weight?: number; reps?: number }) => void;
  addSet: (tempExerciseId: string, weight: number, reps: number) => void;
  deleteSet: (tempExerciseId: string, setIndex: number) => void;
  finishWorkout: () => Promise<boolean>;
  clearDraft: () => Promise<void>;
  continueDraft: (existingDraft: DraftWorkout) => void;
  syncDraftToSupabase: () => Promise<boolean>;
  getExercise: (tempId: string) => DraftExercise | undefined;
  loadDraftFromServer: () => Promise<void>;
  refreshActiveSession: () => Promise<void>;
}

const WorkoutContext = createContext<WorkoutContextType | undefined>(undefined);

export function WorkoutProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id;
  
  const [draft, setDraft] = useState<DraftWorkout | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const queryClient = useQueryClient();
  const loadedRef = useRef(false);

  // Monitor online status
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
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

  // Load draft on mount - ONLY validate existing local draft
  useEffect(() => {
    if (!userId || loadedRef.current) {
      setIsLoading(false);
      return;
    }

    const loadDraft = async () => {
      loadedRef.current = true;
      
      // Check local draft first
      const localDraft = await getDraft(userId);
      
      if (localDraft?.session_id) {
        // CRITICAL: Verify session is still draft on server
        const { data: session } = await supabase
          .from('sessions')
          .select('id, status')
          .eq('id', localDraft.session_id)
          .maybeSingle();

        if (session && session.status === 'draft') {
          // Valid draft session exists
          setDraft(localDraft);
        } else {
          // Session completed/deleted - HARD CLEAR local draft
          console.log('[WorkoutContext] Session not draft, clearing local draft');
          await deleteDraft(userId);
          setDraft(null);
        }
      } else if (localDraft && !localDraft.session_id) {
        // Local draft without session_id (offline created) - keep it
        setDraft(localDraft);
      } else {
        // No local draft - do NOT auto-create from server
        setDraft(null);
      }

      setIsLoading(false);
    };

    loadDraft();
  }, [userId]);

  // Reset when user changes
  useEffect(() => {
    if (!userId) {
      setDraft(null);
      loadedRef.current = false;
    }
  }, [userId]);

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

  // HARD CLEAR - complete cleanup of all draft state
  const hardClearDraft = useCallback(async (reason: string) => {
    if (!userId) return;
    
    console.log(`[WorkoutContext] hardClearDraft called: ${reason}`);
    
    // 1. Clear local IndexedDB/localStorage draft
    await deleteDraft(userId);
    
    // 2. Clear React state
    setDraft(null);
    
    // 3. Invalidate queries
    queryClient.invalidateQueries({ queryKey: ['sessions'] });
  }, [userId, queryClient]);

  // Sync entire draft to Supabase
  const syncDraftToSupabase = useCallback(async (): Promise<boolean> => {
    if (!draft || !userId || !isOnline) return false;

    setIsSyncing(true);
    try {
      let currentDraft = { ...draft };

      // A) Create session if doesn't exist
      if (!currentDraft.session_id) {
        // DEDUPLICATION: Check for existing draft session first
        const { data: existingDraft } = await supabase
          .from('sessions')
          .select('id')
          .eq('user_id', userId)
          .eq('status', 'draft')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (existingDraft) {
          // Use existing draft instead of creating new one
          currentDraft.session_id = existingDraft.id;
        } else {
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
      }

      // B) Sync exercises and sets
      for (const exercise of currentDraft.exercises) {
        const { data: existingExercises } = await supabase
          .from('session_exercises')
          .select('id')
          .eq('session_id', currentDraft.session_id)
          .eq('exercise_id', exercise.exercise_id);

        let sessionExerciseId: string;

        if (!existingExercises || existingExercises.length === 0) {
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
          await supabase
            .from('session_exercises')
            .update({ rpe: exercise.rpe })
            .eq('id', sessionExerciseId);
        }

        const { data: existingSets } = await supabase
          .from('sets')
          .select('id, set_index')
          .eq('session_exercise_id', sessionExerciseId);

        const existingSetIndexes = new Set(existingSets?.map(s => s.set_index) || []);

        for (const set of exercise.sets) {
          if (existingSetIndexes.has(set.set_index)) {
            await supabase
              .from('sets')
              .update({ weight: set.weight, reps: set.reps })
              .eq('session_exercise_id', sessionExerciseId)
              .eq('set_index', set.set_index);
          } else {
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

      // C) Handle pending complete - HARD CLEANUP
      if (currentDraft.pending_complete) {
        await supabase
          .from('sessions')
          .update({
            status: 'completed',
            completed_at: new Date().toISOString(),
          })
          .eq('id', currentDraft.session_id);

        // HARD CLEAR after completion
        await hardClearDraft('workout_completed');
        return true;
      }

      // Mark as synced
      currentDraft.sync_state = 'synced';
      currentDraft.last_saved_at = new Date().toISOString();
      setDraft(currentDraft);
      await saveDraft(currentDraft);

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
  }, [draft, userId, isOnline, queryClient, hardClearDraft]);

  // Create new workout - WITH DEDUPLICATION
  const startNewWorkout = useCallback(async (source: string = 'empty', templateId?: string | null): Promise<DraftWorkout | null> => {
    if (!userId) return null;

    // DEDUPLICATION: Check for existing draft session first
    if (isOnline) {
      const { data: existingDraft } = await supabase
        .from('sessions')
        .select('id, date, source, template_id')
        .eq('user_id', userId)
        .eq('status', 'draft')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingDraft) {
        console.log('[WorkoutContext] Found existing draft, reusing:', existingDraft.id);
        // Load and return existing draft instead of creating new
        await setActiveSession(existingDraft.id);
        return draft;
      }
    }

    const newDraft = createNewDraft(userId, source, templateId);
    setDraft(newDraft);
    await saveDraft(newDraft);

    if (isOnline) {
      try {
        const { data: session, error } = await supabase
          .from('sessions')
          .insert({
            user_id: userId,
            date: newDraft.started_at,
            source: newDraft.session.source,
            template_id: newDraft.session.template_id,
            status: 'draft',
          })
          .select()
          .single();

        if (error) throw error;

        const updated = {
          ...newDraft,
          session_id: session.id,
          sync_state: 'synced' as SyncState,
        };
        setDraft(updated);
        await saveDraft(updated);
        return updated;
      } catch (error) {
        console.error('Failed to sync new session:', error);
        const updated = { ...newDraft, sync_state: 'error' as SyncState };
        setDraft(updated);
        await saveDraft(updated);
        return updated;
      }
    }

    return newDraft;
  }, [userId, isOnline, draft]);

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

  // Mark workout for completion
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

  // Clear draft (public API - uses hardClearDraft)
  const clearDraft = useCallback(async () => {
    await hardClearDraft('user_action');
  }, [hardClearDraft]);

  // Set active session (for external session creation like repeat/template)
  const setActiveSession = useCallback(async (sessionId: string, existingDraft?: DraftWorkout) => {
    if (!userId) return;
    
    if (existingDraft) {
      const updatedDraft = { ...existingDraft, session_id: sessionId, sync_state: 'synced' as SyncState };
      setDraft(updatedDraft);
      await saveDraft(updatedDraft);
    } else {
      // Load session data from server and create draft
      const { data: serverSession } = await supabase
        .from('sessions')
        .select('id, date, source, template_id, status')
        .eq('id', sessionId)
        .single();

      // CRITICAL: Only load if session is actually draft
      if (serverSession && serverSession.status === 'draft') {
        const { data: serverExercises } = await supabase
          .from('session_exercises')
          .select('id, exercise_id, rpe')
          .eq('session_id', sessionId);

        const exercises: DraftExercise[] = [];
        
        for (const se of serverExercises || []) {
          const { data: sets } = await supabase
            .from('sets')
            .select('set_index, weight, reps')
            .eq('session_exercise_id', se.id)
            .order('set_index');

          exercises.push({
            temp_session_exercise_id: se.id,
            exercise_id: se.exercise_id,
            rpe: se.rpe,
            sets: sets?.map(s => ({
              set_index: s.set_index,
              weight: s.weight,
              reps: s.reps,
            })) || [],
          });
        }

        const newDraft: DraftWorkout = {
          user_id: userId,
          session_id: sessionId,
          started_at: serverSession.date,
          session: {
            source: serverSession.source,
            template_id: serverSession.template_id,
          },
          exercises,
          last_saved_at: new Date().toISOString(),
          sync_state: 'synced',
        };

        setDraft(newDraft);
        await saveDraft(newDraft);
      } else {
        // Session not draft - do not set active
        console.log('[WorkoutContext] setActiveSession: session not draft, ignoring');
      }
    }
  }, [userId]);

  // Continue from existing draft
  const continueDraft = useCallback((existingDraft: DraftWorkout) => {
    setDraft(existingDraft);
  }, []);

  // Get exercise from draft by temp ID
  const getExercise = useCallback((tempId: string): DraftExercise | undefined => {
    return draft?.exercises.find(e => e.temp_session_exercise_id === tempId);
  }, [draft]);

  // Load draft from server (for recovery)
  const loadDraftFromServer = useCallback(async () => {
    if (!userId) return;
    loadedRef.current = false;
    setIsLoading(true);
  }, [userId]);

  // Refresh active session - ONLY validate existing local draft
  const refreshActiveSession = useCallback(async () => {
    if (!userId) return;

    // Check local draft
    const localDraft = await getDraft(userId);
    
    if (!localDraft) {
      // No local draft - just clear state, do NOT auto-fetch from server
      setDraft(null);
      return;
    }

    if (localDraft.session_id) {
      // Verify session is still draft on server
      const { data: session } = await supabase
        .from('sessions')
        .select('id, status')
        .eq('id', localDraft.session_id)
        .maybeSingle();

      if (session && session.status === 'draft') {
        // Valid - update state
        setDraft(localDraft);
      } else {
        // Session completed/deleted - HARD CLEAR
        console.log('[WorkoutContext] refreshActiveSession: session not draft, clearing');
        await hardClearDraft('server_not_draft');
      }
    } else {
      // Local draft without session_id (offline) - keep it
      setDraft(localDraft);
    }
  }, [userId, hardClearDraft]);

  // hasActiveDraft: ONLY true if we have a session_id that we believe is draft
  const hasActiveDraft = !!(draft?.session_id);
  const activeSessionId = draft?.session_id || null;

  return (
    <WorkoutContext.Provider
      value={{
        draft,
        isLoading,
        isSyncing,
        isOnline,
        syncState: draft?.sync_state || null,
        hasActiveDraft,
        activeSessionId,
        startNewWorkout,
        setActiveSession,
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
        loadDraftFromServer,
        refreshActiveSession,
      }}
    >
      {children}
    </WorkoutContext.Provider>
  );
}

export function useWorkout() {
  const context = useContext(WorkoutContext);
  if (context === undefined) {
    throw new Error('useWorkout must be used within a WorkoutProvider');
  }
  return context;
}
