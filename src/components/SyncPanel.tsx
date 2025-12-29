import { useState, useEffect } from 'react'
import { RefreshCw, AlertCircle, Cloud, CloudOff, Loader2, ChevronDown, ChevronUp, RotateCcw } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useSync } from '@/contexts/SyncContext'
import { syncEngine, SyncOperation } from '@/lib/offlineSyncEngine'
import { cn } from '@/lib/utils'

const ENTITY_LABELS: Record<string, string> = {
  sessions: 'Тренировки',
  session_exercises: 'Упражнения в тренировке',
  sets: 'Подходы',
  workout_templates: 'Шаблоны',
  template_items: 'Упражнения в шаблонах',
  exercise_state: 'Состояние упражнений',
  exercises: 'Упражнения',
  health_entries: 'Записи здоровья',
  health_attachments: 'Файлы здоровья',
}

const ACTION_LABELS: Record<string, string> = {
  create: 'Создание',
  update: 'Обновление',
  delete: 'Удаление',
}

export function SyncPanel() {
  const { state, retryFailed, processSyncQueue } = useSync()
  const [operations, setOperations] = useState<SyncOperation[]>([])
  const [isExpanded, setIsExpanded] = useState(false)
  const [isRetrying, setIsRetrying] = useState(false)

  useEffect(() => {
    const loadOperations = async () => {
      const ops = await syncEngine.getAllOperations()
      setOperations(ops)
    }
    loadOperations()
  }, [state])

  const handleRetryAll = async () => {
    setIsRetrying(true)
    await retryFailed()
    setIsRetrying(false)
  }

  const handleRetryOne = async (opId: string) => {
    await syncEngine.retryOperation(opId)
    await processSyncQueue()
  }

  const queuedOps = operations.filter(op => op.status === 'queued')
  const syncingOps = operations.filter(op => op.status === 'syncing')
  const failedOps = operations.filter(op => op.status === 'failed')

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'queued':
        return <Badge variant="secondary" className="bg-amber-500/10 text-amber-600">В очереди</Badge>
      case 'syncing':
        return <Badge variant="secondary" className="bg-blue-500/10 text-blue-600">Синхронизация</Badge>
      case 'failed':
        return <Badge variant="destructive">Ошибка</Badge>
      default:
        return <Badge variant="outline">Синхронизировано</Badge>
    }
  }

  return (
    <Card className="bg-card border-border overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center justify-between p-4 w-full"
      >
        <div className="flex items-center gap-3">
          {state.isOnline ? (
            <Cloud className="h-5 w-5 text-muted-foreground" />
          ) : (
            <CloudOff className="h-5 w-5 text-amber-500" />
          )}
          <div className="text-left">
            <span className="font-medium text-foreground block">Синхронизация</span>
            <span className="text-xs text-muted-foreground">
              {!state.isOnline && 'Офлайн • '}
              {state.pendingCount > 0 && `${state.pendingCount} в очереди • `}
              {state.syncingCount > 0 && `${state.syncingCount} синхр. • `}
              {state.failedCount > 0 && `${state.failedCount} ошибок`}
              {state.pendingCount === 0 && state.failedCount === 0 && state.syncingCount === 0 && 'Всё синхронизировано'}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {state.failedCount > 0 && (
            <AlertCircle className="h-5 w-5 text-destructive" />
          )}
          {isExpanded ? (
            <ChevronUp className="h-5 w-5 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-5 w-5 text-muted-foreground" />
          )}
        </div>
      </button>

      {isExpanded && (
        <div className="border-t border-border p-4 space-y-4">
          {/* Status summary */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="p-2 rounded-lg bg-amber-500/10">
              <div className="text-lg font-semibold text-amber-600">{state.pendingCount}</div>
              <div className="text-xs text-muted-foreground">В очереди</div>
            </div>
            <div className="p-2 rounded-lg bg-blue-500/10">
              <div className="text-lg font-semibold text-blue-600">{state.syncingCount}</div>
              <div className="text-xs text-muted-foreground">Синхр.</div>
            </div>
            <div className="p-2 rounded-lg bg-destructive/10">
              <div className="text-lg font-semibold text-destructive">{state.failedCount}</div>
              <div className="text-xs text-muted-foreground">Ошибок</div>
            </div>
          </div>

          {/* Actions */}
          {state.failedCount > 0 && (
            <Button
              onClick={handleRetryAll}
              disabled={isRetrying}
              variant="outline"
              className="w-full"
            >
              {isRetrying ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Повторить всё ({state.failedCount})
            </Button>
          )}

          {/* Failed operations list */}
          {failedOps.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground">Ошибки синхронизации</h4>
              {failedOps.map((op) => (
                <div
                  key={op.op_id}
                  className="p-3 rounded-lg bg-destructive/5 border border-destructive/20 space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-medium text-sm">
                        {ACTION_LABELS[op.action] || op.action}: {ENTITY_LABELS[op.entity] || op.entity}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Попытка {op.retries} из 5
                      </div>
                    </div>
                    {getStatusBadge(op.status)}
                  </div>
                  {op.last_error && (
                    <div className="text-xs text-destructive bg-destructive/10 p-2 rounded">
                      {op.last_error}
                    </div>
                  )}
                  <Button
                    onClick={() => handleRetryOne(op.op_id)}
                    size="sm"
                    variant="outline"
                    className="w-full"
                  >
                    <RotateCcw className="h-3 w-3 mr-1" />
                    Повторить
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Queued operations */}
          {queuedOps.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground">В очереди</h4>
              {queuedOps.slice(0, 5).map((op) => (
                <div
                  key={op.op_id}
                  className="p-2 rounded-lg bg-muted/50 flex items-center justify-between"
                >
                  <div className="text-sm">
                    {ACTION_LABELS[op.action] || op.action}: {ENTITY_LABELS[op.entity] || op.entity}
                  </div>
                  {getStatusBadge(op.status)}
                </div>
              ))}
              {queuedOps.length > 5 && (
                <div className="text-xs text-muted-foreground text-center">
                  ...и ещё {queuedOps.length - 5}
                </div>
              )}
            </div>
          )}

          {/* Last sync time */}
          {state.lastSyncAt && (
            <div className="text-xs text-muted-foreground text-center">
              Последняя синхронизация: {new Date(state.lastSyncAt).toLocaleTimeString()}
            </div>
          )}
        </div>
      )}
    </Card>
  )
}
