import { useState } from 'react';
import { ChevronDown, ChevronUp, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';

export interface ExplanationDetails {
  currentStage: number;
  targetRange: string;
  upperBoundary: number;
  setsAnalysis: { setIndex: number; reps: number; hitTarget: boolean }[];
  allHitUpper: boolean;
  rpe: number | null;
  rpeThreshold: number;
  rpeIsHigh: boolean;
  weightStep: number;
  weightStepLabel: string;
  successStreak: number;
  failStreak: number;
  volumeReduceOn: boolean;
  currentSets: number;
  baseSets: number;
  basedOn: {
    source: 'current_workout' | 'last_completed';
    lastCompletedDate?: string;
    templateName?: string;
  };
}

interface RecommendationExplainerProps {
  details: ExplanationDetails;
  className?: string;
}

export function RecommendationExplainer({ details, className = '' }: RecommendationExplainerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { locale } = useLanguage();

  const setsText = details.setsAnalysis
    .map(s => s.reps.toString())
    .join('/');
  
  const allHit = details.allHitUpper;
  const setsVerdict = allHit 
    ? (locale === 'ru' ? 'верх достигнут' : 'upper reached')
    : (locale === 'ru' ? 'верх НЕ достигнут' : 'upper NOT reached');

  return (
    <div className={className}>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        className="text-muted-foreground hover:text-foreground p-0 h-auto font-normal"
      >
        <Info className="h-3.5 w-3.5 mr-1" />
        {locale === 'ru' ? 'Почему так?' : 'Why this?'}
        {isOpen ? (
          <ChevronUp className="h-3.5 w-3.5 ml-1" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 ml-1" />
        )}
      </Button>

      {isOpen && (
        <div className="mt-3 p-3 rounded-lg bg-secondary/50 text-sm space-y-2">
          {/* Current Stage */}
          <div className="flex justify-between">
            <span className="text-muted-foreground">
              {locale === 'ru' ? 'Текущая ступень:' : 'Current stage:'}
            </span>
            <span className="font-medium text-foreground">
              {locale === 'ru' ? `ступень ${details.currentStage}` : `stage ${details.currentStage}`} ({details.targetRange})
            </span>
          </div>

          {/* Sets Analysis */}
          <div className="flex justify-between">
            <span className="text-muted-foreground">
              {locale === 'ru' ? 'Верх достигнут?' : 'Upper reached?'}
            </span>
            <span className={`font-medium ${allHit ? 'text-green-500' : 'text-amber-500'}`}>
              {allHit 
                ? (locale === 'ru' ? 'Да' : 'Yes') 
                : (locale === 'ru' ? 'Нет' : 'No')}
            </span>
          </div>
          <div className="text-xs text-muted-foreground pl-2 border-l-2 border-border">
            {locale === 'ru' ? 'подходы' : 'sets'}: {setsText} → {setsVerdict} (
            {locale === 'ru' ? 'граница' : 'boundary'}: {details.upperBoundary}+)
          </div>

          {/* RPE */}
          <div className="flex justify-between">
            <span className="text-muted-foreground">
              {locale === 'ru' ? 'RPE и порог:' : 'RPE & threshold:'}
            </span>
            <span className={`font-medium ${details.rpeIsHigh ? 'text-destructive' : 'text-foreground'}`}>
              {details.rpe !== null 
                ? `RPE ${details.rpe} ${details.rpeIsHigh 
                    ? (locale === 'ru' ? '→ сбой' : '→ fail') 
                    : (locale === 'ru' ? '→ ОК' : '→ OK')}`
                : (locale === 'ru' ? 'не указан' : 'not set')}
            </span>
          </div>
          {details.rpe !== null && (
            <div className="text-xs text-muted-foreground pl-2 border-l-2 border-border">
              {locale === 'ru' 
                ? `порог ≥ ${details.rpeThreshold} считается сбоем`
                : `threshold ≥ ${details.rpeThreshold} counts as fail`}
            </div>
          )}

          {/* Weight Step */}
          <div className="flex justify-between">
            <span className="text-muted-foreground">
              {locale === 'ru' ? 'Шаг веса:' : 'Weight step:'}
            </span>
            <span className="font-medium text-foreground">
              +{details.weightStep} {locale === 'ru' ? 'кг' : 'kg'} {details.weightStepLabel && `(${details.weightStepLabel})`}
            </span>
          </div>

          {/* Streaks */}
          <div className="flex justify-between">
            <span className="text-muted-foreground">
              {locale === 'ru' ? 'Серии (успех/сбой):' : 'Streaks (success/fail):'}
            </span>
            <span className="font-medium text-foreground">
              {details.successStreak} / {details.failStreak}
            </span>
          </div>

          {/* Volume Reduce */}
          <div className="flex justify-between">
            <span className="text-muted-foreground">
              {locale === 'ru' ? 'Снижение объёма:' : 'Volume reduce:'}
            </span>
            <span className={`font-medium ${details.volumeReduceOn ? 'text-amber-500' : 'text-foreground'}`}>
              {details.volumeReduceOn 
                ? (locale === 'ru' 
                    ? `активно (${details.currentSets} из ${details.baseSets})` 
                    : `active (${details.currentSets} of ${details.baseSets})`)
                : (locale === 'ru' ? 'нет' : 'no')}
            </span>
          </div>

          {/* Based On */}
          <div className="pt-2 mt-2 border-t border-border">
            <span className="text-muted-foreground text-xs">
              {locale === 'ru' ? 'Основано на: ' : 'Based on: '}
            </span>
            <span className="text-xs text-foreground">
              {details.basedOn.source === 'current_workout'
                ? (locale === 'ru' ? 'текущей тренировке' : 'current workout')
                : (locale === 'ru' ? 'последней завершённой' : 'last completed')}
              {details.basedOn.lastCompletedDate && (
                <span className="text-muted-foreground">
                  {' '}({details.basedOn.lastCompletedDate})
                </span>
              )}
            </span>
            {details.basedOn.templateName && (
              <div className="text-xs text-muted-foreground mt-1">
                {locale === 'ru' ? 'Шаблон: ' : 'Template: '}
                <span className="text-foreground">{details.basedOn.templateName}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
