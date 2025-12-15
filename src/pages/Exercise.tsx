import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Minus, ChevronLeft, History, Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Layout } from "@/components/Layout";
import { useLanguage } from "@/contexts/LanguageContext";
import { useSets } from "@/hooks/useSessions";
import { supabase } from "@/integrations/supabase/client";

const rpeDisplayScale = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

interface SessionExerciseData {
  id: string;
  session_id: string;
  exercise_id: string;
  rpe: number | null;
  exercise: {
    id: string;
    name: string;
    type: number;
    increment_kind: string;
    increment_value: number;
  };
}

export default function Exercise() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sessionExerciseId = searchParams.get('se');
  const { t } = useLanguage();
  
  const [sessionExercise, setSessionExercise] = useState<SessionExerciseData | null>(null);
  const [selectedSetIndex, setSelectedSetIndex] = useState(0);
  const [currentRpe, setCurrentRpe] = useState<number | null>(null);
  
  // Local state for inputs
  const [weightValue, setWeightValue] = useState('');
  const [repsValue, setRepsValue] = useState('');
  
  const repsInputRef = useRef<HTMLInputElement>(null);
  const weightInputRef = useRef<HTMLInputElement>(null);
  
  const { sets, updateSet, addSet, isLoading } = useSets(sessionExerciseId);

  // Load session exercise data
  useEffect(() => {
    if (!sessionExerciseId) return;
    
    const loadData = async () => {
      const { data } = await supabase
        .from('session_exercises')
        .select(`
          *,
          exercise:exercises(id, name, type, increment_kind, increment_value)
        `)
        .eq('id', sessionExerciseId)
        .single();
      
      if (data) {
        setSessionExercise(data as SessionExerciseData);
        setCurrentRpe(data.rpe);
      }
    };
    
    loadData();
  }, [sessionExerciseId]);

  // Update local values when set changes
  const currentSet = sets[selectedSetIndex];
  
  useEffect(() => {
    if (currentSet) {
      setWeightValue(currentSet.weight.toString());
      setRepsValue(currentSet.reps.toString());
    }
  }, [currentSet?.id, currentSet?.weight, currentSet?.reps]);

  // Auto-focus on reps when set changes
  useEffect(() => {
    if (currentSet && repsInputRef.current) {
      setTimeout(() => {
        repsInputRef.current?.focus();
        repsInputRef.current?.select();
      }, 100);
    }
  }, [currentSet?.id]);

  const incrementValue = sessionExercise?.exercise?.increment_value || 2.5;

  // Save weight
  const saveWeight = useCallback((value: string) => {
    if (!currentSet) return;
    const numValue = parseFloat(value);
    if (isNaN(numValue) || numValue < 0) {
      setWeightValue(currentSet.weight.toString());
      return;
    }
    // Round to nearest 0.5
    const roundedValue = Math.round(numValue * 2) / 2;
    setWeightValue(roundedValue.toString());
    updateSet({ setId: currentSet.id, updates: { weight: roundedValue } });
  }, [currentSet, updateSet]);

  // Save reps and move to next set
  const saveReps = useCallback((value: string, moveToNext: boolean = false) => {
    if (!currentSet) return;
    const numValue = parseInt(value, 10);
    if (isNaN(numValue) || numValue < 0) {
      setRepsValue(currentSet.reps.toString());
      return;
    }
    setRepsValue(numValue.toString());
    updateSet({ setId: currentSet.id, updates: { reps: numValue } });
    
    // Move to next set if available
    if (moveToNext && selectedSetIndex < sets.length - 1) {
      setSelectedSetIndex(selectedSetIndex + 1);
    }
  }, [currentSet, updateSet, selectedSetIndex, sets.length]);

  const handleWeightChange = (delta: number) => {
    const currentValue = parseFloat(weightValue) || 0;
    const newValue = Math.max(0, currentValue + delta);
    const roundedValue = Math.round(newValue * 2) / 2;
    setWeightValue(roundedValue.toString());
    if (currentSet) {
      updateSet({ setId: currentSet.id, updates: { weight: roundedValue } });
    }
  };

  const handleRepsChange = (delta: number) => {
    const currentValue = parseInt(repsValue, 10) || 0;
    const newValue = Math.max(0, currentValue + delta);
    setRepsValue(newValue.toString());
    if (currentSet) {
      updateSet({ setId: currentSet.id, updates: { reps: newValue } });
    }
  };

  const handleWeightKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      saveWeight(weightValue);
      repsInputRef.current?.focus();
    }
  };

  const handleRepsKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      saveReps(repsValue, true);
    }
  };

  const handleAddSet = () => {
    const lastSet = sets[sets.length - 1];
    addSet({
      weight: lastSet?.weight || 0,
      reps: lastSet?.reps || 8,
    });
    // Switch to new set after a short delay
    setTimeout(() => {
      setSelectedSetIndex(sets.length);
    }, 100);
  };

  const handleRpeChange = async (rpe: number) => {
    setCurrentRpe(rpe);
    if (!sessionExerciseId) return;
    
    await supabase
      .from('session_exercises')
      .update({ rpe })
      .eq('id', sessionExerciseId);
  };

  const handleQuickAddRep = () => {
    handleRepsChange(1);
  };

  const handleQuickAddWeight = () => {
    handleWeightChange(incrementValue);
  };

  const handleSetSelect = (index: number) => {
    // Save current values before switching
    if (currentSet) {
      saveWeight(weightValue);
      saveReps(repsValue, false);
    }
    setSelectedSetIndex(index);
  };

  if (!sessionExerciseId || !sessionExercise) {
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
            onClick={() => navigate(`/workout?session=${sessionExercise.session_id}`)}
            className="flex items-center gap-1 text-muted-foreground mb-3"
          >
            <ChevronLeft className="h-5 w-5" />
            <span className="text-sm">{t('backToWorkout')}</span>
          </button>
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-foreground">{sessionExercise.exercise.name}</h1>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate(`/single-exercise-history?exercise=${sessionExercise.exercise.id}&se=${sessionExerciseId}`)}
            >
              <History className="h-5 w-5 text-muted-foreground" />
            </Button>
          </div>
          <p className="text-muted-foreground">
            {t('setOf')} {selectedSetIndex + 1} {t('of')} {sets.length}
          </p>
        </div>

        {/* Set Tabs */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
          {sets.map((set, index) => (
            <button
              key={set.id}
              onClick={() => handleSetSelect(index)}
              className={`flex-shrink-0 px-4 py-2 rounded-lg font-medium transition-colors ${
                index === selectedSetIndex
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-muted-foreground'
              }`}
            >
              {index + 1}
            </button>
          ))}
          <button
            onClick={handleAddSet}
            className="flex-shrink-0 px-4 py-2 rounded-lg bg-secondary text-muted-foreground hover:text-foreground"
          >
            <Plus className="h-5 w-5" />
          </button>
        </div>

        {/* Current Set Input */}
        {currentSet && (
          <Card className="p-6 bg-card border-border mb-6">
            <div className="grid grid-cols-2 gap-6 mb-6">
              {/* Weight */}
              <div className="text-center">
                <p className="text-sm text-muted-foreground mb-2">{t('weightKg')}</p>
                <div className="flex items-center justify-center gap-2">
                  <Button
                    variant="secondary"
                    size="icon"
                    className="h-12 w-12 rounded-full flex-shrink-0"
                    onClick={() => handleWeightChange(-incrementValue)}
                  >
                    <Minus className="h-5 w-5" />
                  </Button>
                  <Input
                    ref={weightInputRef}
                    type="text"
                    inputMode="decimal"
                    value={weightValue}
                    onChange={(e) => setWeightValue(e.target.value)}
                    onBlur={() => saveWeight(weightValue)}
                    onKeyDown={handleWeightKeyDown}
                    className="w-20 h-14 text-center text-2xl font-bold font-mono bg-secondary border-border"
                  />
                  <Button
                    variant="secondary"
                    size="icon"
                    className="h-12 w-12 rounded-full flex-shrink-0"
                    onClick={() => handleWeightChange(incrementValue)}
                  >
                    <Plus className="h-5 w-5" />
                  </Button>
                </div>
              </div>

              {/* Reps */}
              <div className="text-center">
                <p className="text-sm text-muted-foreground mb-2">{t('reps')}</p>
                <div className="flex items-center justify-center gap-2">
                  <Button
                    variant="secondary"
                    size="icon"
                    className="h-12 w-12 rounded-full flex-shrink-0"
                    onClick={() => handleRepsChange(-1)}
                  >
                    <Minus className="h-5 w-5" />
                  </Button>
                  <Input
                    ref={repsInputRef}
                    type="text"
                    inputMode="numeric"
                    value={repsValue}
                    onChange={(e) => setRepsValue(e.target.value)}
                    onBlur={() => saveReps(repsValue, false)}
                    onKeyDown={handleRepsKeyDown}
                    className="w-20 h-14 text-center text-2xl font-bold font-mono bg-secondary border-border"
                  />
                  <Button
                    variant="secondary"
                    size="icon"
                    className="h-12 w-12 rounded-full flex-shrink-0"
                    onClick={() => handleRepsChange(1)}
                  >
                    <Plus className="h-5 w-5" />
                  </Button>
                </div>
              </div>
            </div>

            {/* RPE Selector */}
            <div>
              <p className="text-sm text-muted-foreground mb-3 text-center">{t('rpeLabel')}</p>
              <div className="flex justify-between gap-1">
                {rpeDisplayScale.map((rpe) => (
                  <button
                    key={rpe}
                    onClick={() => handleRpeChange(rpe)}
                    className={`flex-1 h-10 rounded-lg font-mono font-bold text-sm transition-colors ${
                      currentRpe === rpe
                        ? "bg-primary text-primary-foreground"
                        : rpe >= 9
                        ? "bg-destructive/20 text-destructive hover:bg-destructive/30"
                        : rpe >= 7
                        ? "bg-accent/20 text-accent hover:bg-accent/30"
                        : "bg-secondary text-muted-foreground hover:bg-secondary/80"
                    }`}
                  >
                    {rpe}
                  </button>
                ))}
              </div>
            </div>
          </Card>
        )}

        {/* Quick Actions */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <Button 
            variant="secondary" 
            className="h-14 text-base font-medium"
            onClick={handleQuickAddRep}
          >
            <Plus className="h-4 w-4 mr-2" />
            {t('addRep')}
          </Button>
          <Button 
            variant="secondary" 
            className="h-14 text-base font-medium"
            onClick={handleQuickAddWeight}
          >
            <Plus className="h-4 w-4 mr-2" />
            +{incrementValue} {t('kg')}
          </Button>
        </div>

        {/* Add Set Button */}
        <Button
          onClick={handleAddSet}
          variant="secondary"
          className="w-full h-14 text-base font-medium mb-6"
          size="lg"
        >
          <Plus className="h-5 w-5 mr-2" />
          {t('addSet')}
        </Button>

        {/* All Sets Summary */}
        <div className="mb-6">
          <h3 className="text-sm font-medium text-muted-foreground mb-3">{t('previousSets')}</h3>
          <div className="space-y-2">
            {sets.map((set, index) => (
              <button
                key={set.id}
                onClick={() => handleSetSelect(index)}
                className={`w-full flex items-center justify-between py-2 px-3 rounded-lg transition-colors ${
                  index === selectedSetIndex ? 'bg-primary/20' : 'bg-secondary/50'
                }`}
              >
                <span className="text-sm text-muted-foreground">{t('set')} {set.set_index}</span>
                <span className="font-mono font-medium text-foreground">
                  {set.weight}{t('kg')} × {set.reps}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Recommendation Card */}
        <Card className="p-4 bg-primary/10 border-primary/20">
          <div className="flex items-start gap-3">
            <Lightbulb className="h-5 w-5 text-primary mt-0.5" />
            <div>
              <h4 className="font-semibold text-foreground mb-1">{t('nextTimeRecommendation')}</h4>
              <p className="text-sm text-muted-foreground">
                {t('comingSoon')}
              </p>
            </div>
          </div>
        </Card>
      </div>
    </Layout>
  );
}
