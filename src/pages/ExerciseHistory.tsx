import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, Calendar, Clock, Dumbbell, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Layout } from "@/components/Layout";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { format } from 'date-fns';
import { ru, enUS } from 'date-fns/locale';

interface CompletedSession {
  id: string;
  date: string;
  completed_at: string;
  exercises: {
    id: string;
    name: string;
    rpe: number | null;
    sets: { weight: number; reps: number; set_index: number }[];
  }[];
}

export default function ExerciseHistory() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get('session');
  const { t, locale } = useLanguage();
  const { user } = useAuth();
  
  const [sessions, setSessions] = useState<CompletedSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<CompletedSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load completed sessions
  useEffect(() => {
    if (!user) return;

    const loadSessions = async () => {
      setIsLoading(true);
      
      const { data: sessionsData, error } = await supabase
        .from('sessions')
        .select('id, date, completed_at')
        .eq('user_id', user.id)
        .eq('status', 'completed')
        .order('completed_at', { ascending: false });

      if (error || !sessionsData) {
        setIsLoading(false);
        return;
      }

      // Load exercises for each session
      const sessionsWithExercises: CompletedSession[] = [];
      
      for (const session of sessionsData) {
        const { data: exercisesData } = await supabase
          .from('session_exercises')
          .select(`
            id,
            rpe,
            exercise:exercises(name)
          `)
          .eq('session_id', session.id);

        const exercises = [];
        for (const se of exercisesData || []) {
          const { data: setsData } = await supabase
            .from('sets')
            .select('weight, reps, set_index')
            .eq('session_exercise_id', se.id)
            .order('set_index');

          exercises.push({
            id: se.id,
            name: (se.exercise as any)?.name || 'Unknown',
            rpe: se.rpe,
            sets: setsData || [],
          });
        }

        sessionsWithExercises.push({
          id: session.id,
          date: session.date,
          completed_at: session.completed_at,
          exercises,
        });
      }

      setSessions(sessionsWithExercises);
      
      // If session ID provided, select it
      if (sessionId) {
        const found = sessionsWithExercises.find(s => s.id === sessionId);
        if (found) setSelectedSession(found);
      }
      
      setIsLoading(false);
    };

    loadSessions();
  }, [user, sessionId]);

  const formatSessionDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return format(date, 'd MMMM yyyy, HH:mm', { locale: locale === 'ru' ? ru : enUS });
  };

  const calculateDuration = (session: CompletedSession) => {
    const start = new Date(session.date).getTime();
    const end = new Date(session.completed_at).getTime();
    return Math.round((end - start) / 60000);
  };

  const getTotalSets = (session: CompletedSession) => {
    return session.exercises.reduce((sum, ex) => sum + ex.sets.length, 0);
  };

  // Session Details View
  if (selectedSession) {
    return (
      <Layout>
        <div className="px-4 pt-12 safe-top pb-24">
          <div className="mb-6">
            <button
              onClick={() => setSelectedSession(null)}
              className="flex items-center gap-1 text-muted-foreground mb-3"
            >
              <ChevronLeft className="h-5 w-5" />
              <span className="text-sm">{t('back')}</span>
            </button>
            <h1 className="text-2xl font-bold text-foreground">{t('workoutDetails')}</h1>
            <p className="text-muted-foreground">
              {formatSessionDate(selectedSession.completed_at)}
            </p>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            <Card className="p-4 bg-card border-border">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="h-4 w-4 text-primary" />
                <span className="text-xs text-muted-foreground">{t('duration')}</span>
              </div>
              <p className="text-xl font-bold text-foreground">
                {calculateDuration(selectedSession)} {t('minutes')}
              </p>
            </Card>
            <Card className="p-4 bg-card border-border">
              <div className="flex items-center gap-2 mb-1">
                <Dumbbell className="h-4 w-4 text-accent" />
                <span className="text-xs text-muted-foreground">{t('totalSets')}</span>
              </div>
              <p className="text-xl font-bold text-foreground">
                {getTotalSets(selectedSession)}
              </p>
            </Card>
          </div>

          {/* Exercises */}
          <div className="space-y-4">
            {selectedSession.exercises.map((exercise) => (
              <Card key={exercise.id} className="p-4 bg-card border-border">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-foreground">{exercise.name}</h3>
                  {exercise.rpe && (
                    <span className="text-sm text-accent">RPE {exercise.rpe}</span>
                  )}
                </div>
                <div className="space-y-2">
                  {exercise.sets.map((set) => (
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
        </div>
      </Layout>
    );
  }

  // Sessions List View
  return (
    <Layout>
      <div className="px-4 pt-12 safe-top pb-24">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground">{t('workoutHistory')}</h1>
          <p className="text-muted-foreground">{t('history')}</p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : sessions.length === 0 ? (
          <Card className="p-8 bg-card border-border text-center">
            <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="font-semibold text-foreground mb-2">{t('noCompletedWorkouts')}</h3>
            <p className="text-sm text-muted-foreground">{t('completeFirstWorkout')}</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {sessions.map((session) => (
              <Card
                key={session.id}
                className="p-4 bg-card border-border hover:bg-secondary/50 transition-colors cursor-pointer"
                onClick={() => setSelectedSession(session)}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-foreground">
                      {formatSessionDate(session.completed_at)}
                    </p>
                    <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                      <span>{session.exercises.length} {t('exercisesCount')}</span>
                      <span>•</span>
                      <span>{getTotalSets(session)} {t('sets')}</span>
                      <span>•</span>
                      <span>{calculateDuration(session)} {t('minutes')}</span>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
