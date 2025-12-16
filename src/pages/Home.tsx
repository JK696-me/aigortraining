import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, RotateCcw, Plus, ChevronRight, Zap, Loader2, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Layout } from "@/components/Layout";
import { useLanguage } from "@/contexts/LanguageContext";
import { useSessions } from "@/hooks/useSessions";
import { useTemplates } from "@/hooks/useTemplates";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { DraftRecoveryModal } from "@/components/DraftRecoveryModal";
import { useDraftWorkout } from "@/hooks/useDraftWorkout";
import { DraftWorkout, deleteDraft } from "@/lib/draftStorage";

export default function Home() {
  const navigate = useNavigate();
  const { t, formatDate } = useLanguage();
  const { user } = useAuth();
  const { createSession, isCreating } = useSessions();
  const { templates, isLoading: isLoadingTemplates } = useTemplates();
  const [isRepeating, setIsRepeating] = useState(false);
  const [recoveryDraft, setRecoveryDraft] = useState<DraftWorkout | null>(null);
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);

  const handleRecoveryNeeded = useCallback((draft: DraftWorkout) => {
    setRecoveryDraft(draft);
    setShowRecoveryModal(true);
  }, []);

  const { startNewWorkout, clearDraft, syncDraftToSupabase, continueDraft } = useDraftWorkout({
    userId: user?.id,
    onRecoveryNeeded: handleRecoveryNeeded,
  });

  const handleContinueDraft = async () => {
    if (!recoveryDraft) return;
    
    setShowRecoveryModal(false);
    
    if (recoveryDraft.session_id) {
      navigate(`/workout?session=${recoveryDraft.session_id}`);
    } else {
      continueDraft(recoveryDraft);
      const synced = await syncDraftToSupabase();
      if (synced && recoveryDraft.session_id) {
        navigate(`/workout?session=${recoveryDraft.session_id}`);
      }
    }
  };

  const handleDiscardDraft = async () => {
    if (!recoveryDraft || !user) return;
    
    if (recoveryDraft.session_id) {
      await supabase.from('sessions').delete().eq('id', recoveryDraft.session_id);
    }
    
    await deleteDraft(user.id);
    setShowRecoveryModal(false);
    setRecoveryDraft(null);
  };

  const handleStartWorkout = async () => {
    try {
      const session = await createSession('empty');
      navigate(`/workout?session=${session.id}`);
    } catch (error) {
      console.error('Failed to create session:', error);
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

      const { data: newSession, error: sessionError } = await supabase
        .from('sessions')
        .insert({
          user_id: user.id,
          date: new Date().toISOString(),
          source: 'repeat',
          status: 'draft',
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

      navigate(`/workout?session=${newSession.id}`);
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

        {/* Main Actions */}
        <div className="space-y-3 mb-8">
          <Button
            onClick={handleStartWorkout}
            disabled={isCreating}
            className="w-full h-16 text-lg font-semibold bg-primary hover:bg-primary/90 text-primary-foreground animate-pulse-glow"
            size="lg"
          >
            {isCreating ? (
              <Loader2 className="h-6 w-6 mr-3 animate-spin" />
            ) : (
              <Play className="h-6 w-6 mr-3" />
            )}
            {t('startWorkout')}
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
                Нет шаблонов
              </p>
              <Button 
                variant="secondary" 
                size="sm"
                onClick={() => navigate('/templates')}
              >
                Создать шаблон
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
                  Все шаблоны ({templates.length})
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              )}
            </div>
          )}
        </section>
      </div>

      {/* Draft Recovery Modal */}
      <DraftRecoveryModal
        draft={recoveryDraft}
        isOpen={showRecoveryModal}
        onContinue={handleContinueDraft}
        onDiscard={handleDiscardDraft}
      />
    </Layout>
  );
}
