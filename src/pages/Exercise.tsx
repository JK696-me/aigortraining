import { useState, useEffect, useLayoutEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Minus, ChevronLeft, History, Lightbulb, Check, Copy, Grid, CheckCircle } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Layout } from "@/components/Layout";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkout } from "@/contexts/WorkoutContext";
import { useActiveSessionCache, CachedSet } from "@/hooks/useActiveSessionCache";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { SwipeableSetItem } from "@/components/SwipeableSetItem";
import { RecommendationExplainer, ExplanationDetails } from "@/components/RecommendationExplainer";
import { ExerciseSwitcher, ExerciseSwitcherItem } from "@/components/ExerciseSwitcher";
import { format } from 'date-fns';
import { ru, enUS } from 'date-fns/locale';
import { 
  calculateRecommendationPreview, 
  applyRecommendation, 
  isPreviewDifferent,
  ProgressionPreview,
  ExerciseStateSnapshot 
} from "@/lib/progression";

const rpeDisplayScale = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

interface ExerciseStateData {
  current_sets: number;
}

// Debounce hook
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

export default function Exercise() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const sessionExerciseId = searchParams.get('se');
  const { t, locale } = useLanguage();
  const { user } = useAuth();
  const { activeSessionId } = useWorkout();
  
  // Use centralized cache for the active session
  const { 
    session, 
    getExercise, 
    getSets, 
    updateSetOptimistic, 
    updateExerciseOptimistic,
    addSetOptimistic,
    deleteSetOptimistic,
    isLoading: isCacheLoading,
  } = useActiveSessionCache(activeSessionId);
  
  // Get current exercise and sets from cache (instant, no loading)
  const cachedExercise = sessionExerciseId ? getExercise(sessionExerciseId) : undefined;
  const cachedSets = sessionExerciseId ? getSets(sessionExerciseId) : [];
  
  // Atomic resolution state for anti-flicker
  // renderActiveSetIndex: THE SINGLE source of truth for which set is active in UI
  const [renderActiveSetIndex, setRenderActiveSetIndex] = useState<number | null>(null);
  const prevSessionExerciseIdRef = useRef<string | null>(null);
  
  const [currentRpe, setCurrentRpe] = useState<number | null>(null);
  const [isFinishing, setIsFinishing] = useState(false);
  const [exerciseStateData, setExerciseStateData] = useState<ExerciseStateData | null>(null);
  const [showLastSetDialog, setShowLastSetDialog] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  
  // Anti-duplicate modal: track which set we last showed modal for
  const lastModalShownForRef = useRef<{ sessionExerciseId: string; setIndex: number } | null>(null);
  
  // Preview state
  const [preview, setPreview] = useState<ProgressionPreview | null>(null);
  const [exerciseState, setExerciseState] = useState<ExerciseStateSnapshot | null>(null);
  const [previewTrigger, setPreviewTrigger] = useState(0);
  
  // Additional context for explanation
  const [templateName, setTemplateName] = useState<string | null>(null);
  const [lastCompletedDate, setLastCompletedDate] = useState<string | null>(null);
  
  // Local state for inputs
  const [weightValue, setWeightValue] = useState('');
  const [repsValue, setRepsValue] = useState('');
  
  // Exercise switcher: set progress cache (id -> hasSets)
  const [exerciseProgress, setExerciseProgress] = useState<Record<string, boolean>>({});
  
  const repsInputRef = useRef<HTMLInputElement>(null);
  const weightInputRef = useRef<HTMLInputElement>(null);

  // Use cached sets as the primary source
  const sets = cachedSets;
  const isLoading = isCacheLoading && !cachedExercise;
  
  // Compatibility alias for sessionExercise (used throughout the file)
  const sessionExercise = cachedExercise ? {
    id: cachedExercise.id,
    session_id: cachedExercise.session_id,
    exercise_id: cachedExercise.exercise_id,
    rpe: cachedExercise.rpe,
    active_set_index: cachedExercise.active_set_index,
    exercise: cachedExercise.exercise!,
  } : null;
  
  // Wrapper functions for updateSet/addSet/deleteSet with optimistic updates
  const updateSet = useCallback(({ setId, updates }: { setId: string; updates: Partial<CachedSet> }) => {
    if (!sessionExerciseId) return;
    
    // Optimistic update
    updateSetOptimistic(sessionExerciseId, setId, updates);
    
    // Sync to server in background (fire and forget)
    supabase
      .from('sets')
      .update(updates)
      .eq('id', setId);
  }, [sessionExerciseId, updateSetOptimistic]);
  
  const addSet = useCallback(({ weight, reps }: { weight: number; reps: number }) => {
    if (!sessionExerciseId) return;
    
    const nextIndex = sets.length > 0 ? Math.max(...sets.map(s => s.set_index)) + 1 : 1;
    const tempId = crypto.randomUUID();
    
    const newSet: CachedSet = {
      id: tempId,
      session_exercise_id: sessionExerciseId,
      set_index: nextIndex,
      weight,
      reps,
      is_completed: false,
    };
    
    // Optimistic add
    addSetOptimistic(sessionExerciseId, newSet);
    
    // Sync to server
    supabase
      .from('sets')
      .insert({
        session_exercise_id: sessionExerciseId,
        set_index: nextIndex,
        weight,
        reps,
      })
      .select()
      .single()
      .then(({ data }) => {
        if (data) {
          // Update with real ID
          deleteSetOptimistic(sessionExerciseId, tempId);
          addSetOptimistic(sessionExerciseId, data as CachedSet);
        }
      });
  }, [sessionExerciseId, sets, addSetOptimistic, deleteSetOptimistic]);
  
  const deleteSet = useCallback((setId: string) => {
    if (!sessionExerciseId) return;
    
    // Optimistic delete
    deleteSetOptimistic(sessionExerciseId, setId);
    
    // Sync to server
    supabase
      .from('sets')
      .delete()
      .eq('id', setId);
  }, [sessionExerciseId, deleteSetOptimistic]);
  
  // refetchSets is now a no-op since we use optimistic updates
  const refetchSets = useCallback(() => {
    // No-op - cache is the source of truth
  }, []);
  
  // Use renderActiveSetIndex as the selected set (prevents flickering)
  const selectedSetIndex = renderActiveSetIndex;
  
  // isSwitchingExercise - only true during initial load, not on cache updates
  const isSwitchingExercise = isCacheLoading && !cachedExercise;

  // Build switcher items from cached session
  const switcherItems: ExerciseSwitcherItem[] = useMemo(() => {
    if (!session) return [];
    return session.exercises
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map(se => ({
        id: se.id,
        exercise_id: se.exercise_id,
        name: se.exercise?.name || 'Unknown',
        sort_order: se.sort_order,
        hasSets: se.sets.some(s => s.weight > 0 || s.reps > 0),
      }));
  }, [session]);

  // Find current index in switcher
  const currentSwitcherIndex = useMemo(() => {
    return switcherItems.findIndex(item => item.id === sessionExerciseId);
  }, [switcherItems, sessionExerciseId]);

  const hasPrevExercise = currentSwitcherIndex > 0;
  const hasNextExercise = currentSwitcherIndex < switcherItems.length - 1;

  // Debounced preview trigger
  const debouncedPreviewTrigger = useDebounce(previewTrigger, 400);

  // SYNC RESOLVE: Use useLayoutEffect to set active set index BEFORE paint (no flicker)
  // Source of truth: session_exercises.active_set_index from cache
  useLayoutEffect(() => {
    if (!sessionExerciseId) return;
    
    // Check if this is a switch to a different exercise
    const isSameExercise = prevSessionExerciseIdRef.current === sessionExerciseId;
    prevSessionExerciseIdRef.current = sessionExerciseId;
    
    if (isSameExercise) {
      // Same exercise - don't re-resolve
      return;
    }
    
    // New exercise: resolve synchronously from cache BEFORE paint
    if (!cachedExercise) {
      // Cache not ready yet - will re-run when cachedExercise is available
      return;
    }
    
    // Update RPE from cache
    setCurrentRpe(cachedExercise.rpe);
    
    const setsData = cachedSets;
    
    if (setsData.length === 0) {
      setRenderActiveSetIndex(0);
      return;
    }
    
    // SOURCE OF TRUTH: session_exercises.active_set_index
    // ONLY use fallback logic during first-time initialization (when active_set_index is null)
    const savedActiveIndex = cachedExercise.active_set_index;
    
    if (savedActiveIndex !== null && savedActiveIndex >= 1) {
      // Use saved active_set_index from DB (single source of truth)
      const matchingSetIdx = setsData.findIndex(s => s.set_index === savedActiveIndex);
      setRenderActiveSetIndex(matchingSetIdx !== -1 ? matchingSetIdx : 0);
    } else {
      // Fallback ONLY for first-time initialization: use first set
      setRenderActiveSetIndex(0);
    }
  }, [sessionExerciseId, cachedExercise, cachedSets]);

  // Unified method to set active set - updates cache optimistically + persists to DB
  const setActiveSet = useCallback((arrayIndex: number, setIndex: number) => {
    if (!sessionExerciseId) return;
    
    // 1. Update local render state immediately
    setRenderActiveSetIndex(arrayIndex);
    
    // 2. Update cache optimistically
    updateExerciseOptimistic(sessionExerciseId, { active_set_index: setIndex });
    
    // 3. Persist to DB in background (fire and forget)
    supabase
      .from('session_exercises')
      .update({ active_set_index: setIndex })
      .eq('id', sessionExerciseId);
  }, [sessionExerciseId, updateExerciseOptimistic]);
  
  // Wrapper for external callers that only know array index
  const setSelectedSetIndex = useCallback((arrayIndex: number) => {
    const setIndexValue = sets[arrayIndex]?.set_index;
    if (setIndexValue !== undefined) {
      setActiveSet(arrayIndex, setIndexValue);
    } else {
      // Fallback for edge cases
      setRenderActiveSetIndex(arrayIndex);
    }
  }, [sets, setActiveSet]);

  // Load exercise_state in background (only once per exercise)
  useEffect(() => {
    if (!cachedExercise?.exercise_id || !user) return;
    
    const loadExerciseState = async () => {
      const { data: stateData } = await supabase
        .from('exercise_state')
        .select('current_sets')
        .eq('exercise_id', cachedExercise.exercise_id)
        .eq('user_id', user.id)
        .maybeSingle();
      
      if (stateData) {
        setExerciseStateData(stateData as ExerciseStateData);
      }
    };
    
    loadExerciseState();
  }, [cachedExercise?.exercise_id, user]);

  // Load template name in background
  useEffect(() => {
    if (!session?.template_id) return;
    
    const loadTemplateName = async () => {
      const { data: templateData } = await supabase
        .from('workout_templates')
        .select('name')
        .eq('id', session.template_id!)
        .maybeSingle();
      
      if (templateData) {
        setTemplateName(templateData.name);
      }
    };
    
    loadTemplateName();
  }, [session?.template_id]);

  // Load preview on trigger change (debounced)
  useEffect(() => {
    if (!sessionExercise?.exercise?.id || !user || !sessionExerciseId) return;
    
    const loadPreview = async () => {
      const result = await calculateRecommendationPreview(
        sessionExercise.exercise.id,
        sessionExerciseId,
        user.id
      );
      
      if (result) {
        setPreview(result.preview);
        setExerciseState(result.currentState);
      }
    };
    
    loadPreview();
  }, [sessionExercise?.exercise?.id, user, sessionExerciseId, debouncedPreviewTrigger]);

  // Check if preview is different from saved state
  const canApply = useMemo(() => {
    if (!preview || !exerciseState) return false;
    return isPreviewDifferent(preview, exerciseState);
  }, [preview, exerciseState]);

  // Trigger preview recalculation
  const triggerPreviewUpdate = useCallback(() => {
    setPreviewTrigger(prev => prev + 1);
  }, []);

  // Update local values when set changes
  const currentSet = selectedSetIndex !== null ? sets[selectedSetIndex] : undefined;
  
  useEffect(() => {
    if (currentSet) {
      setWeightValue(currentSet.weight.toString());
      setRepsValue(currentSet.reps.toString());
    }
  }, [currentSet?.id, currentSet?.weight, currentSet?.reps]);

  // Auto-focus on reps when set changes
  useEffect(() => {
    if (currentSet && repsInputRef.current) {
      setTimeout(() => {
        repsInputRef.current?.focus();
        repsInputRef.current?.select();
      }, 100);
    }
  }, [currentSet?.id]);

  const incrementValue = sessionExercise?.exercise?.increment_value || 2.5;

  // Save weight
  const saveWeight = useCallback((value: string) => {
    if (!currentSet) return;
    const numValue = parseFloat(value);
    if (isNaN(numValue) || numValue < 0) {
      setWeightValue(currentSet.weight.toString());
      return;
    }
    // Round to nearest 0.5
    const roundedValue = Math.round(numValue * 2) / 2;
    setWeightValue(roundedValue.toString());
    updateSet({ setId: currentSet.id, updates: { weight: roundedValue } });
    triggerPreviewUpdate();
  }, [currentSet, updateSet, triggerPreviewUpdate]);

  // Save reps and move to next set
  const saveReps = useCallback((value: string, moveToNext: boolean = false) => {
    if (!currentSet) return;
    const numValue = parseInt(value, 10);
    if (isNaN(numValue) || numValue < 0) {
      setRepsValue(currentSet.reps.toString());
      return;
    }
    setRepsValue(numValue.toString());
    updateSet({ setId: currentSet.id, updates: { reps: numValue } });
    triggerPreviewUpdate();
    
    // Move to next set if available
    if (moveToNext && selectedSetIndex < sets.length - 1) {
      setSelectedSetIndex(selectedSetIndex + 1);
    }
  }, [currentSet, updateSet, selectedSetIndex, sets.length, triggerPreviewUpdate]);

  // Navigation handlers for exercise switcher
  const handleSwitchExercise = useCallback((newSessionExerciseId: string) => {
    if (newSessionExerciseId === sessionExerciseId) return;
    
    // Update progress for current exercise
    if (sessionExerciseId) {
      const hasSetsValue = sets.some(s => s.weight > 0 || s.reps > 0);
      setExerciseProgress(prev => ({ ...prev, [sessionExerciseId]: hasSetsValue }));
    }
    
    // Navigate to new exercise - don't set selectedSetIndex here, let the atomic effect handle it
    setSearchParams({ se: newSessionExerciseId });
  }, [sessionExerciseId, sets, setSearchParams]);

  const handlePrevExercise = useCallback(() => {
    if (hasPrevExercise) {
      handleSwitchExercise(switcherItems[currentSwitcherIndex - 1].id);
    }
  }, [hasPrevExercise, switcherItems, currentSwitcherIndex, handleSwitchExercise]);

  const handleNextExercise = useCallback(() => {
    if (hasNextExercise) {
      handleSwitchExercise(switcherItems[currentSwitcherIndex + 1].id);
    }
  }, [hasNextExercise, switcherItems, currentSwitcherIndex, handleSwitchExercise]);

  const handleWeightChange = (delta: number) => {
    const currentValue = parseFloat(weightValue) || 0;
    const newValue = Math.max(0, currentValue + delta);
    const roundedValue = Math.round(newValue * 2) / 2;
    setWeightValue(roundedValue.toString());
    if (currentSet) {
      updateSet({ setId: currentSet.id, updates: { weight: roundedValue } });
      triggerPreviewUpdate();
    }
  };

  const handleRepsChange = (delta: number) => {
    const currentValue = parseInt(repsValue, 10) || 0;
    const newValue = Math.max(0, currentValue + delta);
    setRepsValue(newValue.toString());
    if (currentSet) {
      updateSet({ setId: currentSet.id, updates: { reps: newValue } });
      triggerPreviewUpdate();
    }
  };

  const handleWeightKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      saveWeight(weightValue);
      repsInputRef.current?.focus();
    }
  };

  const handleRepsKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      saveReps(repsValue, true);
    }
  };

  const handleAddSet = () => {
    const lastSet = sets[sets.length - 1];
    addSet({
      weight: lastSet?.weight || 0,
      reps: lastSet?.reps || 8,
    });
    triggerPreviewUpdate();
    // Switch to new set after a short delay
    setTimeout(() => {
      setSelectedSetIndex(sets.length);
    }, 100);
  };

  const handleRpeChange = async (rpe: number) => {
    setCurrentRpe(rpe);
    if (!sessionExerciseId) return;
    
    await supabase
      .from('session_exercises')
      .update({ rpe })
      .eq('id', sessionExerciseId);
    
    triggerPreviewUpdate();
  };

  const handleQuickAddRep = () => {
    handleRepsChange(1);
  };

  const handleQuickAddWeight = () => {
    handleWeightChange(incrementValue);
  };

  const handleSetSelect = (index: number) => {
    // Save current values before switching
    if (currentSet) {
      saveWeight(weightValue);
      saveReps(repsValue, false);
    }
    // Use unified setActiveSet which updates cache + DB
    setSelectedSetIndex(index);
  };

  // Handle "Set Completed" button
  const handleSetCompleted = async () => {
    if (!currentSet || !sessionExerciseId || !exerciseStateData) return;
    
    const weight = parseFloat(weightValue) || 0;
    const reps = parseInt(repsValue, 10) || 0;
    
    // Validation
    if (weight <= 0 || reps <= 0) {
      toast.error(locale === 'ru' ? 'Введите вес и повторы' : 'Enter weight and reps');
      return;
    }
    
    // CAPTURE current set index BEFORE any updates
    const completedSetIndex = currentSet.set_index;
    const workSetsCount = exerciseStateData.current_sets;
    
    // Mark current set as completed (optimistic)
    updateSet({ setId: currentSet.id, updates: { weight, reps, is_completed: true } });
    
    // STRICT MODAL CONDITION:
    // Show modal ONLY if completing the LAST working set (set_index == work_sets_count)
    // OR if completing an extra set (set_index > work_sets_count)
    const isLastWorkingSet = completedSetIndex === workSetsCount;
    const isExtraSet = completedSetIndex > workSetsCount;
    
    if (isLastWorkingSet || isExtraSet) {
      // Check anti-duplicate: don't show modal twice for same set
      const alreadyShown = lastModalShownForRef.current?.sessionExerciseId === sessionExerciseId 
        && lastModalShownForRef.current?.setIndex === completedSetIndex;
      
      if (!alreadyShown) {
        // Mark as shown to prevent duplicate
        lastModalShownForRef.current = { sessionExerciseId, setIndex: completedSetIndex };
        setShowLastSetDialog(true);
      }
    } else {
      // Not last working set - auto-advance to next
      const nextWorkingSet = sets.find(s => 
        s.set_index > completedSetIndex && s.set_index <= workSetsCount
      );
      
      if (nextWorkingSet) {
        const nextIdx = sets.findIndex(s => s.id === nextWorkingSet.id);
        setActiveSet(nextIdx, nextWorkingSet.set_index);
        
        // Auto-focus on reps after a short delay
        setTimeout(() => {
          repsInputRef.current?.focus();
          repsInputRef.current?.select();
        }, 100);
      }
    }
    
    triggerPreviewUpdate();
  };

  // Handle adding extra set from dialog
  const handleAddExtraSet = () => {
    setShowLastSetDialog(false);
    
    const lastSet = sets[sets.length - 1];
    addSet({
      weight: lastSet?.weight || 0,
      reps: lastSet?.reps || 8,
    });
    
    // Switch to new set after a short delay
    setTimeout(() => {
      const newSetArrayIndex = sets.length;
      const newSetIndexValue = (sets[sets.length - 1]?.set_index || 0) + 1;
      setActiveSet(newSetArrayIndex, newSetIndexValue);
      repsInputRef.current?.focus();
    }, 150);
  };

  // Handle finishing exercise from dialog
  const handleFinishFromDialog = () => {
    setShowLastSetDialog(false);
    handleFinishExercise();
  };

  // Apply recommendation to DB
  const handleApplyRecommendation = async () => {
    if (!preview || !exerciseState) return;
    
    setIsApplying(true);
    try {
      const success = await applyRecommendation(exerciseState.id, preview);
      if (success) {
        // Update local state to reflect applied changes
        setExerciseState(prev => prev ? {
          ...prev,
          current_working_weight: preview.updatedState.current_working_weight,
          current_sets: preview.updatedState.current_sets,
          volume_reduce_on: preview.updatedState.volume_reduce_on,
          success_streak: preview.updatedState.success_streak,
          fail_streak: preview.updatedState.fail_streak,
          rep_stage: preview.updatedState.rep_stage,
          last_target_range: preview.updatedState.last_target_range,
          last_recommendation_text: preview.updatedState.last_recommendation_text,
        } : null);
        toast.success('Сохранено');
      } else {
        toast.error('Ошибка сохранения');
      }
    } catch (error) {
      console.error('Failed to apply recommendation:', error);
      toast.error('Ошибка сохранения');
    } finally {
      setIsApplying(false);
    }
  };

  // Finish exercise: apply if needed, then navigate
  const handleFinishExercise = async () => {
    if (!sessionExercise || !user || !sessionExerciseId || !exerciseState) return;
    
    setIsFinishing(true);
    try {
      // Apply current preview if different
      if (preview && isPreviewDifferent(preview, exerciseState)) {
        await applyRecommendation(exerciseState.id, preview);
      }
      
      toast.success(t('exerciseFinished'));
      navigate(`/workout?session=${sessionExercise.session_id}`);
    } catch (error) {
      console.error('Failed to finish exercise:', error);
      toast.error('Ошибка');
    } finally {
      setIsFinishing(false);
    }
  };

  // Copy last attempt
  const handleCopyLastAttempt = async () => {
    if (!sessionExercise?.exercise?.id || !user) return;
    
    try {
      // Find the last completed session with this exercise
      const { data: lastSessionExercise } = await supabase
        .from('session_exercises')
        .select(`
          id,
          session:sessions!inner(id, status, completed_at)
        `)
        .eq('exercise_id', sessionExercise.exercise.id)
        .eq('sessions.status', 'completed')
        .neq('id', sessionExerciseId) // Exclude current
        .order('sessions(completed_at)', { ascending: false })
        .limit(1)
        .single();
      
      if (!lastSessionExercise) {
        toast.error('Нет предыдущих тренировок');
        return;
      }
      
      // Get sets from last session
      const { data: lastSets } = await supabase
        .from('sets')
        .select('weight, reps, set_index')
        .eq('session_exercise_id', lastSessionExercise.id)
        .order('set_index');
      
      if (!lastSets || lastSets.length === 0) {
        toast.error('Нет данных о подходах');
        return;
      }
      
      // Update current sets with last session's values
      for (const currentSetItem of sets) {
        const lastSet = lastSets.find(s => s.set_index === currentSetItem.set_index);
        if (lastSet) {
          await supabase
            .from('sets')
            .update({ weight: lastSet.weight, reps: lastSet.reps })
            .eq('id', currentSetItem.id);
        }
      }
      
      // Refetch sets
      refetchSets();
      triggerPreviewUpdate();
      toast.success('Скопировано из прошлой тренировки');
    } catch (error) {
      console.error('Failed to copy last attempt:', error);
      toast.error('Ошибка копирования');
    }
  };

  // Fill all sets like current
  const handleFillAllSets = async () => {
    if (!currentSet || !exerciseState) return;
    
    const workingSetsCount = exerciseState.current_sets;
    const weight = parseFloat(weightValue) || currentSet.weight;
    const reps = parseInt(repsValue, 10) || currentSet.reps;
    
    try {
      // Update all working sets (first N sets by set_index)
      for (const setItem of sets) {
        if (setItem.set_index <= workingSetsCount) {
          await supabase
            .from('sets')
            .update({ weight, reps })
            .eq('id', setItem.id);
        }
      }
      
      // Refetch sets
      refetchSets();
      triggerPreviewUpdate();
      toast.success('Все подходы заполнены');
    } catch (error) {
      console.error('Failed to fill all sets:', error);
      toast.error('Ошибка заполнения');
    }
  };

  if (!sessionExerciseId || !sessionExercise) {
    return (
      <Layout>
        <div className="px-4 pt-12 safe-top flex items-center justify-center min-h-[60vh]">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="px-4 pt-12 safe-top pb-24">
        {/* Header */}
        <div className="mb-4">
          <button
            onClick={() => navigate(`/workout?session=${sessionExercise.session_id}`)}
            className="flex items-center gap-1 text-muted-foreground mb-3"
          >
            <ChevronLeft className="h-5 w-5" />
            <span className="text-sm">{t('backToWorkout')}</span>
          </button>
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-foreground">{sessionExercise.exercise.name}</h1>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate(`/single-exercise-history?exercise=${sessionExercise.exercise.id}&se=${sessionExerciseId}`)}
            >
              <History className="h-5 w-5 text-muted-foreground" />
            </Button>
          </div>
          <p className="text-muted-foreground">
            {selectedSetIndex !== null 
              ? `${t('setOf')} ${selectedSetIndex + 1} ${t('of')} ${sets.length}`
              : `${sets.length} ${locale === 'ru' ? 'подходов' : 'sets'}`}
          </p>
        </div>

        {/* Exercise Switcher */}
        {switcherItems.length > 1 && (
          <ExerciseSwitcher
            exercises={switcherItems}
            currentExerciseId={sessionExerciseId}
            onSelect={handleSwitchExercise}
            onPrev={handlePrevExercise}
            onNext={handleNextExercise}
            hasPrev={hasPrevExercise}
            hasNext={hasNextExercise}
            className="mb-6"
          />
        )}

        {/* Set Tabs - with skeleton during switching */}
        {isSwitchingExercise ? (
          <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="flex-shrink-0 w-10 h-10 rounded-lg bg-secondary animate-pulse"
              />
            ))}
          </div>
        ) : (
          <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
            {sets.map((set, index) => (
              <button
                key={`set-${set.set_index}`}
                onClick={() => handleSetSelect(index)}
                className={`flex-shrink-0 px-4 py-2 rounded-lg font-medium transition-all relative ${
                  index === selectedSetIndex
                    ? 'bg-primary text-primary-foreground ring-2 ring-primary ring-offset-2 ring-offset-background'
                    : set.is_completed
                    ? 'bg-secondary/80 text-foreground border border-accent/40'
                    : 'bg-secondary text-muted-foreground hover:bg-secondary/80'
                }`}
              >
                {set.is_completed && (
                  <Check className="h-3 w-3 absolute -top-1 -right-1 text-accent bg-background rounded-full p-0.5 border border-accent/40" />
                )}
                {set.set_index}
              </button>
            ))}
            <button
              onClick={handleAddSet}
              className="flex-shrink-0 px-4 py-2 rounded-lg bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors"
            >
              <Plus className="h-5 w-5" />
            </button>
          </div>
        )}

        {/* Current Set Input */}
        {isSwitchingExercise ? (
          <Card className="p-6 bg-card border-border mb-6">
            <div className="grid grid-cols-2 gap-6 mb-6">
              <div className="text-center">
                <div className="h-4 w-16 bg-secondary rounded animate-pulse mx-auto mb-2" />
                <div className="flex items-center justify-center gap-2">
                  <div className="h-12 w-12 rounded-full bg-secondary animate-pulse" />
                  <div className="w-20 h-14 bg-secondary rounded animate-pulse" />
                  <div className="h-12 w-12 rounded-full bg-secondary animate-pulse" />
                </div>
              </div>
              <div className="text-center">
                <div className="h-4 w-16 bg-secondary rounded animate-pulse mx-auto mb-2" />
                <div className="flex items-center justify-center gap-2">
                  <div className="h-12 w-12 rounded-full bg-secondary animate-pulse" />
                  <div className="w-20 h-14 bg-secondary rounded animate-pulse" />
                  <div className="h-12 w-12 rounded-full bg-secondary animate-pulse" />
                </div>
              </div>
            </div>
          </Card>
        ) : currentSet && (
          <Card className="p-6 bg-card border-border mb-6">
            <div className="grid grid-cols-2 gap-6 mb-6">
              {/* Weight */}
              <div className="text-center">
                <p className="text-sm text-muted-foreground mb-2">{t('weightKg')}</p>
                <div className="flex items-center justify-center gap-2">
                  <Button
                    variant="secondary"
                    size="icon"
                    className="h-12 w-12 rounded-full flex-shrink-0"
                    onClick={() => handleWeightChange(-incrementValue)}
                  >
                    <Minus className="h-5 w-5" />
                  </Button>
                  <Input
                    ref={weightInputRef}
                    type="text"
                    inputMode="decimal"
                    value={weightValue}
                    onChange={(e) => setWeightValue(e.target.value)}
                    onBlur={() => saveWeight(weightValue)}
                    onKeyDown={handleWeightKeyDown}
                    className="w-20 h-14 text-center text-2xl font-bold font-mono bg-secondary border-border"
                  />
                  <Button
                    variant="secondary"
                    size="icon"
                    className="h-12 w-12 rounded-full flex-shrink-0"
                    onClick={() => handleWeightChange(incrementValue)}
                  >
                    <Plus className="h-5 w-5" />
                  </Button>
                </div>
              </div>

              {/* Reps */}
              <div className="text-center">
                <p className="text-sm text-muted-foreground mb-2">{t('reps')}</p>
                <div className="flex items-center justify-center gap-2">
                  <Button
                    variant="secondary"
                    size="icon"
                    className="h-12 w-12 rounded-full flex-shrink-0"
                    onClick={() => handleRepsChange(-1)}
                  >
                    <Minus className="h-5 w-5" />
                  </Button>
                  <Input
                    ref={repsInputRef}
                    type="text"
                    inputMode="numeric"
                    value={repsValue}
                    onChange={(e) => setRepsValue(e.target.value)}
                    onBlur={() => saveReps(repsValue, false)}
                    onKeyDown={handleRepsKeyDown}
                    className="w-20 h-14 text-center text-2xl font-bold font-mono bg-secondary border-border"
                  />
                  <Button
                    variant="secondary"
                    size="icon"
                    className="h-12 w-12 rounded-full flex-shrink-0"
                    onClick={() => handleRepsChange(1)}
                  >
                    <Plus className="h-5 w-5" />
                  </Button>
                </div>
              </div>
            </div>

            {/* RPE Selector */}
            <div>
              <p className="text-sm text-muted-foreground mb-3 text-center">{t('rpeLabel')}</p>
              <div className="flex justify-between gap-1">
                {rpeDisplayScale.map((rpe) => (
                  <button
                    key={rpe}
                    onClick={() => handleRpeChange(rpe)}
                    className={`flex-1 h-10 rounded-lg font-mono font-bold text-sm transition-colors ${
                      currentRpe === rpe
                        ? "bg-primary text-primary-foreground"
                        : rpe >= 9
                        ? "bg-destructive/20 text-destructive hover:bg-destructive/30"
                        : rpe >= 7
                        ? "bg-accent/20 text-accent hover:bg-accent/30"
                        : "bg-secondary text-muted-foreground hover:bg-secondary/80"
                    }`}
                  >
                    {rpe}
                  </button>
                ))}
              </div>
            </div>
          </Card>
        )}

        {/* Compact Action Bar */}
        <div className="flex gap-3 mb-4">
          {/* Set Completed - Primary Action */}
          <Button
            onClick={handleSetCompleted}
            className="flex-1 h-12 text-sm font-semibold bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            <Check className="h-4 w-4 mr-2" />
            {currentSet && (
              <span className="mr-1 opacity-80 font-mono text-xs">#{currentSet.set_index}</span>
            )}
            {locale === 'ru' ? 'Выполнено' : 'Done'}
          </Button>
          
          {/* Finish Exercise - Secondary Action */}
          <Button
            onClick={handleFinishExercise}
            variant="secondary"
            className="h-12 px-4 text-sm font-medium"
            disabled={isFinishing}
          >
            {isFinishing ? (
              <div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <ChevronLeft className="h-4 w-4 mr-1" />
                {locale === 'ru' ? 'Закончить' : 'Finish'}
              </>
            )}
          </Button>
        </div>

        {/* Quick Actions - Compact Grid */}
        <div className="grid grid-cols-4 gap-2 mb-4">
          <Button 
            variant="outline" 
            size="sm"
            className="h-10 text-xs font-medium"
            onClick={handleQuickAddRep}
          >
            <Plus className="h-3 w-3 mr-1" />
            +1
          </Button>
          <Button 
            variant="outline" 
            size="sm"
            className="h-10 text-xs font-medium"
            onClick={handleQuickAddWeight}
          >
            <Plus className="h-3 w-3 mr-1" />
            {incrementValue}
          </Button>
          <Button 
            variant="outline"
            size="sm" 
            className="h-10 text-xs font-medium"
            onClick={handleCopyLastAttempt}
          >
            <Copy className="h-3 w-3 mr-1" />
            {locale === 'ru' ? 'Прош.' : 'Last'}
          </Button>
          <Button 
            variant="outline"
            size="sm" 
            className="h-10 text-xs font-medium"
            onClick={handleFillAllSets}
          >
            <Grid className="h-3 w-3 mr-1" />
            {locale === 'ru' ? 'Все' : 'All'}
          </Button>
        </div>

        {/* Add Set Button - Compact */}
        <Button
          onClick={handleAddSet}
          variant="ghost"
          className="w-full h-10 text-sm font-medium text-muted-foreground hover:text-foreground mb-6"
        >
          <Plus className="h-4 w-4 mr-2" />
          {t('addSet')}
        </Button>

        {/* All Sets Summary */}
        <div className="mb-6">
          <h3 className="text-sm font-medium text-muted-foreground mb-3">
            {t('previousSets')} <span className="text-xs opacity-60">(свайп влево для удаления)</span>
          </h3>
          <div className="space-y-2">
            {sets.map((set, index) => (
              <SwipeableSetItem
                key={set.id}
                setIndex={set.set_index}
                weight={set.weight}
                reps={set.reps}
                isSelected={index === selectedSetIndex}
                onSelect={() => handleSetSelect(index)}
                onDelete={() => {
                  deleteSet(set.id);
                  // Adjust selected index if needed
                  if (selectedSetIndex >= sets.length - 1 && selectedSetIndex > 0) {
                    setSelectedSetIndex(selectedSetIndex - 1);
                  }
                  triggerPreviewUpdate();
                  toast.success('Подход удалён');
                }}
                kgLabel={t('kg')}
                setLabel={t('set')}
              />
            ))}
          </div>
        </div>

        {/* Recommendation Card (Live Preview) */}
        <Card className="p-4 bg-primary/10 border-primary/20 mb-6">
          <div className="flex items-start gap-3">
            <Lightbulb className="h-5 w-5 text-primary mt-0.5" />
            <div className="flex-1">
              <h4 className="font-semibold text-foreground mb-2">{t('nextTimeRecommendation')}</h4>
              {preview ? (
                <div className="space-y-2">
                  <p className="text-sm text-foreground">
                    <span className="text-muted-foreground">{t('recommendedWeight')}:</span>{' '}
                    <span className="font-mono font-bold">{preview.nextWeight} {t('kg')}</span>
                  </p>
                  <p className="text-sm text-foreground">
                    <span className="text-muted-foreground">{t('targetRange')}:</span>{' '}
                    <span className="font-mono font-bold">{preview.targetRangeText}</span>
                  </p>
                  <p className="text-sm text-muted-foreground">{preview.explanation}</p>
                  
                  {/* Explainer */}
                  <RecommendationExplainer 
                    details={{
                      ...preview.explanationDetails,
                      weightStepLabel: sessionExercise?.exercise?.increment_kind === 'dumbbell' 
                        ? (locale === 'ru' ? 'гантели' : 'dumbbell')
                        : sessionExercise?.exercise?.increment_kind === 'barbell'
                        ? (locale === 'ru' ? 'штанга' : 'barbell')
                        : '',
                      basedOn: {
                        source: 'current_workout',
                        lastCompletedDate: lastCompletedDate 
                          ? format(new Date(lastCompletedDate), 'd MMM yyyy', { locale: locale === 'ru' ? ru : enUS })
                          : undefined,
                        templateName: templateName || undefined,
                      },
                    }}
                    className="mt-2"
                  />
                  
                  {/* Apply Button */}
                  <Button
                    onClick={handleApplyRecommendation}
                    disabled={!canApply || isApplying}
                    variant={canApply ? "default" : "secondary"}
                    className="w-full mt-3"
                    size="sm"
                  >
                    <Check className="h-4 w-4 mr-2" />
                    {isApplying 
                      ? (locale === 'ru' ? 'Сохраняем...' : 'Saving...') 
                      : canApply 
                      ? (locale === 'ru' ? 'Применить рекомендацию' : 'Apply recommendation') 
                      : (locale === 'ru' ? 'Уже применено' : 'Already applied')}
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {locale === 'ru' ? 'Завершите подход для расчёта рекомендации' : 'Complete a set to calculate recommendation'}
                </p>
              )}
            </div>
          </div>
        </Card>

        {/* Finish Exercise Button */}
        <Button
          onClick={handleFinishExercise}
          disabled={isFinishing || sets.length === 0}
          className="w-full h-14 text-base font-semibold bg-primary hover:bg-primary/90 text-primary-foreground"
          size="lg"
        >
          <Check className="h-5 w-5 mr-2" />
          {isFinishing ? t('calculating') : t('finishExercise')}
        </Button>
      </div>

      {/* Last Set Dialog */}
      <AlertDialog open={showLastSetDialog} onOpenChange={setShowLastSetDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {locale === 'ru' ? 'Последний рабочий подход выполнен' : 'Last working set completed'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {locale === 'ru' 
                ? 'Закончить упражнение или добавить дополнительный подход?' 
                : 'Finish the exercise or add an extra set?'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel onClick={() => setShowLastSetDialog(false)}>
              {locale === 'ru' ? 'Отмена' : 'Cancel'}
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleAddExtraSet} className="bg-secondary text-secondary-foreground hover:bg-secondary/80">
              <Plus className="h-4 w-4 mr-2" />
              {locale === 'ru' ? 'Добавить подход' : 'Add Set'}
            </AlertDialogAction>
            <AlertDialogAction onClick={handleFinishFromDialog}>
              <Check className="h-4 w-4 mr-2" />
              {locale === 'ru' ? 'Закончить' : 'Finish'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
}
