import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Minus, ChevronLeft, History, Lightbulb, Check, Copy, Grid } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Layout } from "@/components/Layout";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { useSets, useSessionExercises } from "@/hooks/useSessions";
import { useWorkout } from "@/contexts/WorkoutContext";
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

interface SessionExerciseData {
  id: string;
  session_id: string;
  exercise_id: string;
  rpe: number | null;
  exercise: {
    id: string;
    name: string;
    type: number;
    increment_kind: string;
    increment_value: number;
  };
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
  
  const [sessionExercise, setSessionExercise] = useState<SessionExerciseData | null>(null);
  const [selectedSetIndex, setSelectedSetIndex] = useState<number | null>(null);
  const [initialSetIndexLoaded, setInitialSetIndexLoaded] = useState(false);
  const [currentRpe, setCurrentRpe] = useState<number | null>(null);
  const [isFinishing, setIsFinishing] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  
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
  
  const { sets, updateSet, addSet, deleteSet, isLoading, refetch: refetchSets } = useSets(sessionExerciseId);
  
  // Get all session exercises for the switcher
  const { exercises: allSessionExercises } = useSessionExercises(activeSessionId);

  // Build switcher items with progress status
  const switcherItems: ExerciseSwitcherItem[] = useMemo(() => {
    return allSessionExercises
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map(se => ({
        id: se.id,
        exercise_id: se.exercise_id,
        name: se.exercise?.name || 'Unknown',
        sort_order: se.sort_order,
        hasSets: exerciseProgress[se.id] ?? false,
      }));
  }, [allSessionExercises, exerciseProgress]);

  // Find current index in switcher
  const currentSwitcherIndex = useMemo(() => {
    return switcherItems.findIndex(item => item.id === sessionExerciseId);
  }, [switcherItems, sessionExerciseId]);

  const hasPrevExercise = currentSwitcherIndex > 0;
  const hasNextExercise = currentSwitcherIndex < switcherItems.length - 1;

  // Update progress for all exercises on load
  useEffect(() => {
    const loadProgress = async () => {
      if (!allSessionExercises.length) return;
      
      const progressMap: Record<string, boolean> = {};
      
      for (const se of allSessionExercises) {
        const { data: setsData } = await supabase
          .from('sets')
          .select('weight, reps')
          .eq('session_exercise_id', se.id)
          .limit(10);
        
        progressMap[se.id] = setsData?.some(s => s.weight > 0 || s.reps > 0) ?? false;
      }
      
      setExerciseProgress(progressMap);
    };
    
    loadProgress();
  }, [allSessionExercises]);

  // Update current exercise progress when sets change
  useEffect(() => {
    if (sessionExerciseId && sets.length > 0) {
      const hasSets = sets.some(s => s.weight > 0 || s.reps > 0);
      setExerciseProgress(prev => ({ ...prev, [sessionExerciseId]: hasSets }));
    }
  }, [sessionExerciseId, sets]);

  // Debounced preview trigger
  const debouncedPreviewTrigger = useDebounce(previewTrigger, 400);

  // Load session exercise data and additional context
  useEffect(() => {
    if (!sessionExerciseId || !user) return;
    
    // Reset initial set index loaded flag when switching exercises
    setInitialSetIndexLoaded(false);
    setSelectedSetIndex(null);
    
    const loadData = async () => {
      const { data } = await supabase
        .from('session_exercises')
        .select(`
          *,
          exercise:exercises(id, name, type, increment_kind, increment_value),
          session:sessions(id, template_id, source)
        `)
        .eq('id', sessionExerciseId)
        .single();
      
      if (data) {
        setSessionExercise(data as SessionExerciseData & { active_set_index?: number | null });
        setCurrentRpe(data.rpe);
        
        // Load template name if from template
        const session = data.session as { id: string; template_id: string | null; source: string } | null;
        if (session?.template_id) {
          const { data: templateData } = await supabase
            .from('workout_templates')
            .select('name')
            .eq('id', session.template_id)
            .maybeSingle();
          if (templateData) {
            setTemplateName(templateData.name);
          }
        }
        
        // Load last completed session date for this exercise
        const exerciseId = (data.exercise as { id: string })?.id;
        if (exerciseId) {
          const { data: lastSession } = await supabase
            .from('session_exercises')
            .select(`
              sessions!inner(completed_at, status)
            `)
            .eq('exercise_id', exerciseId)
            .eq('sessions.status', 'completed')
            .eq('sessions.user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          
          if (lastSession) {
            const sessionData = lastSession.sessions as { completed_at: string; status: string };
            setLastCompletedDate(sessionData.completed_at);
          }
        }
      }
    };
    
    loadData();
  }, [sessionExerciseId, user]);

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

  // Determine initial set index when sets load
  useEffect(() => {
    if (initialSetIndexLoaded || sets.length === 0 || !sessionExercise) return;
    
    const seData = sessionExercise as SessionExerciseData & { active_set_index?: number | null };
    let targetIndex = 0;
    
    // A) If active_set_index is set and valid
    if (seData.active_set_index !== null && seData.active_set_index !== undefined) {
      const activeIdx = seData.active_set_index;
      if (activeIdx >= 0 && activeIdx < sets.length) {
        targetIndex = activeIdx;
      }
    } else {
      // B) Find first incomplete set (weight == 0 OR reps == 0)
      const firstIncompleteIdx = sets.findIndex(s => s.weight === 0 || s.reps === 0);
      if (firstIncompleteIdx !== -1) {
        targetIndex = firstIncompleteIdx;
      } else {
        // All complete - use last set
        targetIndex = sets.length - 1;
      }
    }
    
    setSelectedSetIndex(targetIndex);
    setInitialSetIndexLoaded(true);
  }, [sets, sessionExercise, initialSetIndexLoaded]);

  // Update local values when set changes
  const currentSet = selectedSetIndex !== null ? sets[selectedSetIndex] : null;
  
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

  // Save active_set_index to DB (declared early for use in saveReps)
  const saveActiveSetIndexRef = useRef<(index: number) => Promise<void>>();
  
  // Save reps and move to next set
  const saveReps = useCallback((value: string, moveToNext: boolean = false) => {
    if (!currentSet || selectedSetIndex === null) return;
    const numValue = parseInt(value, 10);
    if (isNaN(numValue) || numValue < 0) {
      setRepsValue(currentSet.reps.toString());
      return;
    }
    setRepsValue(numValue.toString());
    updateSet({ setId: currentSet.id, updates: { reps: numValue } });
    triggerPreviewUpdate();
    
    // Check if current set is now complete and auto-advance
    const currentWeight = parseFloat(weightValue) || 0;
    const isSetComplete = currentWeight > 0 && numValue > 0;
    
    if (isSetComplete && selectedSetIndex < sets.length - 1) {
      const nextIndex = selectedSetIndex + 1;
      setSelectedSetIndex(nextIndex);
      saveActiveSetIndexRef.current?.(nextIndex);
    } else if (moveToNext && selectedSetIndex < sets.length - 1) {
      const nextIndex = selectedSetIndex + 1;
      setSelectedSetIndex(nextIndex);
      saveActiveSetIndexRef.current?.(nextIndex);
    }
  }, [currentSet, updateSet, selectedSetIndex, sets.length, triggerPreviewUpdate, weightValue]);

  // Navigation handlers for exercise switcher
  const handleSwitchExercise = useCallback(async (newSessionExerciseId: string) => {
    if (newSessionExerciseId === sessionExerciseId) return;
    
    // Save current active_set_index before switching
    if (sessionExerciseId && selectedSetIndex !== null) {
      await supabase
        .from('session_exercises')
        .update({ active_set_index: selectedSetIndex })
        .eq('id', sessionExerciseId);
    }
    
    // Update progress for current exercise
    if (sessionExerciseId) {
      const hasSetsValue = sets.some(s => s.weight > 0 || s.reps > 0);
      setExerciseProgress(prev => ({ ...prev, [sessionExerciseId]: hasSetsValue }));
    }
    
    // Navigate to new exercise - let useEffect determine initial set
    setSearchParams({ se: newSessionExerciseId });
  }, [sessionExerciseId, sets, setSearchParams, selectedSetIndex]);

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

  // Save active_set_index to DB
  const saveActiveSetIndex = useCallback(async (index: number) => {
    if (!sessionExerciseId) return;
    await supabase
      .from('session_exercises')
      .update({ active_set_index: index })
      .eq('id', sessionExerciseId);
  }, [sessionExerciseId]);

  // Set the ref for use in saveReps
  useEffect(() => {
    saveActiveSetIndexRef.current = saveActiveSetIndex;
  }, [saveActiveSetIndex]);

  const handleSetSelect = (index: number) => {
    // Save current values before switching
    if (currentSet) {
      saveWeight(weightValue);
      saveReps(repsValue, false);
    }
    setSelectedSetIndex(index);
    saveActiveSetIndex(index);
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
            {t('setOf')} {(selectedSetIndex ?? 0) + 1} {t('of')} {sets.length}
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

        {/* Set Tabs */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
          {sets.map((set, index) => (
            <button
              key={set.id}
              onClick={() => handleSetSelect(index)}
              className={`flex-shrink-0 px-4 py-2 rounded-lg font-medium transition-colors ${
                index === selectedSetIndex
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-muted-foreground'
              }`}
            >
              {index + 1}
            </button>
          ))}
          <button
            onClick={handleAddSet}
            className="flex-shrink-0 px-4 py-2 rounded-lg bg-secondary text-muted-foreground hover:text-foreground"
          >
            <Plus className="h-5 w-5" />
          </button>
        </div>

        {/* Current Set Input */}
        {currentSet && (
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

        {/* Quick Actions */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <Button 
            variant="secondary" 
            className="h-14 text-base font-medium"
            onClick={handleQuickAddRep}
          >
            <Plus className="h-4 w-4 mr-2" />
            {t('addRep')}
          </Button>
          <Button 
            variant="secondary" 
            className="h-14 text-base font-medium"
            onClick={handleQuickAddWeight}
          >
            <Plus className="h-4 w-4 mr-2" />
            +{incrementValue} {t('kg')}
          </Button>
        </div>

        {/* Quick Fill Buttons */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <Button 
            variant="outline" 
            className="h-12 text-sm font-medium"
            onClick={handleCopyLastAttempt}
          >
            <Copy className="h-4 w-4 mr-2" />
            Скопировать прошлую
          </Button>
          <Button 
            variant="outline" 
            className="h-12 text-sm font-medium"
            onClick={handleFillAllSets}
          >
            <Grid className="h-4 w-4 mr-2" />
            Заполнить все
          </Button>
        </div>

        {/* Add Set Button */}
        <Button
          onClick={handleAddSet}
          variant="secondary"
          className="w-full h-14 text-base font-medium mb-6"
          size="lg"
        >
          <Plus className="h-5 w-5 mr-2" />
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
                  const currentIdx = selectedSetIndex ?? 0;
                  if (currentIdx >= sets.length - 1 && currentIdx > 0) {
                    setSelectedSetIndex(currentIdx - 1);
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
    </Layout>
  );
}
