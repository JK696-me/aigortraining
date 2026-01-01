import { useState } from 'react'
import { motion, AnimatePresence, PanInfo } from 'framer-motion'
import { Dumbbell, BarChart3, Layout, Heart, Target, ChevronRight, ChevronLeft, X, BookOpen } from 'lucide-react'
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
  const [direction, setDirection] = useState(1)

  const isFirstSlide = currentSlide === 0
  const isLastSlide = currentSlide === INTRO_SLIDES.length - 1

  const handleNext = () => {
    if (isLastSlide) {
      onComplete(dontShowAgain)
    } else {
      setDirection(1)
      setCurrentSlide((prev) => prev + 1)
    }
  }

  const handleBack = () => {
    if (!isFirstSlide) {
      setDirection(-1)
      setCurrentSlide((prev) => prev - 1)
    }
  }

  const handleSkip = () => {
    onComplete(dontShowAgain)
  }

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    const threshold = 50
    if (info.offset.x < -threshold && !isLastSlide) {
      handleNext()
    } else if (info.offset.x > threshold && !isFirstSlide) {
      handleBack()
    }
  }

  const slide = INTRO_SLIDES[currentSlide]
  const Icon = slide.icon

  if (!open) return null

  const variants = {
    enter: (dir: number) => ({
      x: dir > 0 ? 100 : -100,
      opacity: 0,
    }),
    center: {
      x: 0,
      opacity: 1,
    },
    exit: (dir: number) => ({
      x: dir > 0 ? -100 : 100,
      opacity: 0,
    }),
  }

  return (
    <div className="fixed inset-0 z-[100] bg-background flex flex-col">
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
          className="flex items-center gap-1 px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-muted"
          aria-label="Пропустить"
        >
          <span>Пропустить</span>
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Content with swipe */}
      <motion.div 
        className="flex-1 flex flex-col items-center justify-center px-8 touch-pan-y"
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.2}
        onDragEnd={handleDragEnd}
      >
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={currentSlide}
            custom={direction}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="flex flex-col items-center text-center max-w-sm pointer-events-none"
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
      </motion.div>

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
        
        <div className="flex gap-3">
          {/* Back button - hidden on first slide */}
          <Button
            onClick={handleBack}
            variant="outline"
            className={`h-14 flex-1 text-lg font-semibold transition-opacity ${
              isFirstSlide ? 'opacity-0 pointer-events-none' : 'opacity-100'
            }`}
            size="lg"
            disabled={isFirstSlide}
          >
            <ChevronLeft className="mr-2 h-5 w-5" />
            Назад
          </Button>
          
          {/* Next / Complete button */}
          <Button
            onClick={handleNext}
            className="h-14 flex-1 text-lg font-semibold"
            size="lg"
          >
            {isLastSlide ? 'Начать пользоваться' : 'Далее'}
            {!isLastSlide && <ChevronRight className="ml-2 h-5 w-5" />}
          </Button>
        </div>
      </div>
    </div>
  )
}
