import { createContext, useContext, useState, useCallback, ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'

export interface TourStep {
  id: string
  title: string
  description: string
  targetSelector?: string // CSS selector for element to highlight
  route?: string // Route to navigate to for this step
  cta?: string // CTA button text
  demoContent?: 'workout' // Show demo content instead of highlighting
}

const TOUR_STEPS: TourStep[] = [
  {
    id: 'start-workout',
    title: 'Начните тренировку',
    description: 'Нажмите, чтобы начать пустую тренировку или повторить предыдущую.',
    targetSelector: '[data-tour="start-workout"]',
    route: '/',
    cta: 'Понятно',
  },
  {
    id: 'workout-tab',
    title: 'Вкладка Тренировка',
    description: 'Здесь находится текущая тренировка с упражнениями.',
    targetSelector: '[data-tour="tab-workout"]',
    route: '/',
    cta: 'Открыть',
  },
  {
    id: 'record-sets',
    title: 'Записывайте подходы',
    description: 'Вес, повторы и RPE — так рекомендации будут точнее.',
    demoContent: 'workout',
    route: '/workout',
    cta: 'Понятно',
  },
  {
    id: 'history',
    title: 'Смотрите прогресс',
    description: 'История тренировок и динамика по упражнениям.',
    targetSelector: '[data-tour="tab-history"]',
    route: '/workout',
    cta: 'Открыть',
  },
  {
    id: 'templates',
    title: 'Шаблоны ускоряют старт',
    description: 'Готовые тренировки — стартуйте в 1 тап.',
    targetSelector: '[data-tour="templates-section"]',
    route: '/',
    cta: 'Открыть шаблоны',
  },
  {
    id: 'health',
    title: 'Здоровье: вес и замеры',
    description: 'Фиксируйте вес и замеры тела.',
    targetSelector: '[data-tour="tab-health"]',
    route: '/',
    cta: 'Открыть',
  },
  {
    id: 'settings',
    title: 'Настройки и упражнения',
    description: 'Добавляйте свои упражнения и настраивайте приложение.',
    targetSelector: '[data-tour="tab-settings"]',
    route: '/',
    cta: 'Готово',
  },
]

interface TourContextType {
  isActive: boolean
  currentStep: number
  steps: TourStep[]
  currentStepData: TourStep | null
  dismissOnEnd: boolean
  startTour: () => void
  endTour: (dismiss?: boolean) => void
  nextStep: () => void
  prevStep: () => void
  goToStep: (index: number) => void
  setDismiss: (dismiss: boolean) => void
}

const TourContext = createContext<TourContextType | undefined>(undefined)

interface TourProviderProps {
  children: ReactNode
}

export function TourProvider({ children }: TourProviderProps) {
  const [isActive, setIsActive] = useState(false)
  const [currentStep, setCurrentStep] = useState(0)
  const [dismissOnEnd, setDismissOnEnd] = useState(false)
  const navigate = useNavigate()

  const currentStepData = isActive ? TOUR_STEPS[currentStep] : null

  const startTour = useCallback(() => {
    setCurrentStep(0)
    setDismissOnEnd(false)
    setIsActive(true)
    // Navigate to first step's route
    if (TOUR_STEPS[0].route) {
      navigate(TOUR_STEPS[0].route)
    }
  }, [navigate])

  const endTour = useCallback((dismiss = false) => {
    setIsActive(false)
    setCurrentStep(0)
    setDismissOnEnd(dismiss)
    navigate('/')
  }, [navigate])

  const setDismiss = useCallback((dismiss: boolean) => {
    setDismissOnEnd(dismiss)
  }, [])

  const nextStep = useCallback(() => {
    if (currentStep < TOUR_STEPS.length - 1) {
      const nextIdx = currentStep + 1
      const nextStepData = TOUR_STEPS[nextIdx]
      
      setCurrentStep(nextIdx)
      
      // Navigate to next step's route if different
      if (nextStepData.route) {
        navigate(nextStepData.route)
      }
    } else {
      // Last step - end tour
      endTour(false)
    }
  }, [currentStep, navigate, endTour])

  const prevStep = useCallback(() => {
    if (currentStep > 0) {
      const prevIdx = currentStep - 1
      const prevStepData = TOUR_STEPS[prevIdx]
      
      setCurrentStep(prevIdx)
      
      if (prevStepData.route) {
        navigate(prevStepData.route)
      }
    }
  }, [currentStep, navigate])

  const goToStep = useCallback((index: number) => {
    if (index >= 0 && index < TOUR_STEPS.length) {
      const stepData = TOUR_STEPS[index]
      setCurrentStep(index)
      if (stepData.route) {
        navigate(stepData.route)
      }
    }
  }, [navigate])

  return (
    <TourContext.Provider 
      value={{ 
        isActive, 
        currentStep, 
        steps: TOUR_STEPS,
        currentStepData,
        dismissOnEnd,
        startTour, 
        endTour, 
        nextStep, 
        prevStep,
        goToStep,
        setDismiss
      }}
    >
      {children}
    </TourContext.Provider>
  )
}

export function useTour() {
  const context = useContext(TourContext)
  if (!context) {
    throw new Error('useTour must be used within TourProvider')
  }
  return context
}
