import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, Trophy, TrendingDown, Calendar } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Layout } from "@/components/Layout";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { format } from 'date-fns';
import { ru, enUS } from 'date-fns/locale';

interface ExerciseState {
  current_working_weight: number;
  current_sets: number;
  volume_reduce_on: boolean;
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
        .select('current_working_weight, current_sets, volume_reduce_on')
        .eq('exercise_id', exerciseId)
        .eq('user_id', user.id)
        .maybeSingle();
      
      if (stateData) {
        setExerciseState(stateData);
      }

      // Load last 5 completed sessions with this exercise
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
        .limit(5);

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
              </Card>
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
                  {sessionHistory.map((item) => (
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
