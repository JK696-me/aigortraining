import { useState, useEffect } from 'react';
import { X, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Card } from '@/components/ui/card';
import { useLanguage } from '@/contexts/LanguageContext';
import { useExercises, Exercise, ExerciseInsert } from '@/hooks/useExercises';
import { useUserSettings } from '@/hooks/useUserSettings';
import { toast } from 'sonner';

interface ExerciseFormProps {
  exercise?: Exercise | null;
  onClose: () => void;
}

export function ExerciseForm({ exercise, onClose }: ExerciseFormProps) {
  const { t } = useLanguage();
  const { settings } = useUserSettings();
  const { createExercise, updateExercise, deleteExercise, isCreating, isUpdating, isDeleting } = useExercises();
  
  const [name, setName] = useState(exercise?.name || '');
  const [type, setType] = useState(exercise?.type || 1);
  const [incrementKind, setIncrementKind] = useState<'barbell' | 'dumbbells' | 'machine'>(
    exercise?.increment_kind || 'barbell'
  );
  const [incrementValue, setIncrementValue] = useState(
    exercise?.increment_value?.toString() || settings?.barbell_increment?.toString() || '5'
  );
  const [isDumbbellPair, setIsDumbbellPair] = useState(exercise?.is_dumbbell_pair ?? true);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Update increment value when increment kind changes (only for new exercises)
  useEffect(() => {
    if (!exercise && settings) {
      switch (incrementKind) {
        case 'barbell':
          setIncrementValue(settings.barbell_increment.toString());
          break;
        case 'dumbbells':
          setIncrementValue(settings.dumbbells_increment.toString());
          break;
        case 'machine':
          setIncrementValue(settings.machine_increment.toString());
          break;
      }
    }
  }, [incrementKind, settings, exercise]);

  const handleSubmit = () => {
    if (!name.trim()) {
      toast.error(t('fillAllFields'));
      return;
    }

    const data: ExerciseInsert = {
      name: name.trim(),
      type,
      increment_kind: incrementKind,
      increment_value: parseFloat(incrementValue) || 5,
      is_dumbbell_pair: isDumbbellPair,
    };

    if (exercise) {
      updateExercise(
        { id: exercise.id, updates: data },
        {
          onSuccess: () => {
            toast.success(t('exerciseSaved'));
            onClose();
          },
        }
      );
    } else {
      createExercise(data, {
        onSuccess: () => {
          toast.success(t('exerciseSaved'));
          onClose();
        },
      });
    }
  };

  const handleDelete = () => {
    if (!exercise) return;
    
    deleteExercise(exercise.id, {
      onSuccess: () => {
        toast.success(t('exerciseDeleted'));
        onClose();
      },
    });
  };

  const isLoading = isCreating || isUpdating || isDeleting;

  return (
    <div className="fixed inset-0 bg-background/95 z-50 overflow-y-auto">
      <div className="min-h-screen px-4 py-8 safe-top safe-bottom">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-foreground">
            {exercise ? t('editExercise') : t('addExerciseTitle')}
          </h2>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center"
          >
            <X className="h-5 w-5 text-foreground" />
          </button>
        </div>

        {/* Form */}
        <div className="space-y-4">
          {/* Name */}
          <div>
            <label className="text-sm font-medium text-muted-foreground mb-2 block">
              {t('exerciseName')}
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('exerciseName')}
              className="h-12 bg-secondary border-border"
            />
          </div>

          {/* Type */}
          <div>
            <label className="text-sm font-medium text-muted-foreground mb-2 block">
              {t('exerciseType')}
            </label>
            <div className="grid grid-cols-2 gap-2">
              {[1, 2, 3, 4].map((typeNum) => (
                <button
                  key={typeNum}
                  onClick={() => setType(typeNum)}
                  className={`p-3 rounded-lg text-sm font-medium transition-colors ${
                    type === typeNum
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-secondary text-muted-foreground'
                  }`}
                >
                  {t(`exerciseType${typeNum}` as any)}
                </button>
              ))}
            </div>
          </div>

          {/* Increment Kind */}
          <div>
            <label className="text-sm font-medium text-muted-foreground mb-2 block">
              {t('incrementKind')}
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(['barbell', 'dumbbells', 'machine'] as const).map((kind) => (
                <button
                  key={kind}
                  onClick={() => setIncrementKind(kind)}
                  className={`p-3 rounded-lg text-sm font-medium transition-colors ${
                    incrementKind === kind
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-secondary text-muted-foreground'
                  }`}
                >
                  {t(kind)}
                </button>
              ))}
            </div>
          </div>

          {/* Weight Step */}
          <div>
            <label className="text-sm font-medium text-muted-foreground mb-2 block">
              {t('weightStep')} ({t('kg')})
            </label>
            <Input
              type="number"
              value={incrementValue}
              onChange={(e) => setIncrementValue(e.target.value)}
              className="h-12 bg-secondary border-border"
              step="0.5"
              min="0.5"
            />
          </div>

          {/* Dumbbell Pair */}
          {incrementKind === 'dumbbells' && (
            <Card className="p-4 bg-card border-border">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-foreground">{t('isDumbbellPair')}</p>
                  <p className="text-sm text-muted-foreground">{t('isDumbbellPairHint')}</p>
                </div>
                <Switch
                  checked={isDumbbellPair}
                  onCheckedChange={setIsDumbbellPair}
                />
              </div>
            </Card>
          )}
        </div>

        {/* Actions */}
        <div className="mt-8 space-y-3">
          <Button
            onClick={handleSubmit}
            disabled={isLoading}
            className="w-full h-12"
          >
            {t('save')}
          </Button>

          {exercise && !showDeleteConfirm && (
            <Button
              variant="outline"
              onClick={() => setShowDeleteConfirm(true)}
              className="w-full h-12 text-destructive border-destructive/30"
            >
              <Trash2 className="h-5 w-5 mr-2" />
              {t('delete')}
            </Button>
          )}

          {showDeleteConfirm && (
            <Card className="p-4 bg-destructive/10 border-destructive/30">
              <p className="text-center text-foreground mb-3">{t('confirmDelete')}</p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1"
                >
                  {t('cancel')}
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleDelete}
                  disabled={isLoading}
                  className="flex-1"
                >
                  {t('delete')}
                </Button>
              </div>
            </Card>
          )}

          <Button
            variant="ghost"
            onClick={onClose}
            className="w-full h-12"
          >
            {t('cancel')}
          </Button>
        </div>
      </div>
    </div>
  );
}
