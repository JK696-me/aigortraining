import { useRef, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { useLanguage } from '@/contexts/LanguageContext'

interface SwipeableSetItemProps {
  setIndex: number
  weight: number
  reps: number
  isSelected: boolean
  onSelect: () => void
  onDelete: () => void
  kgLabel: string
  setLabel: string
  // Previous workout values for comparison
  prevWeight?: number | null
  prevReps?: number | null
  prevRpe?: number | null
}

export function SwipeableSetItem({
  setIndex,
  weight,
  reps,
  isSelected,
  onSelect,
  onDelete,
  kgLabel,
  setLabel,
  prevWeight,
  prevReps,
  prevRpe,
}: SwipeableSetItemProps) {
  const { locale } = useLanguage()
  const containerRef = useRef<HTMLDivElement>(null)
  const [translateX, setTranslateX] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const startXRef = useRef(0)
  const currentXRef = useRef(0)

  const DELETE_THRESHOLD = -80
  const MAX_SWIPE = -100

  const handleTouchStart = (e: React.TouchEvent) => {
    startXRef.current = e.touches[0].clientX
    currentXRef.current = translateX
    setIsDragging(true)
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return
    
    const diff = e.touches[0].clientX - startXRef.current
    const newTranslate = Math.min(0, Math.max(MAX_SWIPE, currentXRef.current + diff))
    setTranslateX(newTranslate)
  }

  const handleTouchEnd = () => {
    setIsDragging(false)
    
    if (translateX < DELETE_THRESHOLD) {
      // Keep showing delete button
      setTranslateX(-80)
    } else {
      // Snap back
      setTranslateX(0)
    }
  }

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation()
    onDelete()
  }

  const handleClick = () => {
    if (translateX < -20) {
      // If swiped, snap back instead of selecting
      setTranslateX(0)
      return
    }
    onSelect()
  }

  // Check if we have previous data to show
  const hasPrevData = prevWeight != null && prevReps != null

  return (
    <div className="relative overflow-hidden rounded-lg">
      {/* Delete button background */}
      <div 
        className="absolute inset-y-0 right-0 w-20 bg-destructive flex items-center justify-center"
        onClick={handleDelete}
      >
        <Trash2 className="h-5 w-5 text-destructive-foreground" />
      </div>
      
      {/* Swipeable content */}
      <div
        ref={containerRef}
        className={`relative w-full flex items-center justify-between py-2 px-3 transition-transform ${
          isDragging ? '' : 'duration-200'
        } ${isSelected ? 'bg-primary/20' : 'bg-secondary/50'}`}
        style={{ transform: `translateX(${translateX}px)` }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={handleClick}
      >
        <div className="flex flex-col gap-0.5">
          <span className="text-sm text-muted-foreground">{setLabel} {setIndex}</span>
          {/* Previous workout hint */}
          {hasPrevData && (
            <span className="text-[10px] text-muted-foreground/70">
              {locale === 'ru' ? 'Прошлый' : 'Previous'}: {prevWeight}{kgLabel}×{prevReps}
              {prevRpe != null && `, RPE ${prevRpe}`}
            </span>
          )}
        </div>
        <span className="font-mono font-medium text-foreground">
          {weight}{kgLabel} × {reps}
        </span>
      </div>
    </div>
  )
}
