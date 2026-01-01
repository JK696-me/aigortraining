import { useEffect, useState, useRef, useMemo } from 'react'
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

type CardPosition = 'top' | 'bottom' | 'left' | 'right'

interface CardPlacement {
  position: CardPosition
  top: number
  left: number
  width: number
  arrowStyle: React.CSSProperties
}

const CARD_MIN_HEIGHT = 180
const CARD_PADDING = 16
const GAP_FROM_TARGET = 16
const SAFE_AREA_TOP = 60
const SAFE_AREA_BOTTOM = 40

function calculateCardPlacement(
  targetRect: HighlightRect | null,
  windowWidth: number,
  windowHeight: number
): CardPlacement {
  // Default bottom placement when no target
  if (!targetRect) {
    return {
      position: 'bottom',
      top: windowHeight - CARD_MIN_HEIGHT - SAFE_AREA_BOTTOM,
      left: CARD_PADDING,
      width: windowWidth - CARD_PADDING * 2,
      arrowStyle: { display: 'none' },
    }
  }

  const targetCenterX = targetRect.left + targetRect.width / 2
  const targetCenterY = targetRect.top + targetRect.height / 2

  // Calculate available space in each direction
  const spaceAbove = targetRect.top - SAFE_AREA_TOP - GAP_FROM_TARGET
  const spaceBelow = windowHeight - targetRect.top - targetRect.height - SAFE_AREA_BOTTOM - GAP_FROM_TARGET
  const spaceLeft = targetRect.left - CARD_PADDING - GAP_FROM_TARGET
  const spaceRight = windowWidth - targetRect.left - targetRect.width - CARD_PADDING - GAP_FROM_TARGET

  // Determine best position based on available space
  const spaces: { position: CardPosition; space: number }[] = [
    { position: 'bottom', space: spaceBelow },
    { position: 'top', space: spaceAbove },
    { position: 'right', space: spaceRight },
    { position: 'left', space: spaceLeft },
  ]

  // Sort by available space and pick best
  spaces.sort((a, b) => b.space - a.space)
  const bestPosition = spaces[0].position

  const cardWidth = Math.min(windowWidth - CARD_PADDING * 2, 360)
  
  let placement: CardPlacement

  switch (bestPosition) {
    case 'top': {
      const cardTop = Math.max(SAFE_AREA_TOP, targetRect.top - CARD_MIN_HEIGHT - GAP_FROM_TARGET)
      const cardLeft = Math.max(CARD_PADDING, Math.min(targetCenterX - cardWidth / 2, windowWidth - cardWidth - CARD_PADDING))
      const arrowLeft = Math.min(Math.max(16, targetCenterX - cardLeft - 8), cardWidth - 32)
      placement = {
        position: 'top',
        top: cardTop,
        left: cardLeft,
        width: cardWidth,
        arrowStyle: {
          position: 'absolute' as const,
          bottom: -8,
          left: arrowLeft,
          width: 0,
          height: 0,
          borderLeft: '8px solid transparent',
          borderRight: '8px solid transparent',
          borderTop: '8px solid hsl(var(--card))',
        },
      }
      break
    }
    case 'bottom': {
      const cardTop = targetRect.top + targetRect.height + GAP_FROM_TARGET
      const cardLeft = Math.max(CARD_PADDING, Math.min(targetCenterX - cardWidth / 2, windowWidth - cardWidth - CARD_PADDING))
      const arrowLeft = Math.min(Math.max(16, targetCenterX - cardLeft - 8), cardWidth - 32)
      placement = {
        position: 'bottom',
        top: Math.min(cardTop, windowHeight - CARD_MIN_HEIGHT - SAFE_AREA_BOTTOM),
        left: cardLeft,
        width: cardWidth,
        arrowStyle: {
          position: 'absolute' as const,
          top: -8,
          left: arrowLeft,
          width: 0,
          height: 0,
          borderLeft: '8px solid transparent',
          borderRight: '8px solid transparent',
          borderBottom: '8px solid hsl(var(--card))',
        },
      }
      break
    }
    case 'left': {
      const cardTop = Math.max(SAFE_AREA_TOP, Math.min(targetCenterY - CARD_MIN_HEIGHT / 2, windowHeight - CARD_MIN_HEIGHT - SAFE_AREA_BOTTOM))
      const cardLeft = Math.max(CARD_PADDING, targetRect.left - cardWidth - GAP_FROM_TARGET)
      placement = {
        position: 'left',
        top: cardTop,
        left: cardLeft,
        width: cardWidth,
        arrowStyle: {
          position: 'absolute' as const,
          right: -8,
          top: Math.min(Math.max(16, targetCenterY - cardTop - 8), CARD_MIN_HEIGHT - 32),
          width: 0,
          height: 0,
          borderTop: '8px solid transparent',
          borderBottom: '8px solid transparent',
          borderLeft: '8px solid hsl(var(--card))',
        },
      }
      break
    }
    case 'right': {
      const cardTop = Math.max(SAFE_AREA_TOP, Math.min(targetCenterY - CARD_MIN_HEIGHT / 2, windowHeight - CARD_MIN_HEIGHT - SAFE_AREA_BOTTOM))
      const cardLeft = targetRect.left + targetRect.width + GAP_FROM_TARGET
      placement = {
        position: 'right',
        top: cardTop,
        left: Math.min(cardLeft, windowWidth - cardWidth - CARD_PADDING),
        width: cardWidth,
        arrowStyle: {
          position: 'absolute' as const,
          left: -8,
          top: Math.min(Math.max(16, targetCenterY - cardTop - 8), CARD_MIN_HEIGHT - 32),
          width: 0,
          height: 0,
          borderTop: '8px solid transparent',
          borderBottom: '8px solid transparent',
          borderRight: '8px solid hsl(var(--card))',
        },
      }
      break
    }
    default:
      placement = {
        position: 'bottom',
        top: windowHeight - CARD_MIN_HEIGHT - SAFE_AREA_BOTTOM,
        left: CARD_PADDING,
        width: windowWidth - CARD_PADDING * 2,
        arrowStyle: { display: 'none' },
      }
  }

  return placement
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
  const [windowSize, setWindowSize] = useState({ width: window.innerWidth, height: window.innerHeight })
  const observerRef = useRef<MutationObserver | null>(null)

  const isFirstStep = currentStep === 0
  const isLastStep = currentStep === steps.length - 1
  const showDemo = currentStepData?.demoContent === 'workout'

  // Track window size
  useEffect(() => {
    const handleResize = () => {
      setWindowSize({ width: window.innerWidth, height: window.innerHeight })
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

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

  // Calculate card placement
  const cardPlacement = useMemo(() => {
    if (showDemo) {
      // For demo, place card at bottom
      return {
        position: 'bottom' as CardPosition,
        top: windowSize.height - CARD_MIN_HEIGHT - SAFE_AREA_BOTTOM,
        left: CARD_PADDING,
        width: windowSize.width - CARD_PADDING * 2,
        arrowStyle: { display: 'none' },
      }
    }
    return calculateCardPlacement(highlightRect, windowSize.width, windowSize.height)
  }, [highlightRect, windowSize.width, windowSize.height, showDemo])

  if (!isActive) return null

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
        <div className="absolute inset-x-4 top-16 flex items-start justify-center" style={{ bottom: CARD_MIN_HEIGHT + SAFE_AREA_BOTTOM + 16 }}>
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

      {/* Content card - dynamically positioned */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentStep}
          initial={{ opacity: 0, y: cardPlacement.position === 'top' ? -20 : 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: cardPlacement.position === 'top' ? -20 : 20 }}
          transition={{ duration: 0.2 }}
          className="absolute bg-card border border-border rounded-2xl p-5 shadow-xl"
          style={{
            top: cardPlacement.top,
            left: cardPlacement.left,
            width: cardPlacement.width,
            minHeight: CARD_MIN_HEIGHT,
          }}
        >
          {/* Arrow */}
          <div style={cardPlacement.arrowStyle} />

          <div className="mb-3">
            <h3 className="text-lg font-bold text-foreground mb-1">
              {currentStepData?.title}
            </h3>
            <p className="text-sm text-muted-foreground">
              {currentStepData?.description}
            </p>
          </div>

          {/* Don't show again checkbox on last step */}
          {isLastStep && (
            <div className="flex items-center gap-2 mb-3">
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
          <div className="flex gap-2">
            <Button
              onClick={prevStep}
              variant="outline"
              size="sm"
              className={`h-10 flex-1 font-semibold transition-opacity ${
                isFirstStep ? 'opacity-0 pointer-events-none' : 'opacity-100'
              }`}
              disabled={isFirstStep}
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              Назад
            </Button>

            <Button
              onClick={nextStep}
              size="sm"
              className="h-10 flex-1 font-semibold"
            >
              {isLastStep ? (
                <>
                  <Check className="mr-1 h-4 w-4" />
                  Готово
                </>
              ) : (
                <>
                  {currentStepData?.cta || 'Далее'}
                  <ChevronRight className="ml-1 h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
