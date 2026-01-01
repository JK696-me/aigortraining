import { useEffect, useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronLeft, ChevronRight, X, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { useTour } from '@/contexts/TourContext'
import { TourDemoWorkout } from './TourDemoWorkout'

interface HighlightRect {
  top: number
  left: number
  width: number
  height: number
}

export function TourOverlay() {
  const { 
    isActive, 
    currentStep, 
    steps, 
    currentStepData, 
    nextStep, 
    prevStep, 
    endTour,
    setDismiss
  } = useTour()
  
  const [highlightRect, setHighlightRect] = useState<HighlightRect | null>(null)
  const [dontShowAgain, setDontShowAgain] = useState(false)
  const observerRef = useRef<MutationObserver | null>(null)

  const isFirstStep = currentStep === 0
  const isLastStep = currentStep === steps.length - 1

  // Find and highlight target element
  useEffect(() => {
    if (!isActive || !currentStepData?.targetSelector) {
      setHighlightRect(null)
      return
    }

    const findAndHighlight = () => {
      const element = document.querySelector(currentStepData.targetSelector!)
      if (element) {
        const rect = element.getBoundingClientRect()
        const padding = 8
        setHighlightRect({
          top: rect.top - padding,
          left: rect.left - padding,
          width: rect.width + padding * 2,
          height: rect.height + padding * 2,
        })
      } else {
        setHighlightRect(null)
      }
    }

    // Initial find
    const timeoutId = setTimeout(findAndHighlight, 100)

    // Watch for DOM changes
    observerRef.current = new MutationObserver(findAndHighlight)
    observerRef.current.observe(document.body, { 
      childList: true, 
      subtree: true,
      attributes: true 
    })

    // Recalc on resize
    window.addEventListener('resize', findAndHighlight)
    window.addEventListener('scroll', findAndHighlight)

    return () => {
      clearTimeout(timeoutId)
      observerRef.current?.disconnect()
      window.removeEventListener('resize', findAndHighlight)
      window.removeEventListener('scroll', findAndHighlight)
    }
  }, [isActive, currentStepData, currentStep])

  if (!isActive) return null

  const showDemo = currentStepData?.demoContent === 'workout'

  return (
    <div className="fixed inset-0 z-[100] pointer-events-auto">
      {/* Dark overlay with cutout */}
      <svg className="absolute inset-0 w-full h-full">
        <defs>
          <mask id="spotlight-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {highlightRect && !showDemo && (
              <rect
                x={highlightRect.left}
                y={highlightRect.top}
                width={highlightRect.width}
                height={highlightRect.height}
                rx="12"
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="rgba(0, 0, 0, 0.75)"
          mask="url(#spotlight-mask)"
        />
      </svg>

      {/* Highlight border */}
      {highlightRect && !showDemo && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="absolute border-2 border-primary rounded-xl pointer-events-none"
          style={{
            top: highlightRect.top,
            left: highlightRect.left,
            width: highlightRect.width,
            height: highlightRect.height,
            boxShadow: '0 0 0 4px rgba(var(--primary), 0.2), 0 0 20px rgba(var(--primary), 0.3)',
          }}
        />
      )}

      {/* Demo content for workout step */}
      {showDemo && (
        <div className="absolute inset-x-4 top-20 bottom-48 flex items-center justify-center">
          <TourDemoWorkout />
        </div>
      )}

      {/* Skip button */}
      <button
        onClick={() => endTour(dontShowAgain)}
        className="absolute top-4 right-4 safe-top flex items-center gap-1 px-3 py-2 text-sm text-white/80 hover:text-white transition-colors rounded-lg hover:bg-white/10 z-10"
      >
        <span>Пропустить</span>
        <X className="h-4 w-4" />
      </button>

      {/* Progress dots */}
      <div className="absolute top-4 left-4 safe-top flex gap-1.5 z-10">
        {steps.map((_, idx) => (
          <div
            key={idx}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              idx === currentStep
                ? 'w-6 bg-primary'
                : idx < currentStep
                ? 'w-1.5 bg-primary/50'
                : 'w-1.5 bg-white/30'
            }`}
          />
        ))}
      </div>

      {/* Content card */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentStep}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.2 }}
          className="absolute bottom-0 left-0 right-0 safe-bottom bg-card border-t border-border rounded-t-3xl p-6 pb-8"
        >
          <div className="mb-4">
            <h3 className="text-xl font-bold text-foreground mb-2">
              {currentStepData?.title}
            </h3>
            <p className="text-muted-foreground">
              {currentStepData?.description}
            </p>
          </div>

          {/* Don't show again checkbox on last step */}
          {isLastStep && (
            <div className="flex items-center gap-2 mb-4">
              <Checkbox
                id="tour-dont-show"
                checked={dontShowAgain}
                onCheckedChange={(checked) => {
                  const value = checked === true
                  setDontShowAgain(value)
                  setDismiss(value)
                }}
              />
              <label
                htmlFor="tour-dont-show"
                className="text-sm text-muted-foreground cursor-pointer"
              >
                Больше не показывать
              </label>
            </div>
          )}

          {/* Navigation buttons */}
          <div className="flex gap-3">
            <Button
              onClick={prevStep}
              variant="outline"
              className={`h-12 flex-1 font-semibold transition-opacity ${
                isFirstStep ? 'opacity-0 pointer-events-none' : 'opacity-100'
              }`}
              disabled={isFirstStep}
            >
              <ChevronLeft className="mr-1 h-5 w-5" />
              Назад
            </Button>

            <Button
              onClick={nextStep}
              className="h-12 flex-1 font-semibold"
            >
              {isLastStep ? (
                <>
                  <Check className="mr-2 h-5 w-5" />
                  Готово
                </>
              ) : (
                <>
                  {currentStepData?.cta || 'Далее'}
                  <ChevronRight className="ml-1 h-5 w-5" />
                </>
              )}
            </Button>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
