import { useState } from 'react';
import { ArrowLeft, Plus, Search, Dumbbell, Edit2, TrendingUp } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useLanguage } from '@/contexts/LanguageContext';
import { useExercises, Exercise } from '@/hooks/useExercises';
import { ExerciseForm } from '@/components/ExerciseForm';

export default function ExercisesList() {
  const navigate = useNavigate();
  const { t, locale } = useLanguage();
  const [searchQuery, setSearchQuery] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingExercise, setEditingExercise] = useState<Exercise | null>(null);
  
  const { exercises, isLoading } = useExercises(searchQuery);

  const handleEdit = (exercise: Exercise) => {
    setEditingExercise(exercise);
    setShowForm(true);
  };

  const handleViewProgress = (exerciseId: string) => {
    navigate(`/exercise-progress?exercise=${exerciseId}&from=exercises`);
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingExercise(null);
  };

  const getIncrementKindLabel = (kind: string) => {
    switch (kind) {
      case 'barbell': return t('barbell');
      case 'dumbbells': return t('dumbbells');
      case 'machine': return t('machine');
      default: return kind;
    }
  };

  return (
    <div className="min-h-screen bg-background pb-24 safe-top safe-bottom">
      <div className="px-4 pt-12">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <button 
            onClick={() => navigate('/settings')}
            className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center"
          >
            <ArrowLeft className="h-5 w-5 text-foreground" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">{t('exercisesList')}</h1>
            <p className="text-sm text-muted-foreground">{t('manageExercises')}</p>
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            type="text"
            placeholder={t('searchExercises')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 h-12 bg-secondary border-border"
          />
        </div>

        {/* Add Button */}
        <Button
          onClick={() => setShowForm(true)}
          className="w-full h-12 mb-6"
        >
          <Plus className="h-5 w-5 mr-2" />
          {t('addExerciseTitle')}
        </Button>

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
          <div className="space-y-3">
            {exercises.map((exercise) => (
              <Card 
                key={exercise.id} 
                className="p-4 bg-card border-border"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <h3 className="font-semibold text-foreground">{exercise.name}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-primary/20 text-primary">
                        {getIncrementKindLabel(exercise.increment_kind)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        +{exercise.increment_value} {t('kg')}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleViewProgress(exercise.id)}
                      className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center"
                      title={locale === 'ru' ? 'Прогресс' : 'Progress'}
                    >
                      <TrendingUp className="h-4 w-4 text-primary" />
                    </button>
                    <button
                      onClick={() => handleEdit(exercise)}
                      className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center"
                    >
                      <Edit2 className="h-4 w-4 text-muted-foreground" />
                    </button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Exercise Form Modal */}
      {showForm && (
        <ExerciseForm
          exercise={editingExercise}
          onClose={handleCloseForm}
        />
      )}
    </div>
  );
}
