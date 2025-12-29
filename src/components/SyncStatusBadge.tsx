import { useEffect, useState } from 'react'
import { Cloud, CloudOff, Loader2, AlertCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { useSync, EntityType, OperationStatus } from '@/contexts/SyncContext'
import { cn } from '@/lib/utils'

interface SyncStatusBadgeProps {
  entity: EntityType
  localId: string
  className?: string
  showSynced?: boolean
}

export function SyncStatusBadge({ 
  entity, 
  localId, 
  className,
  showSynced = false 
}: SyncStatusBadgeProps) {
  const { getOperationStatus, state } = useSync()
  const [status, setStatus] = useState<OperationStatus | 'synced'>('synced')

  useEffect(() => {
    let mounted = true
    
    const checkStatus = async () => {
      const currentStatus = await getOperationStatus(entity, localId)
      if (mounted) {
        setStatus(currentStatus)
      }
    }

    checkStatus()
    
    return () => {
      mounted = false
    }
  }, [entity, localId, getOperationStatus, state])

  if (status === 'synced' && !showSynced) return null

  const config = {
    synced: {
      icon: Cloud,
      label: 'Синхронизировано',
      variant: 'outline' as const,
      className: 'text-muted-foreground border-muted',
    },
    queued: {
      icon: CloudOff,
      label: 'Локально',
      variant: 'secondary' as const,
      className: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
    },
    syncing: {
      icon: Loader2,
      label: 'Синхронизация...',
      variant: 'secondary' as const,
      className: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
    },
    failed: {
      icon: AlertCircle,
      label: 'Ошибка',
      variant: 'destructive' as const,
      className: 'bg-destructive/10 text-destructive border-destructive/20',
    },
  }

  const { icon: Icon, label, className: statusClassName } = config[status]

  return (
    <Badge 
      variant="outline" 
      className={cn(
        'text-xs font-normal gap-1 px-1.5 py-0.5',
        statusClassName,
        className
      )}
    >
      <Icon className={cn('h-3 w-3', status === 'syncing' && 'animate-spin')} />
      {label}
    </Badge>
  )
}

// Hook for checking sync status imperatively
export function useSyncStatus(entity: EntityType, localId: string) {
  const { getOperationStatus, state } = useSync()
  const [status, setStatus] = useState<OperationStatus | 'synced'>('synced')
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    
    const checkStatus = async () => {
      setIsLoading(true)
      const currentStatus = await getOperationStatus(entity, localId)
      if (mounted) {
        setStatus(currentStatus)
        setIsLoading(false)
      }
    }

    checkStatus()
    
    return () => {
      mounted = false
    }
  }, [entity, localId, getOperationStatus, state])

  return { status, isLoading, isSynced: status === 'synced' }
}
