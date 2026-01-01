import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Dumbbell, BarChart3, Layout, Heart, Target, ChevronRight, X, BookOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'

interface IntroModalProps {
  open: boolean
  onComplete: (dismiss: boolean) => void
}

const INTRO_SLIDES = [
  {
    icon: Dumbbell,
    title: 'Добро пожаловать!',
    description: 'Здесь ты записываешь силовые тренировки быстро.',
  },
  {
    icon: Target,
    title: 'Записывай подходы',
    description: 'Записывай каждый подход: вес, повторы и RPE — так рекомендации будут точнее.',
  },
  {
    icon: BookOpen,
    title: 'Упражнения',
    description: 'Можешь добавлять свои и смотреть прогресс по каждому.',
  },
  {
    icon: Layout,
    title: 'Шаблоны',
    description: 'Готовые тренировки уже добавлены, можно стартовать в 1 тап.',
  },
  {
    icon: BarChart3,
    title: 'Прогресс',
    description: 'Смотри динамику по упражнениям и следуй подсказкам.',
  },
  {
    icon: Heart,
    title: 'Здоровье',
    description: 'Фиксируй вес и замеры тела, чтобы видеть изменения.',
  },
]

export function IntroModal({ open, onComplete }: IntroModalProps) {
  const [currentSlide, setCurrentSlide] = useState(0)
  const [dontShowAgain, setDontShowAgain] = useState(false)

  const isLastSlide = currentSlide === INTRO_SLIDES.length - 1

  const handleNext = () => {
    if (isLastSlide) {
      onComplete(dontShowAgain)
    } else {
      setCurrentSlide((prev) => prev + 1)
    }
  }

  const handleSkip = () => {
    onComplete(dontShowAgain)
  }

  const slide = INTRO_SLIDES[currentSlide]
  const Icon = slide.icon

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 safe-top">
        <div className="flex gap-1.5">
          {INTRO_SLIDES.map((_, idx) => (
            <div
              key={idx}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                idx === currentSlide
                  ? 'w-6 bg-primary'
                  : idx < currentSlide
                  ? 'w-1.5 bg-primary/50'
                  : 'w-1.5 bg-muted'
              }`}
            />
          ))}
        </div>
        <button
          onClick={handleSkip}
          className="p-2 text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Пропустить"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentSlide}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.25 }}
            className="flex flex-col items-center text-center max-w-sm"
          >
            <div className="w-24 h-24 rounded-2xl bg-primary/10 flex items-center justify-center mb-8">
              <Icon className="h-12 w-12 text-primary" />
            </div>
            <h2 className="text-2xl font-bold text-foreground mb-4">
              {slide.title}
            </h2>
            <p className="text-lg text-muted-foreground leading-relaxed">
              {slide.description}
            </p>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Footer */}
      <div className="p-6 pb-8 safe-bottom space-y-4">
        {isLastSlide && (
          <div className="flex items-center justify-center gap-2">
            <Checkbox
              id="dont-show"
              checked={dontShowAgain}
              onCheckedChange={(checked) => setDontShowAgain(checked === true)}
            />
            <label
              htmlFor="dont-show"
              className="text-sm text-muted-foreground cursor-pointer"
            >
              Больше не показывать
            </label>
          </div>
        )}
        
        <Button
          onClick={handleNext}
          className="w-full h-14 text-lg font-semibold"
          size="lg"
        >
          {isLastSlide ? 'Начать пользоваться' : 'Далее'}
          {!isLastSlide && <ChevronRight className="ml-2 h-5 w-5" />}
        </Button>
      </div>
    </div>
  )
}
