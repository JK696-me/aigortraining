import { useState, useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { useOnboardingState } from '@/hooks/useOnboardingState'

interface CoachMarkProps {
  id: string
  children: React.ReactNode
  message: string
  position?: 'top' | 'bottom' | 'left' | 'right'
}

export function CoachMark({ id, children, message, position = 'bottom' }: CoachMarkProps) {
  const { isCoachMarkShown, markCoachMarkShown, isLoading } = useOnboardingState()
  const [show, setShow] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isLoading && !isCoachMarkShown(id)) {
      // Small delay to let component mount
      const timer = setTimeout(() => setShow(true), 500)
      return () => clearTimeout(timer)
    }
  }, [isLoading, id, isCoachMarkShown])

  const handleDismiss = () => {
    setShow(false)
    markCoachMarkShown(id)
  }

  const positionClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  }

  const arrowClasses = {
    top: 'top-full left-1/2 -translate-x-1/2 border-l-transparent border-r-transparent border-b-transparent border-t-primary',
    bottom: 'bottom-full left-1/2 -translate-x-1/2 border-l-transparent border-r-transparent border-t-transparent border-b-primary',
    left: 'left-full top-1/2 -translate-y-1/2 border-t-transparent border-b-transparent border-r-transparent border-l-primary',
    right: 'right-full top-1/2 -translate-y-1/2 border-t-transparent border-b-transparent border-l-transparent border-r-primary',
  }

  return (
    <div ref={ref} className="relative inline-block">
      {children}
      {show && (
        <>
          {/* Backdrop for mobile */}
          <div 
            className="fixed inset-0 bg-black/20 z-40 md:hidden"
            onClick={handleDismiss}
          />
          
          {/* Tooltip */}
          <div 
            className={`absolute z-50 ${positionClasses[position]} animate-fade-in`}
            style={{ animationDuration: '200ms' }}
          >
            <div className="bg-primary text-primary-foreground rounded-lg shadow-lg p-3 pr-8 max-w-[250px] relative">
              <p className="text-sm">{message}</p>
              <button
                onClick={handleDismiss}
                className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary-foreground/20 flex items-center justify-center hover:bg-primary-foreground/30 transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
              {/* Arrow */}
              <div 
                className={`absolute w-0 h-0 border-8 ${arrowClasses[position]}`}
              />
            </div>
          </div>
        </>
      )}
    </div>
  )
}
