import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Check, ChevronRight, Timer, Dumbbell, Play, RotateCcw, Loader2, Undo2, MoreVertical, Trash2, RefreshCw } from "lucide-react";
import { WorkoutCompletionOverlay } from "@/components/WorkoutCompletionOverlay";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Layout } from "@/components/Layout";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { useSessionExercises, SessionExercise } from "@/hooks/useSessions";
import { Exercise } from "@/hooks/useExercises";
import { useActiveSessionCache, CachedSet, CachedSessionExercise } from "@/hooks/useActiveSessionCache";
import { getLastLoggedSets } from "@/lib/getLastLoggedSets";
import { flushWorkout } from "@/lib/flushWorkout";
import { DraggableExerciseList } from "@/components/DraggableExerciseList";
import { ExercisePicker } from "@/components/ExercisePicker";
import { SyncIndicator } from "@/components/SyncIndicator";
import { TemplateSaveModal } from "@/components/TemplateSaveModal";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { calculateProgressionForSession } from "@/lib/progression";
import { pushTraceEvent, isDevTraceEnabled } from "@/lib/devTraceStore";
import { useWorkout } from "@/contexts/WorkoutContext";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { SessionListItem } from "@/hooks/useHistorySessions";
import { useTouchSessionActivity } from '@/hooks/useTouchSessionActivity';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface TemplateSnapshotItem {
  exercise_id: string;
  target_sets: number;
  sort_order: number;
}

interface SessionTimerData {
  elapsed_seconds: number;
  timer_running: boolean;
  timer_last_started_at: string | null;
}

interface SessionMetadata {
  source: string;
  template_id: string | null;
  template_snapshot: TemplateSnapshotItem[] | null;
}

export default function Workout() {
  const navigate = useNavigate();
  const { t, locale } = useLanguage();
  const { user } = useAuth();
  
  const { 
    activeSessionId,
    hasActiveDraft,
    syncState, 
    isOnline, 
    isSyncing, 
    isLoading: isDraftLoading,
    syncDraftToSupabase, 
    clearDraft, 
    refreshActiveSession,
    startNewWorkout,
    setActiveSession,
  } = useWorkout();
  
  const sessionId = activeSessionId;
  const { touch } = useTouchSessionActivity({ sessionId });
  
  const { exercises: sessionExercises, isLoading, addExercise, deleteExercise, replaceExercise, reorderExercises } = useSessionExercises(sessionId);
  const { session: cachedSession, replaceExerciseOptimistic, updateExerciseSortOrderOptimistic, addExerciseOptimistic, initializeEmptySession, syncExerciseWithServerIds, syncSetIdsForExercise } = useActiveSessionCache(sessionId);
  const [showPicker, setShowPicker] = useState(false);
  const [pickerMode, setPickerMode] = useState<'add' | 'replace'>('add');
  const [replacingExerciseId, setReplacingExerciseId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [exerciseToDelete, setExerciseToDelete] = useState<{ id: string; name: string } | null>(null);
  const [workoutTime, setWorkoutTime] = useState(0);
  const [isFinishing, setIsFinishing] = useState(false);
  const [completionStatus, setCompletionStatus] = useState<'saving' | 'syncing' | 'offline_queued' | 'success' | null>(null);
  const [completionStep, setCompletionStep] = useState<1 | 2 | 3>(1);
  const queryClient = useQueryClient();
  const [isStarting, setIsStarting] = useState(false);
  const [isRepeating, setIsRepeating] = useState(false);
  const [timerData, setTimerData] = useState<SessionTimerData | null>(null);
  const [lastCompletedSessionId, setLastCompletedSessionId] = useState<string | null>(null);
  const [undoAvailableUntil, setUndoAvailableUntil] = useState<Date | null>(null);
  const [isUndoing, setIsUndoing] = useState(false);
  const undoToastIdRef = useRef<string | number | null>(null);
  const completionRequestIdRef = useRef<string | null>(null);
  
  // Template save modal state
  const [showTemplateSaveModal, setShowTemplateSaveModal] = useState(false);
  const [pendingFinishData, setPendingFinishData] = useState<{
    sessionId: string;
    templateId: string;
    templateName: string;
    finalElapsed: number;
  } | null>(null);
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  const [sessionMetadata, setSessionMetadata] = useState<SessionMetadata | null>(null);

  // Refresh active session on mount and visibility change
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshActiveSession();
      }
    };

    const handleFocus = () => {
      refreshActiveSession();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);
    refreshActiveSession();

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [refreshActiveSession]);

  // Fetch session timer data and metadata
  useEffect(() => {
    if (!sessionId) {
      setTimerData(null);
      setWorkoutTime(0);
      setSessionMetadata(null);
      return;
    }

    const fetchSessionData = async () => {
      const { data } = await supabase
        .from('sessions')
        .select('elapsed_seconds, timer_running, timer_last_started_at, source, template_id, template_snapshot')
        .eq('id', sessionId)
        .single();
      
      if (data) {
        setTimerData({
          elapsed_seconds: data.elapsed_seconds || 0,
          timer_running: data.timer_running ?? true,
          timer_last_started_at: data.timer_last_started_at,
        });
        setSessionMetadata({
          source: data.source,
          template_id: data.template_id,
          template_snapshot: data.template_snapshot as unknown as TemplateSnapshotItem[] | null,
        });
      }
    };

    fetchSessionData();
  }, [sessionId]);

  // Initialize last_activity_at when draft becomes active
  useEffect(() => {
    if (!sessionId) return;
    touch();
  }, [sessionId, touch]);

  // Server-based timer calculation
  useEffect(() => {
    if (!timerData) return;

    const calculateTime = () => {
      let total = timerData.elapsed_seconds;
      if (timerData.timer_running && timerData.timer_last_started_at) {
        const lastStart = new Date(timerData.timer_last_started_at).getTime();
        const now = Date.now();
        total += Math.floor((now - lastStart) / 1000);
      }
      setWorkoutTime(total);
    };

    calculateTime();
    const interval = setInterval(calculateTime, 1000);
    return () => clearInterval(interval);
  }, [timerData]);

  // Dismiss undo toast when undo window expires
  useEffect(() => {
    if (!undoAvailableUntil) return;

    const checkExpiry = () => {
      if (new Date() > undoAvailableUntil) {
        if (undoToastIdRef.current) {
          toast.dismiss(undoToastIdRef.current);
          undoToastIdRef.current = null;
        }
        setUndoAvailableUntil(null);
        setLastCompletedSessionId(null);
      }
    };

    const interval = setInterval(checkExpiry, 1000);
    return () => clearInterval(interval);
  }, [undoAvailableUntil]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleSelectExercise = async (exercise: Exercise) => {
    if (!sessionId || !user) return;

    touch();

    try {
      const { data: exerciseState } = await supabase
        .from('exercise_state')
        .select('current_sets')
        .eq('exercise_id', exercise.id)
        .maybeSingle();

      const setsCount = exerciseState?.current_sets || 3;

      // Fetch last completed performance via getLastLoggedSets (strict by set.id)
      const lastLogged = await getLastLoggedSets({
        userId: user.id,
        exerciseId: exercise.id,
        exerciseName: exercise.name,
        excludeSessionId: sessionId,
      });

      // Default fallback values when no history exists
      const defaultReps = exercise.type <= 2 ? 6 : 10;

      // Build initial sets: each set gets its matching historical values by set_index
      const initialSets = Array.from({ length: setsCount }, (_, index) => {
        const setIndex = index + 1;
        const prevSet = lastLogged?.sets.find(s => s.set_index === setIndex);
        // If no exact match for this set_index, fall back to last set in history (for extra sets)
        const fallbackSet = prevSet ?? (lastLogged?.sets.length ? lastLogged.sets[lastLogged.sets.length - 1] : null);
        
        return {
          weight: fallbackSet?.weight ?? 0,
          reps: fallbackSet?.reps ?? defaultReps,
          prev_weight: prevSet?.weight ?? null,
          prev_reps: prevSet?.reps ?? null,
          prev_rpe: prevSet?.rpe ?? null,
        };
      });

      if (pickerMode === 'replace' && replacingExerciseId) {
        // Capture old exercise_id and set IDs before replace for tracing
        const oldExercise = cachedSession?.exercises.find(e => e.id === replacingExerciseId);
        const oldExerciseId = oldExercise?.exercise_id || '';
        const setIdsBefore = oldExercise?.sets.map(s => s.id) || [];

        // Optimistic update: immediately update the cache before DB sync
        // For replace mode, fill current values from previous + also store prev_*
        const tempSets: CachedSet[] = initialSets.map((set, index) => ({
          id: crypto.randomUUID(),
          session_exercise_id: replacingExerciseId,
          set_index: index + 1,
          weight: set.weight,
          reps: set.reps,
          is_completed: false,
          rpe: null,
          prev_weight: set.prev_weight,
          prev_reps: set.prev_reps,
          prev_rpe: set.prev_rpe,
        }));
        
        const exerciseInfo = {
          id: exercise.id,
          name: exercise.name,
          type: exercise.type,
          increment_kind: exercise.increment_kind,
          increment_value: exercise.increment_value,
        };
        
        // Apply optimistic update immediately
        replaceExerciseOptimistic(replacingExerciseId, exercise.id, exerciseInfo, tempSets);

        // E2 trace: exercise replacement
        if (isDevTraceEnabled()) {
          pushTraceEvent({
            type: 'EXERCISE_REPLACE',
            session_id: sessionId!,
            session_exercise_id: replacingExerciseId,
            old_exercise_id: oldExerciseId,
            new_exercise_id: exercise.id,
            set_ids_before: setIdsBefore,
            set_ids_after: tempSets.map(s => s.id),
            active_set_id: tempSets[0]?.id || null,
          });
        }
        
        // Then sync to database (in background) and get real set IDs
        replaceExercise({
          oldSessionExerciseId: replacingExerciseId,
          newExerciseId: exercise.id,
          initialSets,
        }).then((serverResult) => {
          // Sync real set IDs to cache
          if (serverResult?.created_sets) {
            syncSetIdsForExercise(replacingExerciseId, serverResult.created_sets);
            console.log('[Workout] Replace: synced set IDs:', serverResult.created_sets.map(s => s.id));
          }
        }).catch((error) => {
          console.error('Failed to replace exercise:', error);
          toast.error(locale === 'ru' ? 'Ошибка замены' : 'Failed to replace');
        });
        
        toast.success(locale === 'ru' ? 'Упражнение заменено' : 'Exercise replaced');
        setReplacingExerciseId(null);
      } else {
        // Optimistic update for adding new exercise
        // For add mode: current values stay 0/default, only fill prev_* for comparison
        const tempSessionExerciseId = crypto.randomUUID();
        const maxOrder = sessionExercises.length > 0 
          ? Math.max(...sessionExercises.map(e => e.sort_order ?? 0)) 
          : 0;
        
        const tempSets: CachedSet[] = initialSets.map((set, index) => ({
          id: crypto.randomUUID(),
          session_exercise_id: tempSessionExerciseId,
          set_index: index + 1,
          weight: set.weight,
          reps: set.reps,
          is_completed: false,
          rpe: null,
          prev_weight: set.prev_weight,
          prev_reps: set.prev_reps,
          prev_rpe: set.prev_rpe,
        }));
        
        const optimisticExercise: CachedSessionExercise = {
          id: tempSessionExerciseId,
          session_id: sessionId,
          exercise_id: exercise.id,
          rpe: null,
          rpe_display: null,
          active_set_index: 1,
          sort_order: maxOrder + 1,
          exercise: {
            id: exercise.id,
            name: exercise.name,
            type: exercise.type,
            increment_kind: exercise.increment_kind,
            increment_value: exercise.increment_value,
          },
          sets: tempSets,
        };
        
        // Apply optimistic update immediately
        addExerciseOptimistic(optimisticExercise);
        
        // Then sync to database in background and get real IDs
        addExercise({ exerciseId: exercise.id, initialSets })
          .then((serverExercise) => {
            // Update cache with real server IDs (exercise ID + set IDs)
            if (serverExercise) {
              const serverSets = serverExercise.created_sets || [];
              if (serverExercise.id !== tempSessionExerciseId || serverSets.length > 0) {
                syncExerciseWithServerIds(tempSessionExerciseId, serverExercise.id, serverSets);
                console.log('[Workout] Add: synced IDs:', serverExercise.id, serverSets.map(s => s.id));
              }
            }
          })
          .catch((error) => {
            console.error('Failed to add exercise:', error);
            toast.error(locale === 'ru' ? 'Ошибка добавления' : 'Failed to add');
            // Rollback optimistic update
            queryClient.invalidateQueries({ queryKey: queryKeys.sessions.fullCache(sessionId) });
          });
        
        toast.success(
          lastLogged 
            ? (locale === 'ru' ? 'Подставили по прошлой тренировке' : 'Auto-filled from last workout')
            : (locale === 'ru' ? 'Упражнение добавлено' : 'Exercise added')
        );
      }
      
      setShowPicker(false);
      setPickerMode('add');
    } catch (error) {
      console.error('Failed to handle exercise:', error);
      toast.error(locale === 'ru' ? 'Ошибка' : 'Error');
    }
  };

  const handleOpenReplacePicker = (sessionExerciseId: string) => {
    setReplacingExerciseId(sessionExerciseId);
    setPickerMode('replace');
    setShowPicker(true);
  };

  const handleConfirmDelete = async () => {
    if (!exerciseToDelete) return;

    touch();
    
    try {
      await deleteExercise(exerciseToDelete.id);
      toast.success(locale === 'ru' ? 'Упражнение удалено' : 'Exercise removed');
    } catch (error) {
      console.error('Failed to delete exercise:', error);
      toast.error(locale === 'ru' ? 'Ошибка удаления' : 'Failed to delete');
    } finally {
      setDeleteDialogOpen(false);
      setExerciseToDelete(null);
    }
  };

  const handleOpenDeleteDialog = (id: string, name: string) => {
    setExerciseToDelete({ id, name });
    setDeleteDialogOpen(true);
  };

  const handleReorderExercises = async (newOrder: { id: string; sort_order: number }[]) => {
    touch();
    // Optimistic update: immediately update the cache
    updateExerciseSortOrderOptimistic(newOrder);
    // Then sync to database
    await reorderExercises(newOrder);
  };

  const handleUndoWorkout = useCallback(async () => {
    if (!lastCompletedSessionId || !user) return;

    setIsUndoing(true);
    try {
      // Call RPC to undo - server handles all validation
      const { data, error } = await supabase.rpc('undo_complete_session', {
        session_id: lastCompletedSessionId,
      });

      if (error) {
        console.error('RPC error:', error);
        if (error.message.includes('undo_not_available')) {
          toast.error(locale === 'ru' ? 'Время отмены истекло' : 'Undo time expired');
          setUndoAvailableUntil(null);
          setLastCompletedSessionId(null);
        } else if (error.message.includes('session_not_found')) {
          toast.error(locale === 'ru' ? 'Сессия не найдена' : 'Session not found');
        } else {
          toast.error(locale === 'ru' ? 'Ошибка отмены' : 'Failed to undo');
        }
        return;
      }

      // Restore local draft from server
      await setActiveSession(lastCompletedSessionId);

      // Dismiss undo toast
      if (undoToastIdRef.current) {
        toast.dismiss(undoToastIdRef.current);
        undoToastIdRef.current = null;
      }

      setUndoAvailableUntil(null);
      setLastCompletedSessionId(null);

      toast.success(locale === 'ru' ? 'Тренировка восстановлена' : 'Workout restored');
    } catch (error) {
      console.error('Failed to undo workout:', error);
      toast.error(locale === 'ru' ? 'Ошибка отмены' : 'Failed to undo');
    } finally {
      setIsUndoing(false);
    }
  }, [lastCompletedSessionId, user, locale, setActiveSession]);

  // Check if workout differs from template snapshot
  const checkWorkoutDifference = useCallback(() => {
    if (!sessionMetadata?.template_snapshot || !sessionMetadata?.template_id) {
      return false;
    }

    const snapshot = sessionMetadata.template_snapshot;
    const current = sessionExercises.map((se, index) => ({
      exercise_id: se.exercise_id,
      sort_order: index + 1,
    }));

    // Check if exercise count differs
    if (snapshot.length !== current.length) return true;

    // Check if exercise order or composition differs
    for (let i = 0; i < snapshot.length; i++) {
      if (snapshot[i].exercise_id !== current[i].exercise_id) return true;
    }

    return false;
  }, [sessionMetadata, sessionExercises]);

  // Complete the workout (called after modal decision or directly)
  // Two-phase completion: Phase A (optimistic local + history), Phase B (background sync)
  const completeWorkout = useCallback(async (finalElapsed: number) => {
    if (!sessionId || !user) return;
    
    // Anti-duplicate: generate unique request ID
    const requestId = crypto.randomUUID();
    if (completionRequestIdRef.current) {
      console.log('[Workout] Completion already in progress, ignoring duplicate');
      return;
    }
    completionRequestIdRef.current = requestId;
    
    // FLUSH ALL SETS BEFORE COMPLETION (anti-data-loss: batch upsert by set.id)
    const allSets = cachedSession?.exercises.flatMap(e => e.sets) ?? [];
    console.log('[Workout] flushWorkout: flushing', allSets.length, 'sets before completion');
    const flushResult = await flushWorkout(allSets, isOnline);
    
    if (flushResult.failed > 0) {
      console.warn('[Workout] flushWorkout: some sets failed to flush:', flushResult.failed);
      // Continue anyway — data is in outbox for retry
    }

    // E3 trace: workout completion — P0 FIX: real payload check
    if (isDevTraceEnabled()) {
      // Check that every set in the flush payload actually has the rpe key present
      const everySetHasRpeKey = allSets.every(s => 'rpe' in s);
      pushTraceEvent({
        type: 'WORKOUT_COMPLETE',
        session_id: sessionId,
        count_sets_in_cache: allSets.length,
        count_sets_upserted: flushResult.flushed,
        includes_rpe_field: everySetHasRpeKey,
        db_result: flushResult.offline ? 'offline' : flushResult.failed > 0 ? 'error' : 'ok',
        outbox_queued: flushResult.offline || flushResult.failed > 0,
      });
    }
    
    // PHASE A: Optimistic UI update (instant)
    setCompletionStep(1);
    setCompletionStatus('saving');
    const completedSessionId = sessionId;
    const now = new Date();
    const undoUntil = new Date(now.getTime() + 10 * 60 * 1000); // 10 minutes
    
    // Store for undo immediately
    setLastCompletedSessionId(completedSessionId);
    setUndoAvailableUntil(undoUntil);
    
    // Clear local draft immediately (prevents resurrection)
    await clearDraft();
    
    // OPTIMISTIC: Insert into history cache immediately with pending status
    const optimisticSession: SessionListItem & { _pending?: boolean } = {
      id: completedSessionId,
      date: now.toISOString(),
      completed_at: now.toISOString(),
      undo_available_until: undoUntil.toISOString(),
      source: sessionMetadata?.source || 'empty',
      template_id: sessionMetadata?.template_id || null,
      template_name: null, // Will be updated on server sync
      exercise_count: sessionExercises.length,
      set_count: 0, // Will be updated after sync
      _pending: true,
    };
    
    // Prepend to history cache
    queryClient.setQueryData(
      queryKeys.sessions.completedList(user.id),
      (oldData: { pages: { data: SessionListItem[]; nextCursor: string | null }[]; pageParams: (string | null)[] } | undefined) => {
        if (!oldData) {
          return {
            pages: [{ data: [optimisticSession], nextCursor: null }],
            pageParams: [null],
          };
        }
        return {
          ...oldData,
          pages: oldData.pages.map((page, idx) => 
            idx === 0 
              ? { ...page, data: [optimisticSession, ...page.data.filter(s => s.id !== completedSessionId)] }
              : page
          ),
        };
      }
    );
    
    // PHASE B: Background sync with timeout
    setCompletionStep(2);
    setCompletionStatus('syncing');
    
    const syncWithTimeout = async (): Promise<'success' | 'timeout' | 'error'> => {
      const timeoutPromise = new Promise<'timeout'>((resolve) => 
        setTimeout(() => resolve('timeout'), 3000)
      );
      
      const syncPromise = (async (): Promise<'success' | 'error'> => {
        try {
          // Calculate progression for all exercises in the session
          await calculateProgressionForSession(completedSessionId, user.id);
          
          // Update session status to completed with undo window
          const { error } = await supabase
            .from('sessions')
            .update({ 
              status: 'completed',
              completed_at: now.toISOString(),
              elapsed_seconds: finalElapsed,
              timer_running: false,
              undo_available_until: undoUntil.toISOString(),
            })
            .eq('id', completedSessionId);

          if (error) throw error;
          return 'success';
        } catch (error) {
          console.error('Failed to sync workout completion:', error);
          return 'error';
        }
      })();
      
      return Promise.race([syncPromise, timeoutPromise]);
    };
    
    const result = await syncWithTimeout();
    
    setCompletionStep(3);
    
    if (result === 'success') {
      setCompletionStatus('success');
      
      // Update history cache to remove pending status
      queryClient.setQueryData(
        queryKeys.sessions.completedList(user.id),
        (oldData: { pages: { data: (SessionListItem & { _pending?: boolean })[]; nextCursor: string | null }[]; pageParams: (string | null)[] } | undefined) => {
          if (!oldData) return oldData;
          return {
            ...oldData,
            pages: oldData.pages.map(page => ({
              ...page,
              data: page.data.map(s => 
                s.id === completedSessionId ? { ...s, _pending: undefined } : s
              ),
            })),
          };
        }
      );
      
      // Brief success state, then clear overlay (NO auto-navigate)
      setTimeout(() => {
        setCompletionStatus(null);
        setCompletionStep(1);
        completionRequestIdRef.current = null;
        
        // Show toast with undo button
        undoToastIdRef.current = toast.success(
          locale === 'ru' ? 'Тренировка завершена!' : 'Workout finished!',
          {
            duration: 10000,
            action: {
              label: locale === 'ru' ? 'Отменить' : 'Undo',
              onClick: () => {
                handleUndoWorkout();
              },
            },
          }
        );
        
        // NO navigate('/') - let user stay on current screen
      }, 300);
    } else {
      // Timeout or error - treat as offline, queue for later sync
      setCompletionStatus('offline_queued');
      
      // P0 FIX: Set status to completed_pending in DB so history can find it
      try {
        await supabase
          .from('sessions')
          .update({
            status: 'completed_pending',
            completed_at: now.toISOString(),
            elapsed_seconds: finalElapsed,
            timer_running: false,
            undo_available_until: undoUntil.toISOString(),
          })
          .eq('id', completedSessionId);
      } catch (e) {
        console.warn('[Workout] Failed to set completed_pending:', e);
      }
      
      // Store pending completion in localStorage for retry
      localStorage.setItem(`pending_completion_${completedSessionId}`, JSON.stringify({
        sessionId: completedSessionId,
        finalElapsed,
        completedAt: now.toISOString(),
        undoUntil: undoUntil.toISOString(),
      }));
      
      setTimeout(() => {
        setCompletionStatus(null);
        setCompletionStep(1);
        completionRequestIdRef.current = null;
      }, 800);
    }
  }, [sessionId, user, locale, clearDraft, handleUndoWorkout, navigate, queryClient, sessionMetadata, sessionExercises]);

  const handleFinishWorkout = async () => {
    if (!sessionId || !user) return;
    
    // Anti-duplicate check
    if (completionRequestIdRef.current) {
      console.log('[Workout] Completion already in progress');
      return;
    }
    
    setIsFinishing(true);
    try {
      // Stop timer and calculate final elapsed time
      let finalElapsed = timerData?.elapsed_seconds || 0;
      if (timerData?.timer_running && timerData?.timer_last_started_at) {
        const lastStart = new Date(timerData.timer_last_started_at).getTime();
        finalElapsed += Math.floor((Date.now() - lastStart) / 1000);
      }

      // Check if this is a template-based workout with changes
      if (sessionMetadata?.source === 'template' && sessionMetadata?.template_id && checkWorkoutDifference()) {
        // Fetch template name
        const { data: template } = await supabase
          .from('workout_templates')
          .select('name')
          .eq('id', sessionMetadata.template_id)
          .single();

        if (template) {
          // Show modal instead of completing
          setPendingFinishData({
            sessionId,
            templateId: sessionMetadata.template_id,
            templateName: template.name,
            finalElapsed,
          });
          setShowTemplateSaveModal(true);
          setIsFinishing(false);
          return;
        }
      }

      // Complete workout directly
      await completeWorkout(finalElapsed);
    } catch (error) {
      console.error('Failed to finish workout:', error);
      toast.error('Failed to finish workout');
      completionRequestIdRef.current = null;
      setCompletionStatus(null);
    } finally {
      setIsFinishing(false);
    }
  };

  // Template save handlers
  const handleCreateNewTemplate = async (name: string) => {
    if (!pendingFinishData || !user) return;
    
    setIsSavingTemplate(true);
    try {
      // Create new template
      const { data: newTemplate, error: templateError } = await supabase
        .from('workout_templates')
        .insert({
          user_id: user.id,
          name,
        })
        .select()
        .single();

      if (templateError) throw templateError;

      // Get set counts for each session exercise
      const templateItems = await Promise.all(
        sessionExercises.map(async (se, index) => {
          const { count } = await supabase
            .from('sets')
            .select('*', { count: 'exact', head: true })
            .eq('session_exercise_id', se.id);
          
          return {
            template_id: newTemplate.id,
            exercise_id: se.exercise_id,
            target_sets: count || 3,
            sort_order: index + 1,
          };
        })
      );

      await supabase.from('template_items').insert(templateItems);

      toast.success(locale === 'ru' ? 'Новый шаблон создан' : 'New template created');
      
      // Complete the workout
      await completeWorkout(pendingFinishData.finalElapsed);
    } catch (error) {
      console.error('Failed to create template:', error);
      toast.error(locale === 'ru' ? 'Ошибка создания шаблона' : 'Failed to create template');
    } finally {
      setIsSavingTemplate(false);
      setShowTemplateSaveModal(false);
      setPendingFinishData(null);
    }
  };

  const handleUpdateExistingTemplate = async () => {
    if (!pendingFinishData) return;
    
    setIsSavingTemplate(true);
    try {
      // Delete old template items
      await supabase
        .from('template_items')
        .delete()
        .eq('template_id', pendingFinishData.templateId);

      // Get set counts for each session exercise
      const templateItems = await Promise.all(
        sessionExercises.map(async (se, index) => {
          const { count } = await supabase
            .from('sets')
            .select('*', { count: 'exact', head: true })
            .eq('session_exercise_id', se.id);
          
          return {
            template_id: pendingFinishData.templateId,
            exercise_id: se.exercise_id,
            target_sets: count || 3,
            sort_order: index + 1,
          };
        })
      );

      await supabase.from('template_items').insert(templateItems);

      toast.success(locale === 'ru' ? 'Шаблон обновлён' : 'Template updated');
      
      // Complete the workout
      await completeWorkout(pendingFinishData.finalElapsed);
    } catch (error) {
      console.error('Failed to update template:', error);
      toast.error(locale === 'ru' ? 'Ошибка обновления шаблона' : 'Failed to update template');
    } finally {
      setIsSavingTemplate(false);
      setShowTemplateSaveModal(false);
      setPendingFinishData(null);
    }
  };

  const handleSkipTemplateSave = async () => {
    if (!pendingFinishData) return;
    
    setShowTemplateSaveModal(false);
    await completeWorkout(pendingFinishData.finalElapsed);
    setPendingFinishData(null);
  };

  const handleStartWorkout = async () => {
    setIsStarting(true);
    try {
      const newDraft = await startNewWorkout('empty');
      if (newDraft?.session_id) {
        // Initialize the session cache immediately for instant exercise opening
        initializeEmptySession(newDraft.session_id, 'empty');
      }
    } catch (error) {
      console.error('Failed to create session:', error);
      toast.error('Failed to start workout');
    } finally {
      setIsStarting(false);
    }
  };

  const handleRepeatLastWorkout = async () => {
    if (!user) {
      toast.error(t('noLastWorkout'));
      return;
    }

    setIsRepeating(true);
    try {
      const { data: lastSession, error: lastError } = await supabase
        .from('sessions')
        .select('id')
        .eq('user_id', user.id)
        .eq('status', 'completed')
        .order('completed_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (lastError || !lastSession) {
        toast.error(t('noLastWorkout'));
        setIsRepeating(false);
        return;
      }

      // DEDUPLICATION: Check for any remaining draft sessions
      const { data: existingDraft } = await supabase
        .from('sessions')
        .select('id')
        .eq('user_id', user.id)
        .eq('status', 'draft')
        .limit(1)
        .maybeSingle();

      if (existingDraft) {
        await supabase.from('sessions').delete().eq('id', existingDraft.id);
      }

      const now = new Date().toISOString();
      const { data: newSession, error: sessionError } = await supabase
        .from('sessions')
        .insert({
          user_id: user.id,
          date: now,
          source: 'repeat',
          status: 'draft',
          started_at: now,
          timer_last_started_at: now,
          elapsed_seconds: 0,
          timer_running: true,
        })
        .select()
        .single();

      if (sessionError) throw sessionError;

      const { data: lastExercises } = await supabase
        .from('session_exercises')
        .select('*')
        .eq('session_id', lastSession.id);

      for (const se of lastExercises || []) {
        const { data: newSe } = await supabase
          .from('session_exercises')
          .insert({
            session_id: newSession.id,
            exercise_id: se.exercise_id,
          })
          .select()
          .single();

        if (!newSe) continue;

        const { data: lastSets } = await supabase
          .from('sets')
          .select('*')
          .eq('session_exercise_id', se.id)
          .order('set_index');

        if (lastSets && lastSets.length > 0) {
          const newSets = lastSets.map(s => ({
            session_exercise_id: newSe.id,
            set_index: s.set_index,
            weight: s.weight,
            reps: s.reps,
          }));

          await supabase.from('sets').insert(newSets);
        }
      }

      await setActiveSession(newSession.id);
    } catch (error) {
      console.error('Failed to repeat workout:', error);
      toast.error('Failed to repeat workout');
    } finally {
      setIsRepeating(false);
    }
  };

  // Show loading state while checking for active session
  if (isDraftLoading) {
    return (
      <Layout>
        <div className="px-4 pt-12 safe-top flex flex-col items-center justify-center min-h-[60vh]">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </Layout>
    );
  }

  // No active session - show empty state with start options
  if (!sessionId || !hasActiveDraft) {
    return (
      <Layout>
        <div className="px-4 pt-12 safe-top flex flex-col items-center justify-center min-h-[60vh]">
          <Dumbbell className="h-16 w-16 text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold text-foreground mb-2">
            {locale === 'ru' ? 'Нет активной тренировки' : 'No Active Workout'}
          </h2>
          <p className="text-muted-foreground mb-8 text-center">
            {locale === 'ru' 
              ? 'Начните новую тренировку или повторите предыдущую' 
              : 'Start a new workout or repeat your last one'}
          </p>
          
          <div className="w-full max-w-sm space-y-3">
            <Button
              onClick={handleStartWorkout}
              disabled={isStarting}
              className="w-full h-14 text-base font-semibold bg-primary hover:bg-primary/90 text-primary-foreground"
              size="lg"
            >
              {isStarting ? (
                <Loader2 className="h-5 w-5 mr-2 animate-spin" />
              ) : (
                <Play className="h-5 w-5 mr-2" />
              )}
              {t('startWorkout')}
            </Button>

            <Button
              onClick={handleRepeatLastWorkout}
              disabled={isRepeating}
              variant="secondary"
              className="w-full h-12 text-base font-medium"
              size="lg"
            >
              {isRepeating ? (
                <Loader2 className="h-5 w-5 mr-2 animate-spin" />
              ) : (
                <RotateCcw className="h-5 w-5 mr-2" />
              )}
              {t('repeatLastWorkout')}
            </Button>
          </div>

          {/* Show undo button if available */}
          {lastCompletedSessionId && undoAvailableUntil && new Date() < undoAvailableUntil && (
            <Card className="mt-8 p-4 bg-secondary/50 border-border w-full max-w-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {locale === 'ru' ? 'Последняя тренировка завершена' : 'Last workout finished'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {locale === 'ru' ? 'Можно отменить' : 'Can be undone'}
                  </p>
                </div>
                <Button
                  onClick={handleUndoWorkout}
                  disabled={isUndoing}
                  variant="outline"
                  size="sm"
                >
                  {isUndoing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Undo2 className="h-4 w-4 mr-1" />
                      {locale === 'ru' ? 'Отменить' : 'Undo'}
                    </>
                  )}
                </Button>
              </div>
            </Card>
          )}
        </div>
      </Layout>
    );
  }

  // Active workout screen
  return (
    <Layout>
      <div className="px-4 pt-12 safe-top pb-24">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-2xl font-bold text-foreground">{t('currentWorkout')}</h1>
            <div className="flex items-center gap-3">
              <SyncIndicator
                syncState={syncState}
                isOnline={isOnline}
                isSyncing={isSyncing}
                onSync={syncDraftToSupabase}
              />
              <div className="flex items-center gap-2 text-muted-foreground">
                <Timer className="h-4 w-4" />
                <span className="text-sm font-mono">{formatTime(workoutTime)}</span>
              </div>
            </div>
          </div>
          <span className="text-sm text-muted-foreground">
            {sessionExercises.length} {t('exercisesCount')}
          </span>
        </div>

        {/* Exercise List */}
        <div className="mb-6">
          <DraggableExerciseList
            items={sessionExercises}
            onReorder={handleReorderExercises}
            isLoading={isLoading}
            emptyState={
              <Card className="p-8 bg-card border-border text-center">
                <Dumbbell className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="font-semibold text-foreground mb-2">{t('noExercisesInWorkout')}</h3>
                <p className="text-sm text-muted-foreground">{t('addExercisesToStart')}</p>
              </Card>
            }
            renderItem={(se: SessionExercise, _index: number, dragHandle: React.ReactNode) => {
              // Compute exercise RPE from cached sets (source of truth)
              const cachedEx = cachedSession?.exercises.find(e => e.id === se.id);
              const completedSetsWithRpe = cachedEx?.sets.filter(s => s.rpe !== null && s.is_completed) || [];
              const computedRpe = completedSetsWithRpe.length > 0
                ? Math.round(completedSetsWithRpe.reduce((sum, s) => sum + (s.rpe ?? 0), 0) / completedSetsWithRpe.length)
                : null;
              const displayRpe = computedRpe ?? (se as any).rpe_display ?? null;
              const completedCount = cachedEx?.sets.filter(s => s.is_completed).length ?? 0;
              const totalCount = cachedEx?.sets.length ?? 0;

              return (
              <Card className="p-4 bg-card border-border">
                <div className="flex items-center gap-3">
                  {/* Drag handle */}
                  {dragHandle}

                  {/* Exercise info */}
                  <div 
                    className="flex items-center gap-3 flex-1 cursor-pointer hover:opacity-80 transition-opacity"
                    onClick={() => navigate(`/exercise?se=${se.id}`)}
                  >
                    <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-muted-foreground">
                      <Dumbbell className="h-5 w-5" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-foreground">{se.exercise?.name}</h3>
                      <p className="text-sm text-muted-foreground">
                        {completedCount > 0
                          ? `${completedCount}/${totalCount} ${t('sets')}${displayRpe ? ` · RPE ${displayRpe}` : ''}`
                          : `${totalCount} ${t('sets')}`}
                      </p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          className="p-2 rounded-full hover:bg-secondary transition-colors"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreVertical className="h-5 w-5 text-muted-foreground" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="bg-popover border-border z-50">
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenReplacePicker(se.id);
                          }}
                          className="cursor-pointer"
                        >
                          <RefreshCw className="h-4 w-4 mr-2" />
                          {locale === 'ru' ? 'Заменить' : 'Replace'}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenDeleteDialog(se.id, se.exercise?.name || '');
                          }}
                          className="cursor-pointer text-destructive focus:text-destructive"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          {locale === 'ru' ? 'Удалить' : 'Delete'}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <ChevronRight 
                      className="h-5 w-5 text-muted-foreground cursor-pointer" 
                      onClick={() => navigate(`/exercise?se=${se.id}`)}
                    />
                  </div>
                </div>
              </Card>
              )
            }}
          />
        </div>

        {/* Actions */}
        <div className="space-y-3">
          <Button
            onClick={() => {
              setPickerMode('add');
              setReplacingExerciseId(null);
              setShowPicker(true);
            }}
            variant="secondary"
            className="w-full h-14 text-base font-medium"
            size="lg"
          >
            <Plus className="h-5 w-5 mr-2" />
            {t('addExercise')}
          </Button>

          <Button
            onClick={handleFinishWorkout}
            disabled={isFinishing || sessionExercises.length === 0}
            className="w-full h-16 text-lg font-semibold bg-primary hover:bg-primary/90 text-primary-foreground"
            size="lg"
          >
            <Check className="h-6 w-6 mr-2" />
            {t('finishWorkout')}
          </Button>
        </div>

        {/* Exit hint */}
        {syncState === 'dirty' && (
          <p className="text-xs text-center text-muted-foreground mt-4">
            {locale === 'ru' 
              ? 'Тренировка сохранена как черновик и будет восстановлена при следующем запуске.'
              : 'Workout saved as draft and will be restored on next launch.'}
          </p>
        )}
      </div>

      {/* Exercise Picker */}
      {showPicker && (
        <ExercisePicker
          onSelect={handleSelectExercise}
          onClose={() => {
            setShowPicker(false);
            setPickerMode('add');
            setReplacingExerciseId(null);
          }}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {locale === 'ru' ? 'Удалить упражнение?' : 'Delete exercise?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {locale === 'ru' 
                ? `Упражнение "${exerciseToDelete?.name}" и все его подходы будут удалены из этой тренировки.`
                : `"${exerciseToDelete?.name}" and all its sets will be removed from this workout.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{locale === 'ru' ? 'Отмена' : 'Cancel'}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {locale === 'ru' ? 'Удалить' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Template Save Modal */}
      <TemplateSaveModal
        open={showTemplateSaveModal}
        onClose={() => {
          setShowTemplateSaveModal(false);
          setPendingFinishData(null);
        }}
        onCreateNew={handleCreateNewTemplate}
        onUpdateExisting={handleUpdateExistingTemplate}
        onSkip={handleSkipTemplateSave}
        templateName={pendingFinishData?.templateName || ''}
        isLoading={isSavingTemplate}
      />

      {/* Completion Overlay */}
      <WorkoutCompletionOverlay
        isVisible={!!completionStatus}
        step={completionStep}
        status={completionStatus || 'saving'}
      />
    </Layout>
  );
}
