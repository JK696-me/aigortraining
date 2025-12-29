import { useNavigate } from 'react-router-dom'
import { Check, X, Dumbbell, FileText, Play, TrendingUp, Sparkles } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useOnboardingState } from '@/hooks/useOnboardingState'
import { useLanguage } from '@/contexts/LanguageContext'

export function OnboardingWidget() {
  const navigate = useNavigate()
  const { locale } = useLanguage()
  const { 
    steps, 
    completedCount, 
    shouldShowWidget, 
    dismissOnboarding, 
    isLoading 
  } = useOnboardingState()

  if (isLoading || !shouldShowWidget) return null

  const stepsList = [
    {
      key: 'exercises',
      done: steps.exercises,
      icon: Dumbbell,
      title: locale === 'ru' ? 'Добавьте упражнения' : 'Add exercises',
      cta: locale === 'ru' ? 'Открыть упражнения' : 'Open exercises',
      action: () => navigate('/exercises'),
    },
    {
      key: 'template',
      done: steps.template,
      icon: FileText,
      title: locale === 'ru' ? 'Создайте шаблон' : 'Create a template',
      cta: locale === 'ru' ? 'Создать шаблон' : 'Create template',
      action: () => navigate('/templates'),
    },
    {
      key: 'workout',
      done: steps.workout,
      icon: Play,
      title: locale === 'ru' ? 'Запишите первую тренировку' : 'Record your first workout',
      cta: locale === 'ru' ? 'Начать тренировку' : 'Start workout',
      action: () => navigate('/workout'),
    },
    {
      key: 'progress',
      done: steps.progress,
      icon: TrendingUp,
      title: locale === 'ru' ? 'Посмотрите прогресс' : 'View your progress',
      cta: locale === 'ru' ? 'Открыть прогресс' : 'Open progress',
      action: () => navigate('/exercises'),
    },
  ]

  // Find first incomplete step
  const nextStep = stepsList.find(s => !s.done)

  return (
    <Card className="p-4 bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20 mb-6 relative overflow-hidden">
      {/* Decorative sparkle */}
      <Sparkles className="absolute top-3 right-3 h-5 w-5 text-primary/30" />
      
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold text-foreground flex items-center gap-2">
            {locale === 'ru' ? 'Быстрый старт' : 'Quick Start'}
          </h3>
          <p className="text-sm text-muted-foreground">
            {completedCount}/4 {locale === 'ru' ? 'выполнено' : 'completed'}
          </p>
        </div>
        <button
          onClick={dismissOnboarding}
          className="w-8 h-8 rounded-full bg-secondary/50 flex items-center justify-center hover:bg-secondary transition-colors"
          title={locale === 'ru' ? 'Скрыть' : 'Hide'}
        >
          <X className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>

      {/* Progress Bar */}
      <div className="h-2 bg-secondary rounded-full mb-4 overflow-hidden">
        <div 
          className="h-full bg-primary rounded-full transition-all duration-500"
          style={{ width: `${(completedCount / 4) * 100}%` }}
        />
      </div>

      {/* Steps */}
      <div className="space-y-2">
        {stepsList.map((step) => {
          const Icon = step.icon
          const isNext = nextStep?.key === step.key

          return (
            <div
              key={step.key}
              className={`flex items-center justify-between p-3 rounded-lg transition-colors ${
                step.done 
                  ? 'bg-primary/10' 
                  : isNext 
                    ? 'bg-secondary/80' 
                    : 'bg-secondary/30'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  step.done ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                }`}>
                  {step.done ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                </div>
                <span className={`text-sm ${step.done ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
                  {step.title}
                </span>
              </div>
              {!step.done && isNext && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={step.action}
                  className="h-8 text-xs"
                >
                  {step.cta}
                </Button>
              )}
            </div>
          )
        })}
      </div>
    </Card>
  )
}
