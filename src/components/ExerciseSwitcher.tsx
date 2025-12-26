import { ChevronLeft, ChevronRight, Check, Circle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface ExerciseSwitcherItem {
  id: string;
  exercise_id: string;
  name: string;
  sort_order: number | null;
  hasSets: boolean; // has at least one set with weight > 0 or reps > 0
}

interface ExerciseSwitcherProps {
  exercises: ExerciseSwitcherItem[];
  currentExerciseId: string;
  onSelect: (sessionExerciseId: string) => void;
  onPrev: () => void;
  onNext: () => void;
  hasPrev: boolean;
  hasNext: boolean;
  className?: string;
}

export function ExerciseSwitcher({
  exercises,
  currentExerciseId,
  onSelect,
  onPrev,
  onNext,
  hasPrev,
  hasNext,
  className,
}: ExerciseSwitcherProps) {
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {/* Navigation buttons */}
      <div className="flex items-center justify-between gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={onPrev}
          disabled={!hasPrev}
          className="h-10 w-10 flex-shrink-0"
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
        
        {/* Exercise chips - scrollable */}
        <div className="flex-1 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
          <div className="flex gap-2 min-w-min" style={{ WebkitOverflowScrolling: 'touch' }}>
            {exercises.map((ex) => {
              const isActive = ex.id === currentExerciseId;
              return (
                <button
                  key={ex.id}
                  onClick={() => onSelect(ex.id)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-muted-foreground hover:bg-secondary/80"
                  )}
                >
                  {ex.hasSets && (
                    <Circle className="h-2 w-2 fill-current" />
                  )}
                  <span className="truncate max-w-[100px]">{ex.name}</span>
                </button>
              );
            })}
          </div>
        </div>
        
        <Button
          variant="ghost"
          size="icon"
          onClick={onNext}
          disabled={!hasNext}
          className="h-10 w-10 flex-shrink-0"
        >
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>
    </div>
  );
}
