import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Check, ChevronRight, Timer, Dumbbell, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Layout } from "@/components/Layout";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { useSession, useSessionExercises } from "@/hooks/useSessions";
import { Exercise } from "@/hooks/useExercises";
import { ExercisePicker } from "@/components/ExercisePicker";
import { SyncIndicator } from "@/components/SyncIndicator";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { calculateProgressionForSession } from "@/lib/progression";
import { useDraftWorkout } from "@/hooks/useDraftWorkout";
import { deleteDraft } from "@/lib/draftStorage";

export default function Workout() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get('session');
  const { t, locale } = useLanguage();
  const { user } = useAuth();
  
  const { data: session } = useSession(sessionId);
  const { exercises: sessionExercises, isLoading, addExercise } = useSessionExercises(sessionId);
  const [showPicker, setShowPicker] = useState(false);
  const [workoutTime, setWorkoutTime] = useState(0);
  const [isFinishing, setIsFinishing] = useState(false);

  const { syncState, isOnline, isSyncing, syncDraftToSupabase } = useDraftWorkout({
    userId: user?.id,
  });

  // Timer
  useEffect(() => {
    if (!session) return;
    
    const startTime = new Date(session.date).getTime();
    const interval = setInterval(() => {
      setWorkoutTime(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [session]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleSelectExercise = async (exercise: Exercise) => {
    if (!sessionId) return;

    try {
      // Get exercise state for initial sets count
      const { data: exerciseState } = await supabase
        .from('exercise_state')
        .select('current_sets')
        .eq('exercise_id', exercise.id)
        .maybeSingle();

      const setsCount = exerciseState?.current_sets || 3;

      // Get last completed session's sets for this exercise
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

      // Create initial sets
      const initialSets = Array.from({ length: setsCount }, () => ({
        weight: lastWeight,
        reps: lastReps,
      }));

      await addExercise({ exerciseId: exercise.id, initialSets });
      setShowPicker(false);
    } catch (error) {
      console.error('Failed to add exercise:', error);
      toast.error('Failed to add exercise');
    }
  };

  const handleFinishWorkout = async () => {
    if (!sessionId || !user) return;
    
    setIsFinishing(true);
    try {
      // Calculate progression for all exercises in the session
      await calculateProgressionForSession(sessionId, user.id);
      
      // Update session status to completed
      const { error } = await supabase
        .from('sessions')
        .update({ 
          status: 'completed',
          completed_at: new Date().toISOString()
        })
        .eq('id', sessionId);

      if (error) throw error;

      // Clear local draft
      await deleteDraft(user.id);

      toast.success(t('workoutFinished'));
      navigate('/');
    } catch (error) {
      console.error('Failed to finish workout:', error);
      toast.error('Failed to finish workout');
    } finally {
      setIsFinishing(false);
    }
  };

  if (!sessionId) {
    return (
      <Layout>
        <div className="px-4 pt-12 safe-top flex flex-col items-center justify-center min-h-[60vh]">
          <Dumbbell className="h-16 w-16 text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold text-foreground mb-2">{t('noActiveSession')}</h2>
          <p className="text-muted-foreground mb-6">{t('startNewWorkout')}</p>
          <Button onClick={() => navigate('/')}>
            <ArrowLeft className="h-5 w-5 mr-2" />
            {t('home')}
          </Button>
        </div>
      </Layout>
    );
  }

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
            {sessionExercises.map((se) => (
              <Card
                key={se.id}
                className="p-4 bg-card border-border hover:bg-secondary/50 transition-colors cursor-pointer active:scale-[0.98]"
                onClick={() => navigate(`/exercise?se=${se.id}`)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
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
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="space-y-3">
          <Button
            onClick={() => setShowPicker(true)}
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
          onClose={() => setShowPicker(false)}
        />
      )}
    </Layout>
  );
}
