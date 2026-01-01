import { motion } from 'framer-motion'
import { Check, Minus, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

export function TourDemoWorkout() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="w-full max-w-sm"
    >
      <Card className="bg-card border-border p-4 space-y-4">
        {/* Exercise header */}
        <div className="text-center">
          <h4 className="font-semibold text-foreground text-lg">Жим штанги лёжа</h4>
          <p className="text-sm text-muted-foreground">Подход 2 из 3</p>
        </div>

        {/* Weight input */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-muted-foreground">Вес (кг)</label>
          <div className="flex items-center justify-center gap-4">
            <Button variant="outline" size="icon" className="h-12 w-12 rounded-full">
              <Minus className="h-5 w-5" />
            </Button>
            <div className="text-4xl font-bold text-foreground w-24 text-center">
              60
            </div>
            <Button variant="outline" size="icon" className="h-12 w-12 rounded-full">
              <Plus className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* Reps input */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-muted-foreground">Повторы</label>
          <div className="flex items-center justify-center gap-4">
            <Button variant="outline" size="icon" className="h-10 w-10 rounded-full">
              <Minus className="h-4 w-4" />
            </Button>
            <div className="text-3xl font-bold text-foreground w-16 text-center">
              8
            </div>
            <Button variant="outline" size="icon" className="h-10 w-10 rounded-full">
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* RPE slider mock */}
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <label className="text-sm font-medium text-muted-foreground">RPE (усилие)</label>
            <span className="text-sm font-semibold text-primary">8</span>
          </div>
          <div className="h-2 bg-secondary rounded-full overflow-hidden">
            <div className="h-full w-4/5 bg-primary rounded-full" />
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Легко</span>
            <span>Максимум</span>
          </div>
        </div>

        {/* Complete button */}
        <Button className="w-full h-14 text-lg font-semibold" size="lg">
          <Check className="h-5 w-5 mr-2" />
          Подход выполнен
        </Button>
      </Card>
    </motion.div>
  )
}
