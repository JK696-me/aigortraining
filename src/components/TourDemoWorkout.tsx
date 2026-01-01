import { useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Plus, Minus, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

const rpeDisplayScale = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

const DEMO_SETS = [
  { id: '1', set_index: 1, weight: 60, reps: 8, rpe: null, is_completed: true },
  { id: '2', set_index: 2, weight: 60, reps: 8, rpe: 8, is_completed: false },
  { id: '3', set_index: 3, weight: 60, reps: 8, rpe: null, is_completed: false },
]

export function TourDemoWorkout() {
  const [selectedSetIndex, setSelectedSetIndex] = useState(1)
  const [sets, setSets] = useState(DEMO_SETS)
  const [weightValue, setWeightValue] = useState('60')
  const [repsValue, setRepsValue] = useState('8')

  const currentSet = sets[selectedSetIndex]

  const handleWeightChange = useCallback((delta: number) => {
    const currentValue = parseFloat(weightValue) || 0
    const newValue = Math.max(0, currentValue + delta)
    const roundedValue = Math.round(newValue * 2) / 2
    setWeightValue(roundedValue.toString())
  }, [weightValue])

  const handleRepsChange = useCallback((delta: number) => {
    const currentValue = parseInt(repsValue, 10) || 0
    const newValue = Math.max(0, currentValue + delta)
    setRepsValue(newValue.toString())
  }, [repsValue])

  const handleRpeChange = useCallback((rpe: number) => {
    setSets(prev => prev.map((s, i) => 
      i === selectedSetIndex ? { ...s, rpe } : s
    ))
  }, [selectedSetIndex])

  const handleSetCompleted = useCallback(() => {
    setSets(prev => prev.map((s, i) => 
      i === selectedSetIndex ? { ...s, is_completed: true } : s
    ))
    // Move to next set if available
    if (selectedSetIndex < sets.length - 1) {
      setSelectedSetIndex(selectedSetIndex + 1)
    }
  }, [selectedSetIndex, sets.length])

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="w-full max-w-sm"
    >
      {/* Exercise name header */}
      <div className="mb-4 text-center">
        <h1 className="text-xl font-bold text-foreground">Жим штанги лёжа</h1>
        <p className="text-muted-foreground text-sm">
          Подход {selectedSetIndex + 1} из {sets.length}
        </p>
      </div>

      {/* Set Tabs - matching real Exercise UI */}
      <div className="flex gap-2 mb-4 overflow-x-auto overflow-y-visible py-2 -my-1 px-1 -mx-1">
        {sets.map((set, index) => (
          <button
            key={`set-${set.set_index}`}
            onClick={() => setSelectedSetIndex(index)}
            className={`flex-shrink-0 min-w-[44px] min-h-[44px] px-3 py-2 rounded-lg font-medium font-mono transition-all relative ${
              index === selectedSetIndex
                ? 'bg-primary text-primary-foreground shadow-[inset_0_0_0_2px_hsl(var(--primary))]'
                : set.is_completed
                ? 'bg-accent/10 text-accent border border-accent/30'
                : 'bg-secondary text-muted-foreground hover:bg-secondary/80'
            }`}
          >
            {set.is_completed && (
              <Check className="h-3 w-3 absolute top-0.5 right-0.5 text-accent" />
            )}
            {set.set_index}
          </button>
        ))}
        <button
          className="flex-shrink-0 min-w-[44px] min-h-[44px] px-3 py-2 rounded-lg bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors"
        >
          <Plus className="h-5 w-5" />
        </button>
      </div>

      {/* Current Set Input Card - matching real Exercise UI */}
      <Card className="p-4 bg-card border-border">
        {/* Weight + Reps Row */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          {/* Weight */}
          <div className="text-center">
            <p className="text-xs text-muted-foreground mb-1">Вес (кг)</p>
            <div className="flex items-center justify-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-11 w-11 rounded-full flex-shrink-0"
                onClick={() => handleWeightChange(-2.5)}
              >
                <Minus className="h-4 w-4" />
              </Button>
              <Input
                type="text"
                inputMode="decimal"
                value={weightValue}
                onChange={(e) => setWeightValue(e.target.value)}
                className="w-[72px] h-12 text-center text-xl font-bold font-mono bg-secondary border-border"
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-11 w-11 rounded-full flex-shrink-0"
                onClick={() => handleWeightChange(2.5)}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Reps */}
          <div className="text-center">
            <p className="text-xs text-muted-foreground mb-1">Повторы</p>
            <div className="flex items-center justify-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-11 w-11 rounded-full flex-shrink-0"
                onClick={() => handleRepsChange(-1)}
              >
                <Minus className="h-4 w-4" />
              </Button>
              <Input
                type="text"
                inputMode="numeric"
                value={repsValue}
                onChange={(e) => setRepsValue(e.target.value)}
                className="w-[72px] h-12 text-center text-xl font-bold font-mono bg-secondary border-border"
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-11 w-11 rounded-full flex-shrink-0"
                onClick={() => handleRepsChange(1)}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Set Complete Button */}
        <div className="flex justify-center mb-4">
          <button
            onClick={handleSetCompleted}
            className="flex items-center justify-center gap-2 h-11 px-6 max-w-[200px] rounded-lg bg-secondary border border-accent/30 hover:border-accent hover:bg-accent/10 transition-all active:scale-[0.98]"
          >
            <Check className="h-4 w-4 text-accent flex-shrink-0" />
            <span className="text-sm font-medium text-foreground">
              Подход {currentSet.set_index}
            </span>
          </button>
        </div>

        {/* RPE Selector */}
        <div>
          <p className="text-xs text-muted-foreground mb-2 text-center">RPE (усилие)</p>
          <div className="flex justify-between gap-1">
            {rpeDisplayScale.map((rpe) => (
              <button
                key={rpe}
                onClick={() => handleRpeChange(rpe)}
                className={`flex-1 min-h-[44px] rounded-md font-mono font-bold text-sm transition-colors ${
                  currentSet?.rpe === rpe
                    ? "bg-primary text-primary-foreground"
                    : rpe >= 9
                    ? "bg-destructive/20 text-destructive hover:bg-destructive/30"
                    : rpe >= 7
                    ? "bg-accent/20 text-accent hover:bg-accent/30"
                    : "bg-secondary text-muted-foreground hover:bg-secondary/80"
                }`}
              >
                {rpe}
              </button>
            ))}
          </div>
        </div>
      </Card>
    </motion.div>
  )
}
