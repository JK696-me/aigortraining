import { LucideIcon } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface EmptyStateAction {
  label: string
  onClick: () => void
  variant?: 'default' | 'secondary' | 'outline' | 'ghost'
  icon?: LucideIcon
}

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description: string
  actions?: EmptyStateAction[]
  className?: string
}

export function EmptyState({ icon: Icon, title, description, actions, className = '' }: EmptyStateProps) {
  return (
    <Card className={`p-8 bg-card border-border text-center ${className}`}>
      <div className="w-16 h-16 rounded-full bg-secondary mx-auto mb-4 flex items-center justify-center">
        <Icon className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="font-semibold text-foreground mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground mb-4 max-w-sm mx-auto">{description}</p>
      {actions && actions.length > 0 && (
        <div className="flex flex-col sm:flex-row gap-2 justify-center">
          {actions.map((action, index) => {
            const ActionIcon = action.icon
            return (
              <Button
                key={index}
                variant={action.variant || 'default'}
                onClick={action.onClick}
                className={index === 0 ? '' : ''}
              >
                {ActionIcon && <ActionIcon className="h-4 w-4 mr-2" />}
                {action.label}
              </Button>
            )
          })}
        </div>
      )}
    </Card>
  )
}
