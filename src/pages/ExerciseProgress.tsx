import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, TrendingUp, Dumbbell, Calendar, Play, Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Layout } from "@/components/Layout";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkout } from "@/contexts/WorkoutContext";
import { supabase } from "@/integrations/supabase/client";
import { format } from 'date-fns';
import { ru, enUS } from 'date-fns/locale';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface ExerciseInfo {
  id: string;
  name: string;
  type: number;
  increment_kind: string;
  increment_value: number;
}

interface ExerciseState {
  current_working_weight: number;
  current_sets: number;
  base_sets: number;
  volume_reduce_on: boolean;
  rep_stage: number;
  last_target_range: string | null;
  last_recommendation_text: string | null;
}

interface SessionHistoryItem {
  session_id: string;
  completed_at: string;
  rpe: number | null;
  topSetWeight: number;
  topSetReps: number;
  sets: { weight: number; reps: number; set_index: number }[];
}

interface ChartDataPoint {
  date: string;
  shortDate: string;
  weight: number;
}

interface DebugInfo {
  totalSessionExercises: number;
  completedSessions: number;
  withSets: number;
}

export default function ExerciseProgress() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const exerciseId = searchParams.get('exercise');
  const backTo = searchParams.get('from') || 'exercises';
  
  const { t, locale } = useLanguage();
  const { user } = useAuth();
  const { hasActiveDraft, activeSessionId } = useWorkout();
  
  const [exercise, setExercise] = useState<ExerciseInfo | null>(null);
  const [exerciseState, setExerciseState] = useState<ExerciseState | null>(null);
  const [sessionHistory, setSessionHistory] = useState<SessionHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showMore, setShowMore] = useState(false);
  const [debugInfo, setDebugInfo] = useState<DebugInfo | null>(null);

  // Load all data
  useEffect(() => {
    if (!exerciseId || !user) return;

    const loadData = async () => {
      setIsLoading(true);
      
      try {
        // Load exercise info
        const { data: exerciseData } = await supabase
          .from('exercises')
          .select('id, name, type, increment_kind, increment_value')
          .eq('id', exerciseId)
          .single();
        
        if (exerciseData) {
          setExercise(exerciseData);
        }

        // Load exercise state
        const { data: stateData } = await supabase
          .from('exercise_state')
          .select('*')
          .eq('exercise_id', exerciseId)
          .eq('user_id', user.id)
          .maybeSingle();
        
        if (stateData) {
          setExerciseState(stateData);
        }

        // Load session history (last 20 completed sessions)
        // Query from sessions first, then filter session_exercises by exercise_id
        const { data: completedSessions, error: sessionsError } = await supabase
          .from('sessions')
          .select(`
            id,
            completed_at,
            session_exercises!inner(
              id,
              exercise_id,
              rpe,
              sets(
                set_index,
                weight,
                reps
              )
            )
          `)
          .eq('user_id', user.id)
          .eq('status', 'completed')
          .not('completed_at', 'is', null)
          .order('completed_at', { ascending: false })
          .limit(50); // Get more sessions to filter by exercise_id

        console.log('Sessions query result:', { completedSessions, sessionsError });

        // Filter for sessions that have this exercise and build history
        const history: SessionHistoryItem[] = [];
        let totalSessionExercisesForExercise = 0;

        if (completedSessions) {
          for (const session of completedSessions) {
            // Find session_exercises for this specific exercise_id
            const matchingExercises = session.session_exercises.filter(
              (se: { exercise_id: string }) => se.exercise_id === exerciseId
            );
            
            totalSessionExercisesForExercise += matchingExercises.length;

            for (const se of matchingExercises) {
              const sets = se.sets || [];
              
              if (sets.length > 0) {
                // Find top set (max weight, then max reps)
                let topWeight = 0;
                let topReps = 0;
                for (const s of sets) {
                  if (s.weight > topWeight || (s.weight === topWeight && s.reps > topReps)) {
                    topWeight = s.weight;
                    topReps = s.reps;
                  }
                }

                history.push({
                  session_id: session.id,
                  completed_at: session.completed_at!,
                  rpe: se.rpe,
                  topSetWeight: topWeight,
                  topSetReps: topReps,
                  sets: sets
                    .sort((a: { set_index: number }, b: { set_index: number }) => a.set_index - b.set_index)
                    .map((s: { weight: number; reps: number; set_index: number }) => ({
                      weight: s.weight,
                      reps: s.reps,
                      set_index: s.set_index,
                    })),
                });
              }

              // Limit to 20 history items
              if (history.length >= 20) break;
            }
            if (history.length >= 20) break;
          }
        }

        // Set debug info
        setDebugInfo({
          totalSessionExercises: totalSessionExercisesForExercise,
          completedSessions: completedSessions?.length || 0,
          withSets: history.length,
        });

        setSessionHistory(history);
      } catch (error) {
        console.error('Failed to load exercise progress:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [exerciseId, user]);

  // Build chart data
  const chartData: ChartDataPoint[] = useMemo(() => {
    return sessionHistory
      .slice()
      .reverse()
      .map(item => ({
        date: item.completed_at,
        shortDate: format(new Date(item.completed_at), 'd MMM', { locale: locale === 'ru' ? ru : enUS }),
        weight: item.topSetWeight,
      }));
  }, [sessionHistory, locale]);

  const handleBack = () => {
    if (backTo === 'history') {
      navigate(-1);
    } else {
      navigate('/exercises');
    }
  };

  const handleStartWorkout = () => {
    navigate('/workout');
  };

  const formatDate = (dateStr: string) => {
    return format(new Date(dateStr), 'd MMMM yyyy', { locale: locale === 'ru' ? ru : enUS });
  };

  const displayedHistory = showMore ? sessionHistory : sessionHistory.slice(0, 5);

  if (!exerciseId) {
    return (
      <Layout>
        <div className="px-4 pt-12 safe-top flex items-center justify-center min-h-[60vh]">
          <p className="text-muted-foreground">
            {locale === 'ru' ? 'Упражнение не найдено' : 'Exercise not found'}
          </p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="px-4 pt-12 safe-top pb-24">
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={handleBack}
            className="flex items-center gap-1 text-muted-foreground mb-3"
          >
            <ChevronLeft className="h-5 w-5" />
            <span className="text-sm">{t('back')}</span>
          </button>
          {isLoading ? (
            <div className="h-8 w-48 bg-secondary rounded animate-pulse" />
          ) : (
            <h1 className="text-2xl font-bold text-foreground">{exercise?.name}</h1>
          )}
          <p className="text-muted-foreground">
            {locale === 'ru' ? 'Прогресс по упражнению' : 'Exercise progress'}
          </p>
          {/* Debug info */}
          {debugInfo && (
            <p className="text-xs text-muted-foreground/60 mt-1 font-mono">
              {locale === 'ru' 
                ? `Сессий: ${debugInfo.completedSessions} | По упражнению: ${debugInfo.totalSessionExercises} | С сетами: ${debugInfo.withSets}`
                : `Sessions: ${debugInfo.completedSessions} | For exercise: ${debugInfo.totalSessionExercises} | With sets: ${debugInfo.withSets}`
              }
            </p>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-4">
            <div className="h-32 bg-secondary rounded-lg animate-pulse" />
            <div className="h-48 bg-secondary rounded-lg animate-pulse" />
            <div className="h-24 bg-secondary rounded-lg animate-pulse" />
          </div>
        ) : (
          <>
            {/* Current State Card */}
            {exerciseState && (
              <Card className="p-4 bg-primary/10 border-primary/20 mb-6">
                <div className="flex items-start gap-3">
                  <TrendingUp className="h-5 w-5 text-primary mt-0.5" />
                  <div className="flex-1">
                    <h4 className="font-semibold text-foreground mb-2">
                      {locale === 'ru' ? 'Текущая рекомендация' : 'Current recommendation'}
                    </h4>
                    <div className="space-y-1">
                      <p className="text-sm text-foreground">
                        <span className="text-muted-foreground">
                          {locale === 'ru' ? 'Рабочий вес:' : 'Working weight:'}
                        </span>{' '}
                        <span className="font-mono font-bold">
                          {exerciseState.current_working_weight} {t('kg')}
                        </span>
                      </p>
                      {exerciseState.last_target_range && (
                        <p className="text-sm text-foreground">
                          <span className="text-muted-foreground">{t('targetRange')}:</span>{' '}
                          <span className="font-mono font-bold">{exerciseState.last_target_range}</span>
                        </p>
                      )}
                      {exerciseState.last_recommendation_text && (
                        <p className="text-sm text-muted-foreground mt-2">
                          {exerciseState.last_recommendation_text}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            )}

            {/* Chart */}
            {chartData.length >= 2 && (
              <Card className="p-4 bg-card border-border mb-6">
                <h4 className="font-semibold text-foreground mb-4 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  {locale === 'ru' ? 'Тренд веса' : 'Weight trend'}
                </h4>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <XAxis 
                        dataKey="shortDate" 
                        tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                        tickLine={false}
                        axisLine={false}
                        domain={['auto', 'auto']}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px',
                          color: 'hsl(var(--foreground))',
                        }}
                        formatter={(value: number) => [`${value} ${t('kg')}`, locale === 'ru' ? 'Макс. вес' : 'Max weight']}
                      />
                      <Line
                        type="monotone"
                        dataKey="weight"
                        stroke="hsl(var(--primary))"
                        strokeWidth={2}
                        dot={{ fill: 'hsl(var(--primary))', strokeWidth: 0, r: 4 }}
                        activeDot={{ r: 6, fill: 'hsl(var(--primary))' }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            )}

            {/* Empty state for chart */}
            {chartData.length < 2 && chartData.length > 0 && (
              <Card className="p-4 bg-card border-border mb-6">
                <div className="text-center py-4">
                  <TrendingUp className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">
                    {locale === 'ru' 
                      ? 'Нужно минимум 2 тренировки для отображения графика' 
                      : 'At least 2 workouts needed for chart'}
                  </p>
                </div>
              </Card>
            )}

            {/* Session History */}
            {sessionHistory.length > 0 ? (
              <div className="mb-6">
                <h4 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  {locale === 'ru' ? 'Последние тренировки' : 'Recent workouts'}
                </h4>
                <div className="space-y-3">
                  {displayedHistory.map((item) => (
                    <Card key={item.session_id} className="p-4 bg-card border-border">
                      <div className="flex items-center justify-between mb-2">
                        <p className="font-medium text-foreground">{formatDate(item.completed_at)}</p>
                        {item.rpe !== null && (
                          <span className="text-sm text-accent">RPE {item.rpe}</span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {item.sets.map((set) => (
                          <span
                            key={set.set_index}
                            className="text-sm font-mono px-2 py-1 rounded bg-secondary text-foreground"
                          >
                            {set.weight}×{set.reps}
                          </span>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        {locale === 'ru' ? 'Макс:' : 'Top:'} {item.topSetWeight}{t('kg')} × {item.topSetReps}
                      </p>
                    </Card>
                  ))}
                </div>

                {sessionHistory.length > 5 && !showMore && (
                  <Button
                    variant="ghost"
                    className="w-full mt-3"
                    onClick={() => setShowMore(true)}
                  >
                    {locale === 'ru' ? `Показать ещё (${sessionHistory.length - 5})` : `Show more (${sessionHistory.length - 5})`}
                  </Button>
                )}
              </div>
            ) : (
              <Card className="p-8 bg-card border-border text-center mb-6">
                <Dumbbell className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="font-semibold text-foreground mb-2">
                  {locale === 'ru' ? 'Пока нет истории' : 'No history yet'}
                </h3>
                <p className="text-sm text-muted-foreground mb-4">
                  {locale === 'ru' 
                    ? 'Выполните это упражнение в тренировке, чтобы увидеть прогресс'
                    : 'Complete this exercise in a workout to see progress'}
                </p>
                <Button onClick={handleStartWorkout}>
                  {hasActiveDraft ? (
                    <>
                      <Plus className="h-4 w-4 mr-2" />
                      {locale === 'ru' ? 'Добавить в тренировку' : 'Add to workout'}
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4 mr-2" />
                      {locale === 'ru' ? 'Начать тренировку' : 'Start workout'}
                    </>
                  )}
                </Button>
              </Card>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}
