import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Check, ChevronRight, Timer, Dumbbell, Play, RotateCcw, Loader2, Undo2, MoreVertical, Trash2, RefreshCw, ChevronUp, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Layout } from "@/components/Layout";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { useSessionExercises } from "@/hooks/useSessions";
import { Exercise } from "@/hooks/useExercises";
import { ExercisePicker } from "@/components/ExercisePicker";
import { SyncIndicator } from "@/components/SyncIndicator";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { calculateProgressionForSession } from "@/lib/progression";
import { useWorkout } from "@/contexts/WorkoutContext";
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

interface SessionTimerData {
  elapsed_seconds: number;
  timer_running: boolean;
  timer_last_started_at: string | null;
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
  
  const { exercises: sessionExercises, isLoading, addExercise, deleteExercise, replaceExercise, reorderExercises } = useSessionExercises(sessionId);
  const [showPicker, setShowPicker] = useState(false);
  const [pickerMode, setPickerMode] = useState<'add' | 'replace'>('add');
  const [replacingExerciseId, setReplacingExerciseId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [exerciseToDelete, setExerciseToDelete] = useState<{ id: string; name: string } | null>(null);
  const [workoutTime, setWorkoutTime] = useState(0);
  const [isFinishing, setIsFinishing] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isRepeating, setIsRepeating] = useState(false);
  const [timerData, setTimerData] = useState<SessionTimerData | null>(null);
  const [lastCompletedSessionId, setLastCompletedSessionId] = useState<string | null>(null);
  const [undoAvailableUntil, setUndoAvailableUntil] = useState<Date | null>(null);
  const [isUndoing, setIsUndoing] = useState(false);
  const undoToastIdRef = useRef<string | number | null>(null);

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

  // Fetch session timer data
  useEffect(() => {
    if (!sessionId) {
      setTimerData(null);
      setWorkoutTime(0);
      return;
    }

    const fetchTimerData = async () => {
      const { data } = await supabase
        .from('sessions')
        .select('elapsed_seconds, timer_running, timer_last_started_at')
        .eq('id', sessionId)
        .single();
      
      if (data) {
        setTimerData({
          elapsed_seconds: data.elapsed_seconds || 0,
          timer_running: data.timer_running ?? true,
          timer_last_started_at: data.timer_last_started_at,
        });
      }
    };

    fetchTimerData();
  }, [sessionId]);

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
    if (!sessionId) return;

    try {
      const { data: exerciseState } = await supabase
        .from('exercise_state')
        .select('current_sets')
        .eq('exercise_id', exercise.id)
        .maybeSingle();

      const setsCount = exerciseState?.current_sets || 3;

      const { data: lastSessionExercise } = await supabase
        .from('session_exercises')
        .select(`
          id,
          session:sessions!inner(status)
        `)
        .eq('exercise_id', exercise.id)
        .eq('sessions.status', 'completed')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      let lastWeight = 0;
      let lastReps = exercise.type <= 2 ? 6 : 10;

      if (lastSessionExercise) {
        const { data: sets } = await supabase
          .from('sets')
          .select('weight, reps')
          .eq('session_exercise_id', lastSessionExercise.id)
          .order('set_index')
          .limit(1);

        if (sets && sets.length > 0) {
          lastWeight = sets[0].weight;
          lastReps = sets[0].reps;
        }
      }

      const initialSets = Array.from({ length: setsCount }, () => ({
        weight: lastWeight,
        reps: lastReps,
      }));

      if (pickerMode === 'replace' && replacingExerciseId) {
        await replaceExercise({
          oldSessionExerciseId: replacingExerciseId,
          newExerciseId: exercise.id,
          initialSets,
        });
        toast.success(locale === 'ru' ? 'Упражнение заменено' : 'Exercise replaced');
        setReplacingExerciseId(null);
      } else {
        await addExercise({ exerciseId: exercise.id, initialSets });
        toast.success(locale === 'ru' ? 'Упражнение добавлено' : 'Exercise added');
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

  const handleMoveExercise = async (exerciseId: string, direction: 'up' | 'down') => {
    const currentIndex = sessionExercises.findIndex(e => e.id === exerciseId);
    if (currentIndex === -1) return;
    
    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (newIndex < 0 || newIndex >= sessionExercises.length) return;
    
    const newItems = [...sessionExercises];
    [newItems[currentIndex], newItems[newIndex]] = [newItems[newIndex], newItems[currentIndex]];
    
    const newOrder = newItems.map((item, index) => ({
      id: item.id,
      sort_order: index + 1,
    }));
    
    try {
      await reorderExercises(newOrder);
    } catch (error) {
      console.error('Failed to reorder exercises:', error);
      toast.error(locale === 'ru' ? 'Ошибка сортировки' : 'Failed to reorder');
    }
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

  const handleFinishWorkout = async () => {
    if (!sessionId || !user) return;
    
    setIsFinishing(true);
    try {
      // Stop timer and calculate final elapsed time
      let finalElapsed = timerData?.elapsed_seconds || 0;
      if (timerData?.timer_running && timerData?.timer_last_started_at) {
        const lastStart = new Date(timerData.timer_last_started_at).getTime();
        finalElapsed += Math.floor((Date.now() - lastStart) / 1000);
      }

      // Calculate progression for all exercises in the session
      await calculateProgressionForSession(sessionId, user.id);
      
      const now = new Date();
      const undoUntil = new Date(now.getTime() + 10 * 60 * 1000); // 10 minutes

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
        .eq('id', sessionId);

      if (error) throw error;

      // Store for undo
      const completedSessionId = sessionId;
      setLastCompletedSessionId(completedSessionId);
      setUndoAvailableUntil(undoUntil);

      // Clear local draft
      await clearDraft();

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

      navigate('/');
    } catch (error) {
      console.error('Failed to finish workout:', error);
      toast.error('Failed to finish workout');
    } finally {
      setIsFinishing(false);
    }
  };

  const handleStartWorkout = async () => {
    setIsStarting(true);
    try {
      const newDraft = await startNewWorkout('empty');
      if (newDraft?.session_id) {
        // Session is now active, component will re-render with activeSessionId
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
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : sessionExercises.length === 0 ? (
          <Card className="p-8 bg-card border-border text-center mb-6">
            <Dumbbell className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="font-semibold text-foreground mb-2">{t('noExercisesInWorkout')}</h3>
            <p className="text-sm text-muted-foreground">{t('addExercisesToStart')}</p>
          </Card>
        ) : (
          <div className="space-y-3 mb-6">
            {sessionExercises.map((se, index) => (
              <Card
                key={se.id}
                className="p-4 bg-card border-border"
              >
                <div className="flex items-center gap-3">
                  {/* Reorder buttons */}
                  <div className="flex flex-col gap-1">
                    <button
                      onClick={() => handleMoveExercise(se.id, 'up')}
                      disabled={index === 0}
                      className="p-1 rounded hover:bg-secondary disabled:opacity-30 transition-colors"
                    >
                      <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    </button>
                    <button
                      onClick={() => handleMoveExercise(se.id, 'down')}
                      disabled={index === sessionExercises.length - 1}
                      className="p-1 rounded hover:bg-secondary disabled:opacity-30 transition-colors"
                    >
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    </button>
                  </div>

                  {/* Exercise info */}
                  <div 
                    className="flex items-center gap-3 flex-1 cursor-pointer hover:opacity-80 transition-opacity"
                    onClick={() => navigate(`/exercise?se=${se.id}`)}
                  >
                    <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-muted-foreground">
                      <Dumbbell className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground">{se.exercise?.name}</h3>
                      <p className="text-sm text-muted-foreground">
                        {se.rpe ? `RPE ${se.rpe}` : t('sets')}
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
            ))}
          </div>
        )}

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
    </Layout>
  );
}
