import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, Plus, Trash2, ChevronUp, ChevronDown, Dumbbell, Loader2 } from "lucide-react";
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
import { toast } from "sonner";

export default function TemplateEditor() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const templateId = searchParams.get('id');
  
  const { data: template, isLoading: isLoadingTemplate } = useTemplate(templateId);
  const { items, isLoading: isLoadingItems, addItem, updateItem, deleteItem, reorderItems, isAdding } = useTemplateItems(templateId);
  const { updateTemplate, deleteTemplate, isDeleting } = useTemplates();
  
  const [templateName, setTemplateName] = useState('');
  const [showPicker, setShowPicker] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

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
