import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, Trophy, TrendingDown, Calendar, TrendingUp, Weight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Layout } from "@/components/Layout";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { format } from 'date-fns';
import { ru, enUS } from 'date-fns/locale';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from 'recharts';

interface ExerciseState {
  current_working_weight: number;
  current_sets: number;
  volume_reduce_on: boolean;
  last_target_range: string | null;
  last_recommendation_text: string | null;
}

interface SessionHistoryItem {
  session_id: string;
  session_exercise_id: string;
  completed_at: string;
  rpe: number | null;
  sets: { weight: number; reps: number; set_index: number }[];
}

interface BestSession {
  completed_at: string;
  weight: number;
  reps: number;
}

interface ChartDataPoint {
  date: string;
  shortDate: string;
  maxWeight: number;
  totalVolume: number;
  totalReps: number;
}

export default function SingleExerciseHistory() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const exerciseId = searchParams.get('exercise');
  const sessionExerciseId = searchParams.get('se');
  const { t, locale } = useLanguage();
  const { user } = useAuth();
  
  const [exerciseName, setExerciseName] = useState('');
  const [exerciseState, setExerciseState] = useState<ExerciseState | null>(null);
  const [sessionHistory, setSessionHistory] = useState<SessionHistoryItem[]>([]);
  const [bestSession, setBestSession] = useState<BestSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user || !exerciseId) return;

    const loadData = async () => {
      setIsLoading(true);

      // Load exercise name
      const { data: exerciseData } = await supabase
        .from('exercises')
        .select('name')
        .eq('id', exerciseId)
        .maybeSingle();
      
      if (exerciseData) {
        setExerciseName(exerciseData.name);
      }

      // Load exercise state
      const { data: stateData } = await supabase
        .from('exercise_state')
        .select('current_working_weight, current_sets, volume_reduce_on, last_target_range, last_recommendation_text')
        .eq('exercise_id', exerciseId)
        .eq('user_id', user.id)
        .maybeSingle();
      
      if (stateData) {
        setExerciseState(stateData);
      }

      // Load last 20 completed sessions with this exercise (for charts)
      const { data: sessionExercises } = await supabase
        .from('session_exercises')
        .select(`
          id,
          session_id,
          rpe,
          sessions!inner(id, completed_at, status, user_id)
        `)
        .eq('exercise_id', exerciseId)
        .eq('sessions.status', 'completed')
        .eq('sessions.user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20);

      if (sessionExercises && sessionExercises.length > 0) {
        const history: SessionHistoryItem[] = [];
        let bestWeight = -1;
        let bestReps = -1;
        let bestDate = '';

        for (const se of sessionExercises) {
          const { data: setsData } = await supabase
            .from('sets')
            .select('weight, reps, set_index')
            .eq('session_exercise_id', se.id)
            .order('set_index');

          const sets = setsData || [];
          const session = se.sessions as { id: string; completed_at: string; status: string; user_id: string };

          history.push({
            session_id: session.id,
            session_exercise_id: se.id,
            completed_at: session.completed_at,
            rpe: se.rpe,
            sets,
          });

          // Find best session (max weight, then max reps)
          for (const set of sets) {
            if (set.weight > bestWeight || (set.weight === bestWeight && set.reps > bestReps)) {
              bestWeight = set.weight;
              bestReps = set.reps;
              bestDate = session.completed_at;
            }
          }
        }

        // Sort by completed_at desc
        history.sort((a, b) => new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime());
        setSessionHistory(history);

        if (bestWeight >= 0) {
          setBestSession({
            completed_at: bestDate,
            weight: bestWeight,
            reps: bestReps,
          });
        }
      }

      setIsLoading(false);
    };

    loadData();
  }, [user, exerciseId]);

  // Prepare chart data
  const chartData = useMemo<ChartDataPoint[]>(() => {
    if (sessionHistory.length === 0) return [];

    // Reverse to show oldest first (left to right on chart)
    return [...sessionHistory].reverse().map((item) => {
      const maxWeight = Math.max(...item.sets.map(s => s.weight), 0);
      const totalVolume = item.sets.reduce((sum, s) => sum + s.weight * s.reps, 0);
      const totalReps = item.sets.reduce((sum, s) => sum + s.reps, 0);
      const date = new Date(item.completed_at);
      
      return {
        date: format(date, 'd MMM', { locale: locale === 'ru' ? ru : enUS }),
        shortDate: format(date, 'd.MM'),
        maxWeight,
        totalVolume,
        totalReps,
      };
    });
  }, [sessionHistory, locale]);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return format(date, 'd MMMM yyyy', { locale: locale === 'ru' ? ru : enUS });
  };

  const handleBack = () => {
    if (sessionExerciseId) {
      navigate(`/exercise?se=${sessionExerciseId}`);
    } else {
      navigate(-1);
    }
  };

  if (!exerciseId) {
    return (
      <Layout>
        <div className="px-4 pt-12 safe-top flex items-center justify-center min-h-[60vh]">
          <p className="text-muted-foreground">{t('noExercises')}</p>
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
          <h1 className="text-2xl font-bold text-foreground">{exerciseName || t('exerciseHistory')}</h1>
          <p className="text-muted-foreground">{t('exerciseHistory')}</p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* Current Exercise State */}
            {exerciseState && (
              <Card className="p-4 bg-card border-border mb-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-foreground">{t('currentStatus')}</h3>
                  {exerciseState.volume_reduce_on && (
                    <Badge variant="secondary" className="bg-amber-500/20 text-amber-500">
                      <TrendingDown className="h-3 w-3 mr-1" />
                      {t('volumeReduction')}
                    </Badge>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">{t('currentWorkingWeight')}</p>
                    <p className="text-xl font-bold text-foreground font-mono">
                      {exerciseState.current_working_weight} {t('kg')}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{t('workingSets')}</p>
                    <p className="text-xl font-bold text-foreground font-mono">
                      {exerciseState.current_sets}
                    </p>
                  </div>
                </div>
                
                {/* Recommendation */}
                {exerciseState.last_recommendation_text && (
                  <div className="mt-4 pt-4 border-t border-border">
                    <p className="text-xs text-muted-foreground mb-1">{t('nextTimeRecommendation')}</p>
                    {exerciseState.last_target_range && (
                      <p className="text-sm text-foreground mb-1">
                        <span className="text-muted-foreground">{t('targetRange')}:</span>{' '}
                        <span className="font-mono">{exerciseState.last_target_range}</span>
                      </p>
                    )}
                    <p className="text-sm text-muted-foreground">
                      {exerciseState.last_recommendation_text}
                    </p>
                  </div>
                )}
              </Card>
            )}

            {/* Progress Charts */}
            {chartData.length >= 2 && (
              <div className="space-y-6 mb-6">
                {/* Weight Progress Chart */}
                <Card className="p-4 bg-card border-border">
                  <div className="flex items-center gap-2 mb-4">
                    <TrendingUp className="h-4 w-4 text-primary" />
                    <h3 className="font-semibold text-foreground text-sm">Прогресс веса</h3>
                  </div>
                  <div className="h-[180px] -ml-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData}>
                        <CartesianGrid 
                          strokeDasharray="3 3" 
                          stroke="hsl(var(--border))" 
                          vertical={false}
                        />
                        <XAxis 
                          dataKey="date" 
                          tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                          tickLine={false}
                          axisLine={false}
                        />
                        <YAxis 
                          tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                          tickLine={false}
                          axisLine={false}
                          width={35}
                          domain={['dataMin - 5', 'dataMax + 5']}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: 'hsl(var(--card))',
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '8px',
                            fontSize: '12px',
                          }}
                          labelStyle={{ color: 'hsl(var(--foreground))' }}
                          formatter={(value: number) => [`${value} кг`, 'Макс. вес']}
                        />
                        <Line
                          type="monotone"
                          dataKey="maxWeight"
                          stroke="hsl(var(--primary))"
                          strokeWidth={2}
                          dot={{ fill: 'hsl(var(--primary))', strokeWidth: 0, r: 4 }}
                          activeDot={{ r: 6, fill: 'hsl(var(--primary))' }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </Card>

                {/* Volume Progress Chart */}
                <Card className="p-4 bg-card border-border">
                  <div className="flex items-center gap-2 mb-4">
                    <Weight className="h-4 w-4 text-accent" />
                    <h3 className="font-semibold text-foreground text-sm">Объём тренировки</h3>
                  </div>
                  <div className="h-[180px] -ml-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData}>
                        <CartesianGrid 
                          strokeDasharray="3 3" 
                          stroke="hsl(var(--border))" 
                          vertical={false}
                        />
                        <XAxis 
                          dataKey="date" 
                          tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                          tickLine={false}
                          axisLine={false}
                        />
                        <YAxis 
                          tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                          tickLine={false}
                          axisLine={false}
                          width={45}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: 'hsl(var(--card))',
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '8px',
                            fontSize: '12px',
                          }}
                          labelStyle={{ color: 'hsl(var(--foreground))' }}
                          formatter={(value: number) => [`${value} кг`, 'Объём']}
                        />
                        <Bar
                          dataKey="totalVolume"
                          fill="hsl(var(--accent))"
                          radius={[4, 4, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2 text-center">
                    Объём = вес × повторы (сумма всех подходов)
                  </p>
                </Card>
              </div>
            )}

            {/* Best Session */}
            {bestSession && (
              <Card className="p-4 bg-primary/10 border-primary/20 mb-6">
                <div className="flex items-start gap-3">
                  <Trophy className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <h4 className="font-semibold text-foreground mb-1">{t('bestSession')}</h4>
                    <p className="text-2xl font-bold text-primary font-mono">
                      {bestSession.weight} × {bestSession.reps}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatDate(bestSession.completed_at)}
                    </p>
                  </div>
                </div>
              </Card>
            )}

            {/* Session History */}
            <div className="mb-6">
              <h3 className="text-sm font-medium text-muted-foreground mb-3">{t('lastSessions')}</h3>
              
              {sessionHistory.length === 0 ? (
                <Card className="p-6 bg-card border-border text-center">
                  <Calendar className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground">{t('noSessionsYet')}</p>
                </Card>
              ) : (
                <div className="space-y-3">
                  {sessionHistory.slice(0, 5).map((item) => (
                    <Card key={item.session_exercise_id} className="p-4 bg-card border-border">
                      <div className="flex items-center justify-between mb-3">
                        <p className="font-medium text-foreground">{formatDate(item.completed_at)}</p>
                        {item.rpe && (
                          <span className="text-sm text-accent">RPE {item.rpe}</span>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        {item.sets.map((set) => (
                          <div
                            key={set.set_index}
                            className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-secondary/50"
                          >
                            <span className="text-sm text-muted-foreground">
                              {t('set')} {set.set_index}
                            </span>
                            <span className="font-mono font-medium text-foreground">
                              {set.weight}{t('kg')} × {set.reps}
                            </span>
                          </div>
                        ))}
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
