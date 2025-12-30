import { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkout } from '@/contexts/WorkoutContext';
import { toast } from 'sonner';
import { TemplateItem } from './useTemplates';

type StartProgress = {
  step: number;
  total: number;
  message: string;
};

interface UseTemplateWorkoutStartResult {
  isStarting: boolean;
  progress: StartProgress | null;
  slowConnection: boolean;
  startWorkout: (templateId: string, items: TemplateItem[]) => Promise<void>;
}

export function useTemplateWorkoutStart(): UseTemplateWorkoutStartResult {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { setActiveSession, hasActiveDraft, clearDraft, activeSessionId } = useWorkout();
  
  const [isStarting, setIsStarting] = useState(false);
  const [progress, setProgress] = useState<StartProgress | null>(null);
  const [slowConnection, setSlowConnection] = useState(false);
  
  // Anti-duplicate: track current start request
  const startRequestIdRef = useRef<string | null>(null);
  const slowConnectionTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const startWorkout = useCallback(async (templateId: string, items: TemplateItem[]) => {
    if (!user || items.length === 0) {
      toast.error('Добавьте упражнения в шаблон');
      return;
    }

    // Anti-duplicate: if already starting, ignore
    if (isStarting || startRequestIdRef.current) {
      console.log('[useTemplateWorkoutStart] Already starting, ignoring duplicate click');
      return;
    }

    // Generate unique request ID
    const requestId = crypto.randomUUID();
    startRequestIdRef.current = requestId;

    // If there's an active draft, warn user
    if (hasActiveDraft) {
      const confirmed = window.confirm(
        'У вас есть незавершённая тренировка. Создать новую?'
      );
      if (!confirmed) {
        startRequestIdRef.current = null;
        return;
      }
      await clearDraft();
      if (activeSessionId) {
        await supabase.from('sessions').delete().eq('id', activeSessionId);
      }
    }

    setIsStarting(true);
    setProgress({ step: 1, total: 3, message: 'Создаём тренировку…' });
    setSlowConnection(false);

    // Start slow connection detection
    slowConnectionTimeoutRef.current = setTimeout(() => {
      setSlowConnection(true);
    }, 2000);

    try {
      // Verify this request is still current
      if (startRequestIdRef.current !== requestId) {
        console.log('[useTemplateWorkoutStart] Request superseded, aborting');
        return;
      }

      // STEP 1: Delete any orphaned drafts and create session
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

      // Verify still current
      if (startRequestIdRef.current !== requestId) return;

      // Create template snapshot
      const templateSnapshot = items.map(item => ({
        exercise_id: item.exercise_id,
        target_sets: item.target_sets,
        sort_order: item.sort_order,
      }));

      const now = new Date().toISOString();
      const { data: session, error: sessionError } = await supabase
        .from('sessions')
        .insert({
          user_id: user.id,
          date: now,
          source: 'template',
          template_id: templateId,
          template_snapshot: templateSnapshot,
          status: 'draft',
          started_at: now,
          timer_last_started_at: now,
          elapsed_seconds: 0,
          timer_running: true,
        })
        .select()
        .single();

      if (sessionError) throw sessionError;

      // Verify still current
      if (startRequestIdRef.current !== requestId) {
        // Clean up created session
        await supabase.from('sessions').delete().eq('id', session.id);
        return;
      }

      // STEP 2: Batch fetch last weights for all exercises
      setProgress({ step: 2, total: 3, message: 'Добавляем упражнения…' });

      // Get last completed session exercises for all template exercises
      const exerciseIds = items.map(i => i.exercise_id);
      
      // Batch query for last completed weights
      const lastWeightsMap = new Map<string, { weight: number; reps: number }>();
      
      const { data: lastExercises } = await supabase
        .from('session_exercises')
        .select(`
          id,
          exercise_id,
          session:sessions!inner(status, completed_at)
        `)
        .in('exercise_id', exerciseIds)
        .eq('sessions.status', 'completed')
        .order('created_at', { ascending: false });

      if (lastExercises && lastExercises.length > 0) {
        // Get unique exercise IDs that we found
        const foundExerciseIds = [...new Set(lastExercises.map(e => e.exercise_id))];
        const latestSeIds = foundExerciseIds.map(exId => {
          const latest = lastExercises.find(e => e.exercise_id === exId);
          return latest?.id;
        }).filter(Boolean) as string[];

        if (latestSeIds.length > 0) {
          const { data: lastSets } = await supabase
            .from('sets')
            .select('session_exercise_id, weight, reps, set_index')
            .in('session_exercise_id', latestSeIds)
            .eq('set_index', 1);

          if (lastSets) {
            for (const set of lastSets) {
              const se = lastExercises.find(e => e.id === set.session_exercise_id);
              if (se && !lastWeightsMap.has(se.exercise_id)) {
                lastWeightsMap.set(se.exercise_id, { weight: set.weight, reps: set.reps });
              }
            }
          }
        }
      }

      // Verify still current
      if (startRequestIdRef.current !== requestId) {
        await supabase.from('sessions').delete().eq('id', session.id);
        return;
      }

      // STEP 2b: Batch create all session_exercises
      const sessionExercisesData = items.map(item => ({
        session_id: session.id,
        exercise_id: item.exercise_id,
        sort_order: item.sort_order,
        active_set_index: 1,
      }));

      const { data: createdExercises, error: seError } = await supabase
        .from('session_exercises')
        .insert(sessionExercisesData)
        .select('id, exercise_id');

      if (seError) throw seError;

      // Verify still current
      if (startRequestIdRef.current !== requestId) {
        await supabase.from('sessions').delete().eq('id', session.id);
        return;
      }

      // STEP 3: Batch create all sets
      setProgress({ step: 3, total: 3, message: 'Создаём подходы…' });

      const allSetsData: Array<{
        session_exercise_id: string;
        set_index: number;
        weight: number;
        reps: number;
        is_completed: boolean;
      }> = [];

      for (const item of items) {
        const createdSe = createdExercises?.find(se => se.exercise_id === item.exercise_id);
        if (!createdSe) continue;

        const lastData = lastWeightsMap.get(item.exercise_id);
        const defaultReps = item.exercise?.type && item.exercise.type <= 2 ? 6 : 10;
        const weight = lastData?.weight ?? 0;
        const reps = lastData?.reps ?? defaultReps;

        for (let i = 1; i <= item.target_sets; i++) {
          allSetsData.push({
            session_exercise_id: createdSe.id,
            set_index: i,
            weight,
            reps,
            is_completed: false,
          });
        }
      }

      const { error: setsError } = await supabase
        .from('sets')
        .insert(allSetsData);

      if (setsError) throw setsError;

      // Verify still current one last time
      if (startRequestIdRef.current !== requestId) {
        await supabase.from('sessions').delete().eq('id', session.id);
        return;
      }

      // Clear slow connection timeout
      if (slowConnectionTimeoutRef.current) {
        clearTimeout(slowConnectionTimeoutRef.current);
        slowConnectionTimeoutRef.current = null;
      }

      // Update workout context with new session
      await setActiveSession(session.id);

      toast.success('Тренировка создана');
      navigate('/workout');
    } catch (error) {
      console.error('Failed to start workout:', error);
      toast.error('Ошибка создания тренировки');
    } finally {
      // Clear slow connection timeout
      if (slowConnectionTimeoutRef.current) {
        clearTimeout(slowConnectionTimeoutRef.current);
        slowConnectionTimeoutRef.current = null;
      }
      
      setIsStarting(false);
      setProgress(null);
      setSlowConnection(false);
      startRequestIdRef.current = null;
    }
  }, [user, isStarting, hasActiveDraft, clearDraft, activeSessionId, setActiveSession, navigate]);

  return {
    isStarting,
    progress,
    slowConnection,
    startWorkout,
  };
}
