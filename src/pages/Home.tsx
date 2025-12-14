import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, RotateCcw, Plus, ChevronRight, Zap, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Layout } from "@/components/Layout";
import { useLanguage } from "@/contexts/LanguageContext";
import { useSessions } from "@/hooks/useSessions";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

const mockTemplates = [
  { id: 1, name: "Push Day", exercises: 5, daysAgo: 2 },
  { id: 2, name: "Pull Day", exercises: 6, daysAgo: 4 },
  { id: 3, name: "Leg Day", exercises: 5, daysAgo: 7 },
];

export default function Home() {
  const navigate = useNavigate();
  const { t, formatDate } = useLanguage();
  const { user } = useAuth();
  const { sessions, createSession, isCreating } = useSessions();
  const [isRepeating, setIsRepeating] = useState(false);

  const handleStartWorkout = async () => {
    try {
      const session = await createSession('empty');
      navigate(`/workout?session=${session.id}`);
    } catch (error) {
      console.error('Failed to create session:', error);
    }
  };

  const handleRepeatLastWorkout = async () => {
    if (!user || sessions.length === 0) {
      toast.error(t('noLastWorkout'));
      return;
    }

    setIsRepeating(true);
    try {
      const lastSession = sessions[0];
      
      // Create new session
      const { data: newSession, error: sessionError } = await supabase
        .from('sessions')
        .insert({
          user_id: user.id,
          date: new Date().toISOString(),
          source: 'repeat',
        })
        .select()
        .single();

      if (sessionError) throw sessionError;

      // Get exercises from last session with their sets
      const { data: lastExercises, error: exError } = await supabase
        .from('session_exercises')
        .select('*, exercise:exercises(*)')
        .eq('session_id', lastSession.id);

      if (exError) throw exError;

      // Copy each exercise and its sets
      for (const se of lastExercises || []) {
        // Create session_exercise
        const { data: newSe, error: newSeError } = await supabase
          .from('session_exercises')
          .insert({
            session_id: newSession.id,
            exercise_id: se.exercise_id,
          })
          .select()
          .single();

        if (newSeError) continue;

        // Get and copy sets
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
            disabled={isRepeating || sessions.length === 0}
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
            <Button variant="ghost" size="sm" className="text-primary">
              <Plus className="h-4 w-4 mr-1" />
              {t('create')}
            </Button>
          </div>

          <div className="space-y-3">
            {mockTemplates.map((template) => (
              <Card
                key={template.id}
                className="p-4 bg-card border-border hover:bg-secondary/50 transition-colors cursor-pointer active:scale-[0.98]"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-foreground">{template.name}</h3>
                    <p className="text-sm text-muted-foreground">
                      {template.exercises} {t('exercises')} • {formatDate(template.daysAgo)}
                    </p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </div>
              </Card>
            ))}
          </div>
        </section>
      </div>
    </Layout>
  );
}
