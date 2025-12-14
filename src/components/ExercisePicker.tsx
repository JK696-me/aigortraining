import { useState } from 'react';
import { Search, X, Dumbbell } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { useLanguage } from '@/contexts/LanguageContext';
import { useExercises, Exercise } from '@/hooks/useExercises';

interface ExercisePickerProps {
  onSelect: (exercise: Exercise) => void;
  onClose: () => void;
}

export function ExercisePicker({ onSelect, onClose }: ExercisePickerProps) {
  const { t } = useLanguage();
  const [searchQuery, setSearchQuery] = useState('');
  const { exercises, isLoading } = useExercises(searchQuery);

  const getIncrementKindLabel = (kind: string) => {
    switch (kind) {
      case 'barbell': return t('barbell');
      case 'dumbbells': return t('dumbbells');
      case 'machine': return t('machine');
      default: return kind;
    }
  };

  return (
    <div className="fixed inset-0 bg-background/95 z-50 overflow-y-auto">
      <div className="min-h-screen px-4 py-8 safe-top safe-bottom">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-foreground">{t('addExercise')}</h2>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center"
          >
            <X className="h-5 w-5 text-foreground" />
          </button>
        </div>

        {/* Search */}
        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            type="text"
            placeholder={t('searchExercises')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 h-12 bg-secondary border-border"
            autoFocus
          />
        </div>

        {/* Exercise List */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : exercises.length === 0 ? (
          <Card className="p-8 bg-card border-border text-center">
            <Dumbbell className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="font-semibold text-foreground mb-2">{t('noExercises')}</h3>
            <p className="text-sm text-muted-foreground">{t('addFirstExercise')}</p>
          </Card>
        ) : (
          <div className="space-y-2">
            {exercises.map((exercise) => (
              <button
                key={exercise.id}
                onClick={() => onSelect(exercise)}
                className="w-full text-left"
              >
                <Card className="p-4 bg-card border-border hover:bg-secondary/50 transition-colors">
                  <h3 className="font-semibold text-foreground">{exercise.name}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-primary/20 text-primary">
                      {getIncrementKindLabel(exercise.increment_kind)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      +{exercise.increment_value} {t('kg')}
                    </span>
                  </div>
                </Card>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
