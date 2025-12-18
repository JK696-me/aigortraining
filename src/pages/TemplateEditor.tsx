import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, Plus, Trash2, ChevronUp, ChevronDown, Dumbbell, Loader2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Layout } from "@/components/Layout";
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
import { useTemplate, useTemplateItems, useTemplates } from "@/hooks/useTemplates";
import { ExercisePicker } from "@/components/ExercisePicker";
import { Exercise } from "@/hooks/useExercises";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkout } from "@/contexts/WorkoutContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export default function TemplateEditor() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const templateId = searchParams.get('id');
  const { user } = useAuth();
  
  const { data: template, isLoading: isLoadingTemplate } = useTemplate(templateId);
  const { items, isLoading: isLoadingItems, addItem, updateItem, deleteItem, reorderItems, isAdding } = useTemplateItems(templateId);
  const { updateTemplate, deleteTemplate, isDeleting } = useTemplates();
  const { setActiveSession, hasActiveDraft, clearDraft, activeSessionId } = useWorkout();
  
  const [templateName, setTemplateName] = useState('');
  const [showPicker, setShowPicker] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isStarting, setIsStarting] = useState(false);

  useEffect(() => {
    if (template) {
      setTemplateName(template.name);
    }
  }, [template]);

  const handleSaveName = async () => {
    if (!templateId || !templateName.trim()) return;
    
    try {
      await updateTemplate.mutateAsync({ id: templateId, name: templateName.trim() });
      toast.success('Название сохранено');
    } catch (error) {
      console.error('Failed to update template name:', error);
      toast.error('Ошибка сохранения');
    }
  };

  const handleSelectExercise = async (exercise: Exercise) => {
    try {
      await addItem.mutateAsync({ exerciseId: exercise.id });
      setShowPicker(false);
      toast.success('Упражнение добавлено');
    } catch (error) {
      console.error('Failed to add exercise:', error);
      toast.error('Ошибка добавления');
    }
  };

  const handleUpdateTargetSets = async (itemId: string, targetSets: number) => {
    if (targetSets < 1 || targetSets > 10) return;
    
    try {
      await updateItem.mutateAsync({ id: itemId, targetSets });
    } catch (error) {
      console.error('Failed to update target sets:', error);
      toast.error('Ошибка сохранения');
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    try {
      await deleteItem.mutateAsync(itemId);
      toast.success('Упражнение удалено');
    } catch (error) {
      console.error('Failed to delete item:', error);
      toast.error('Ошибка удаления');
    }
  };

  const handleMoveItem = async (itemId: string, direction: 'up' | 'down') => {
    const currentIndex = items.findIndex(i => i.id === itemId);
    if (currentIndex === -1) return;
    
    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (newIndex < 0 || newIndex >= items.length) return;
    
    const newItems = [...items];
    [newItems[currentIndex], newItems[newIndex]] = [newItems[newIndex], newItems[currentIndex]];
    
    const newOrder = newItems.map((item, index) => ({
      id: item.id,
      sort_order: index + 1,
    }));
    
    try {
      await reorderItems.mutateAsync(newOrder);
    } catch (error) {
      console.error('Failed to reorder items:', error);
      toast.error('Ошибка сортировки');
    }
  };

  const handleDeleteTemplate = async () => {
    if (!templateId) return;
    
    try {
      await deleteTemplate.mutateAsync(templateId);
      toast.success('Шаблон удалён');
      navigate('/templates');
    } catch (error) {
      console.error('Failed to delete template:', error);
      toast.error('Ошибка удаления');
    }
  };

  const handleStartWorkout = async () => {
    if (!templateId || !user || items.length === 0) {
      toast.error('Добавьте упражнения в шаблон');
      return;
    }

    // If there's an active draft, warn user
    if (hasActiveDraft) {
      const confirmed = window.confirm(
        'У вас есть незавершённая тренировка. Создать новую?'
      );
      if (!confirmed) return;
      await clearDraft();
      if (activeSessionId) {
        await supabase.from('sessions').delete().eq('id', activeSessionId);
      }
    }

    setIsStarting(true);
    try {
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

      // Create session from template
      const { data: session, error: sessionError } = await supabase
        .from('sessions')
        .insert({
          user_id: user.id,
          date: new Date().toISOString(),
          source: 'template',
          template_id: templateId,
          status: 'draft',
        })
        .select()
        .single();

      if (sessionError) throw sessionError;

      // Create session exercises from template items
      for (const item of items) {
        // Get last completed session's sets for this exercise
        const { data: lastSessionExercise } = await supabase
          .from('session_exercises')
          .select(`
            id,
            session:sessions!inner(status)
          `)
          .eq('exercise_id', item.exercise_id)
          .eq('sessions.status', 'completed')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        let lastWeight = 0;
        let lastReps = item.exercise?.type && item.exercise.type <= 2 ? 6 : 10;

        if (lastSessionExercise) {
          const { data: lastSets } = await supabase
            .from('sets')
            .select('weight, reps')
            .eq('session_exercise_id', lastSessionExercise.id)
            .order('set_index')
            .limit(1);

          if (lastSets && lastSets.length > 0) {
            lastWeight = lastSets[0].weight;
            lastReps = lastSets[0].reps;
          }
        }

        // Create session exercise
        const { data: newSe, error: seError } = await supabase
          .from('session_exercises')
          .insert({
            session_id: session.id,
            exercise_id: item.exercise_id,
          })
          .select()
          .single();

        if (seError) throw seError;

        // Create sets based on target_sets
        const sets = Array.from({ length: item.target_sets }, (_, i) => ({
          session_exercise_id: newSe.id,
          set_index: i + 1,
          weight: lastWeight,
          reps: lastReps,
        }));

        await supabase.from('sets').insert(sets);
      }

      // Update workout context with new session
      await setActiveSession(session.id);

      toast.success('Тренировка создана');
      navigate(`/workout?session=${session.id}`);
    } catch (error) {
      console.error('Failed to start workout:', error);
      toast.error('Ошибка создания тренировки');
    } finally {
      setIsStarting(false);
    }
  };

  if (!templateId) {
    return (
      <Layout>
        <div className="px-4 pt-12 safe-top flex flex-col items-center justify-center min-h-[60vh]">
          <h2 className="text-xl font-semibold text-foreground mb-2">Шаблон не найден</h2>
          <Button onClick={() => navigate('/templates')}>
            <ChevronLeft className="h-5 w-5 mr-2" />
            К шаблонам
          </Button>
        </div>
      </Layout>
    );
  }

  if (isLoadingTemplate) {
    return (
      <Layout>
        <div className="px-4 pt-12 safe-top flex items-center justify-center min-h-[60vh]">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
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
            onClick={() => navigate('/templates')}
            className="flex items-center gap-1 text-muted-foreground mb-3"
          >
            <ChevronLeft className="h-5 w-5" />
            <span className="text-sm">К шаблонам</span>
          </button>
          <h1 className="text-2xl font-bold text-foreground">Редактировать шаблон</h1>
        </div>

        {/* Template Name */}
        <Card className="p-4 bg-card border-border mb-6">
          <label className="text-sm text-muted-foreground mb-2 block">Название шаблона</label>
          <Input
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            onBlur={handleSaveName}
            placeholder="Название шаблона"
            className="bg-secondary border-border"
          />
        </Card>

        {/* Exercises List */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-foreground">Упражнения</h2>
            <span className="text-sm text-muted-foreground">{items.length} шт.</span>
          </div>

          {isLoadingItems ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : items.length === 0 ? (
            <Card className="p-6 bg-card border-border text-center mb-4">
              <Dumbbell className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                Добавьте упражнения в шаблон
              </p>
            </Card>
          ) : (
            <div className="space-y-3 mb-4">
              {items.map((item, index) => (
                <Card key={item.id} className="p-4 bg-card border-border">
                  <div className="flex items-center gap-3">
                    {/* Reorder buttons */}
                    <div className="flex flex-col gap-1">
                      <button
                        onClick={() => handleMoveItem(item.id, 'up')}
                        disabled={index === 0}
                        className="p-1 rounded hover:bg-secondary disabled:opacity-30"
                      >
                        <ChevronUp className="h-4 w-4 text-muted-foreground" />
                      </button>
                      <button
                        onClick={() => handleMoveItem(item.id, 'down')}
                        disabled={index === items.length - 1}
                        className="p-1 rounded hover:bg-secondary disabled:opacity-30"
                      >
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      </button>
                    </div>

                    {/* Exercise info */}
                    <div className="flex-1">
                      <h3 className="font-medium text-foreground">{item.exercise?.name}</h3>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-sm text-muted-foreground">Подходов:</span>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleUpdateTargetSets(item.id, item.target_sets - 1)}
                            disabled={item.target_sets <= 1}
                            className="w-8 h-8 rounded bg-secondary flex items-center justify-center hover:bg-secondary/80 disabled:opacity-30"
                          >
                            -
                          </button>
                          <span className="w-8 text-center font-mono font-semibold">{item.target_sets}</span>
                          <button
                            onClick={() => handleUpdateTargetSets(item.id, item.target_sets + 1)}
                            disabled={item.target_sets >= 10}
                            className="w-8 h-8 rounded bg-secondary flex items-center justify-center hover:bg-secondary/80 disabled:opacity-30"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Delete button */}
                    <button
                      onClick={() => handleDeleteItem(item.id)}
                      className="p-2 rounded hover:bg-destructive/10 text-destructive"
                    >
                      <Trash2 className="h-5 w-5" />
                    </button>
                  </div>
                </Card>
              ))}
            </div>
          )}

          <Button
            onClick={() => setShowPicker(true)}
            variant="secondary"
            className="w-full"
            disabled={isAdding}
          >
            {isAdding ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Plus className="h-4 w-4 mr-2" />
            )}
            Добавить упражнение
          </Button>
        </div>

        {/* Start Workout Button */}
        <Button
          onClick={handleStartWorkout}
          disabled={isStarting || items.length === 0}
          className="w-full h-14 text-lg font-semibold bg-primary hover:bg-primary/90 text-primary-foreground mb-6"
          size="lg"
        >
          {isStarting ? (
            <Loader2 className="h-5 w-5 mr-2 animate-spin" />
          ) : (
            <Play className="h-5 w-5 mr-2" />
          )}
          Начать тренировку
        </Button>

        {/* Danger Zone */}
        <Card className="p-4 bg-card border-destructive/30">
          <h3 className="text-sm font-medium text-destructive mb-3">Опасная зона</h3>
          <Button
            variant="destructive"
            onClick={() => setDeleteDialogOpen(true)}
            className="w-full"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Удалить шаблон
          </Button>
        </Card>
      </div>

      {/* Exercise Picker */}
      {showPicker && (
        <ExercisePicker
          onSelect={handleSelectExercise}
          onClose={() => setShowPicker(false)}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить шаблон?</AlertDialogTitle>
            <AlertDialogDescription>
              Это не удалит упражнения из справочника. Удаление нельзя отменить.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteTemplate}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Удалить'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
}
