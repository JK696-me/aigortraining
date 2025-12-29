import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, RotateCcw, Plus, ChevronRight, Zap, Loader2, FileText, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Layout } from "@/components/Layout";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTemplates } from "@/hooks/useTemplates";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { useWorkout } from "@/contexts/WorkoutContext";
import { seedExercisesForUser } from "@/lib/seedExercises";
import { useQueryClient } from "@tanstack/react-query";

export default function Home() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t, locale } = useLanguage();
  const { user } = useAuth();
  const { templates, isLoading: isLoadingTemplates } = useTemplates();
  const [isRepeating, setIsRepeating] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const seedAttemptedRef = useRef(false);
  
  const { 
    draft, 
    hasActiveDraft, 
    activeSessionId,
    isLoading: isDraftLoading, 
    clearDraft, 
    startNewWorkout,
    setActiveSession,
    refreshActiveSession 
  } = useWorkout();

  // Seed exercises for new users
  useEffect(() => {
    if (!user?.id || seedAttemptedRef.current) return;
    
    seedAttemptedRef.current = true;
    
    seedExercisesForUser(user.id).then(({ seeded }) => {
      if (seeded) {
        // Invalidate exercises query to refresh the list
        queryClient.invalidateQueries({ queryKey: ['exercises'] });
        toast.success(
          locale === 'ru' 
            ? 'Мы добавили базовые упражнения — можно сразу начинать тренировку.' 
            : 'We added basic exercises — you can start training right away.'
        );
      }
    });
  }, [user?.id, queryClient, locale]);

  // Refresh active session on focus
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

    // Also refresh on mount
    refreshActiveSession();

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [refreshActiveSession]);

  const handleContinueWorkout = () => {
    // Simply navigate to workout tab - it will show active session from context
    navigate('/workout');
  };

  const handleStartWorkout = async () => {
    // If there's an active draft, just navigate to workout tab
    if (hasActiveDraft && activeSessionId) {
      navigate('/workout');
      return;
    }

    setIsStarting(true);
    try {
      const newDraft = await startNewWorkout('empty');
      if (newDraft?.session_id) {
        navigate('/workout');
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

    // If there's an active draft, warn user
    if (hasActiveDraft) {
      const confirmed = window.confirm(
        locale === 'ru' 
          ? 'У вас есть незавершённая тренировка. Создать новую?' 
          : 'You have an unfinished workout. Create a new one?'
      );
      if (!confirmed) return;
      
      // Delete existing draft session from server
      if (activeSessionId) {
        await supabase.from('sessions').delete().eq('id', activeSessionId);
      }
      await clearDraft();
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
        // Delete orphaned draft
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

      // Update the workout context with the new session
      await setActiveSession(newSession.id);

      navigate('/workout');
    } catch (error) {
      console.error('Failed to repeat workout:', error);
      toast.error('Failed to repeat workout');
    } finally {
      setIsRepeating(false);
    }
  };

  return (
    <Layout>
      <div className="px-4 pt-12 safe-top">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold text-foreground">AIgor</h1>
          </div>
          <p className="text-muted-foreground">{t('readyToTrain')}</p>
        </div>

        {/* Continue Active Workout Button */}
        {hasActiveDraft && activeSessionId && (
          <Card className="p-4 mb-6 bg-primary/10 border-primary/30">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-foreground">
                  {locale === 'ru' ? 'Активная тренировка' : 'Active Workout'}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {locale === 'ru' 
                    ? `${draft?.exercises.length || 0} упражнений` 
                    : `${draft?.exercises.length || 0} exercises`}
                </p>
              </div>
              <Button onClick={handleContinueWorkout} className="bg-primary hover:bg-primary/90">
                {locale === 'ru' ? 'Продолжить' : 'Continue'}
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </Card>
        )}

        {/* Main Actions */}
        <div className="space-y-3 mb-8">
          <Button
            onClick={handleStartWorkout}
            disabled={isStarting}
            className="w-full h-16 text-lg font-semibold bg-primary hover:bg-primary/90 text-primary-foreground animate-pulse-glow"
            size="lg"
          >
            {isStarting ? (
              <Loader2 className="h-6 w-6 mr-3 animate-spin" />
            ) : (
              <Play className="h-6 w-6 mr-3" />
            )}
            {hasActiveDraft 
              ? (locale === 'ru' ? 'Продолжить тренировку' : 'Continue Workout')
              : t('startWorkout')}
          </Button>

          <Button
            onClick={handleRepeatLastWorkout}
            disabled={isRepeating}
            variant="secondary"
            className="w-full h-14 text-base font-medium"
            size="lg"
          >
            {isRepeating ? (
              <Loader2 className="h-5 w-5 mr-3 animate-spin" />
            ) : (
              <RotateCcw className="h-5 w-5 mr-3" />
            )}
            {t('repeatLastWorkout')}
          </Button>
        </div>

        {/* Templates Section */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-foreground">{t('templates')}</h2>
            <Button 
              variant="ghost" 
              size="sm" 
              className="text-primary"
              onClick={() => navigate('/templates')}
            >
              <Plus className="h-4 w-4 mr-1" />
              {t('create')}
            </Button>
          </div>

          {isLoadingTemplates ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : templates.length === 0 ? (
            <Card className="p-6 bg-card border-border text-center">
              <FileText className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground mb-3">
                {locale === 'ru' ? 'Нет шаблонов' : 'No templates'}
              </p>
              <Button 
                variant="secondary" 
                size="sm"
                onClick={() => navigate('/templates')}
              >
                {locale === 'ru' ? 'Создать шаблон' : 'Create template'}
              </Button>
            </Card>
          ) : (
            <div className="space-y-3">
              {templates.slice(0, 5).map((template) => (
                <Card
                  key={template.id}
                  className="p-4 bg-card border-border hover:bg-secondary/50 transition-colors cursor-pointer active:scale-[0.98]"
                  onClick={() => navigate(`/template-editor?id=${template.id}`)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-muted-foreground">
                        <FileText className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-foreground">{template.name}</h3>
                        <p className="text-sm text-muted-foreground">
                          {new Date(template.created_at).toLocaleDateString('ru-RU')}
                        </p>
                      </div>
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground" />
                  </div>
                </Card>
              ))}
              {templates.length > 5 && (
                <Button
                  variant="ghost"
                  className="w-full text-muted-foreground"
                  onClick={() => navigate('/templates')}
                >
                  {locale === 'ru' ? 'Все шаблоны' : 'All templates'} ({templates.length})
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              )}
            </div>
          )}
        </section>
      </div>
    </Layout>
  );
}