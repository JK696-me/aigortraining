import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, Calendar, Clock, Dumbbell, ChevronRight, MoreVertical, Trash2, Undo2, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { Layout } from "@/components/Layout";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkout } from "@/contexts/WorkoutContext";
import { supabase } from "@/integrations/supabase/client";
import { format } from 'date-fns';
import { ru, enUS } from 'date-fns/locale';
import { toast } from 'sonner';

interface CompletedSession {
  id: string;
  date: string;
  completed_at: string;
  undo_available_until: string | null;
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
  const { setActiveSession } = useWorkout();
  
  const [sessions, setSessions] = useState<CompletedSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<CompletedSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [sessionToDelete, setSessionToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isUndoing, setIsUndoing] = useState(false);
  const [, setForceUpdate] = useState(0);

  // Force re-render every second to update undo availability
  useEffect(() => {
    const interval = setInterval(() => setForceUpdate(n => n + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  // Load completed sessions
  useEffect(() => {
    if (!user) return;

    const loadSessions = async () => {
      setIsLoading(true);
      
      const { data: sessionsData, error } = await supabase
        .from('sessions')
        .select('id, date, completed_at, undo_available_until')
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
          undo_available_until: session.undo_available_until,
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

  const handleDeleteClick = (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    setSessionToDelete(sessionId);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!sessionToDelete) return;
    
    setIsDeleting(true);
    try {
      // CASCADE will automatically delete session_exercises and sets
      const { error } = await supabase
        .from('sessions')
        .delete()
        .eq('id', sessionToDelete);

      if (error) throw error;

      // Update local state
      setSessions(prev => prev.filter(s => s.id !== sessionToDelete));
      
      // If viewing deleted session details, go back to list
      if (selectedSession?.id === sessionToDelete) {
        setSelectedSession(null);
      }
      
      toast.success('Тренировка удалена');
    } catch (error) {
      console.error('Failed to delete session:', error);
      toast.error('Ошибка удаления');
    } finally {
      setIsDeleting(false);
      setDeleteDialogOpen(false);
      setSessionToDelete(null);
    }
  };

  const canUndo = (session: CompletedSession) => {
    if (!session.undo_available_until) return false;
    return new Date() <= new Date(session.undo_available_until);
  };

  const getUndoTimeRemaining = (session: CompletedSession) => {
    if (!session.undo_available_until) return 0;
    const remaining = new Date(session.undo_available_until).getTime() - Date.now();
    return Math.max(0, Math.ceil(remaining / 1000));
  };

  const formatUndoTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleUndoWorkout = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    
    setIsUndoing(true);
    try {
      const { data, error } = await supabase.rpc('undo_complete_session', {
        session_id: sessionId,
      });

      if (error) {
        console.error('RPC error:', error);
        if (error.message.includes('undo_not_available')) {
          toast.error(locale === 'ru' ? 'Время отмены истекло' : 'Undo time expired');
        } else if (error.message.includes('session_not_found')) {
          toast.error(locale === 'ru' ? 'Сессия не найдена' : 'Session not found');
        } else {
          toast.error(locale === 'ru' ? 'Ошибка отмены' : 'Failed to undo');
        }
        return;
      }

      // Restore local draft from server
      await setActiveSession(sessionId);

      toast.success(locale === 'ru' ? 'Тренировка восстановлена' : 'Workout restored');
      navigate('/workout');
    } catch (error) {
      console.error('Failed to undo workout:', error);
      toast.error(locale === 'ru' ? 'Ошибка отмены' : 'Failed to undo');
    } finally {
      setIsUndoing(false);
    }
  };

  // Session Details View
  if (selectedSession) {
    return (
      <Layout>
        <div className="px-4 pt-12 safe-top pb-24">
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <button
                onClick={() => setSelectedSession(null)}
                className="flex items-center gap-1 text-muted-foreground"
              >
                <ChevronLeft className="h-5 w-5" />
                <span className="text-sm">{t('back')}</span>
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <MoreVertical className="h-5 w-5 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={(e) => handleDeleteClick(e, selectedSession.id)}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Удалить тренировку
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <h1 className="text-2xl font-bold text-foreground">{t('workoutDetails')}</h1>
            <p className="text-muted-foreground">
              {formatSessionDate(selectedSession.completed_at)}
            </p>
            
            {/* Undo Banner in Detail View */}
            {canUndo(selectedSession) && (
              <Card className="mt-4 p-4 bg-primary/10 border-primary/30">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-foreground">
                      {locale === 'ru' ? 'Отменить завершение?' : 'Undo completion?'}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {locale === 'ru' ? 'Осталось' : 'Remaining'}: {formatUndoTime(getUndoTimeRemaining(selectedSession))}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    onClick={(e) => handleUndoWorkout(e, selectedSession.id)}
                    disabled={isUndoing}
                    className="bg-primary hover:bg-primary/90"
                  >
                    {isUndoing ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Undo2 className="h-4 w-4 mr-2" />
                    )}
                    {locale === 'ru' ? 'Отменить' : 'Undo'}
                  </Button>
                </div>
              </Card>
            )}
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

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Удалить тренировку?</AlertDialogTitle>
              <AlertDialogDescription>
                Будут удалены все упражнения и подходы этой тренировки. Действие нельзя отменить.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeleting}>Отмена</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteConfirm}
                disabled={isDeleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {isDeleting ? 'Удаление...' : 'Удалить'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
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
            {sessions.map((session, index) => (
              <Card
                key={session.id}
                className={`p-4 bg-card border-border hover:bg-secondary/50 transition-colors cursor-pointer ${
                  index === 0 && canUndo(session) ? 'border-primary/50' : ''
                }`}
                onClick={() => setSelectedSession(session)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
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
                  <div className="flex items-center gap-1">
                    {/* Show Undo button only for the first (most recent) session if undo is available */}
                    {index === 0 && canUndo(session) && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs border-primary/50 text-primary hover:bg-primary/10"
                        onClick={(e) => handleUndoWorkout(e, session.id)}
                        disabled={isUndoing}
                      >
                        {isUndoing ? (
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        ) : (
                          <Undo2 className="h-3 w-3 mr-1" />
                        )}
                        {locale === 'ru' ? 'Отменить' : 'Undo'}
                        <span className="ml-1 text-muted-foreground">
                          ({formatUndoTime(getUndoTimeRemaining(session))})
                        </span>
                      </Button>
                    )}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={(e) => handleDeleteClick(e, session.id)}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          {locale === 'ru' ? 'Удалить тренировку' : 'Delete workout'}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <ChevronRight className="h-5 w-5 text-muted-foreground" />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить тренировку?</AlertDialogTitle>
            <AlertDialogDescription>
              Будут удалены все упражнения и подходы этой тренировки. Действие нельзя отменить.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Удаление...' : 'Удалить'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
}
