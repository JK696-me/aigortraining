import { useSync } from '@/contexts/SyncContext'
import { useLanguage } from '@/contexts/LanguageContext'
import { Cloud, CloudOff, RefreshCw, Check, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function GlobalSyncIndicator() {
  const { state, retryFailed, processSyncQueue } = useSync()
  const { locale } = useLanguage()
  const t = translations[locale]

  const handleRetry = async () => {
    await retryFailed()
    await processSyncQueue()
  }

  // Determine status
  const getStatus = () => {
    if (!state.isOnline) {
      return 'offline'
    }
    if (state.syncingCount > 0) {
      return 'syncing'
    }
    if (state.failedCount > 0) {
      return 'failed'
    }
    if (state.pendingCount > 0) {
      return 'pending'
    }
    return 'synced'
  }

  const status = getStatus()

  // Don't show if everything is synced and online
  if (status === 'synced' && state.isOnline) {
    return null
  }

  return (
    <div
      className={cn(
        'flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all',
        status === 'synced' && 'bg-green-500/10 text-green-600',
        status === 'pending' && 'bg-yellow-500/10 text-yellow-600',
        status === 'syncing' && 'bg-blue-500/10 text-blue-600',
        status === 'failed' && 'bg-destructive/10 text-destructive',
        status === 'offline' && 'bg-muted text-muted-foreground'
      )}
    >
      {status === 'synced' && (
        <>
          <Check className="h-3.5 w-3.5" />
          <span>{t.synced}</span>
        </>
      )}

      {status === 'pending' && (
        <>
          <CloudOff className="h-3.5 w-3.5" />
          <span>{t.savedLocally}</span>
        </>
      )}

      {status === 'syncing' && (
        <>
          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          <span>{t.syncing}</span>
        </>
      )}

      {status === 'failed' && (
        <>
          <AlertCircle className="h-3.5 w-3.5" />
          <span>{t.syncError}</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-5 px-2 text-xs"
            onClick={handleRetry}
          >
            {t.retry}
          </Button>
        </>
      )}

      {status === 'offline' && (
        <>
          <CloudOff className="h-3.5 w-3.5" />
          <span>{t.offline}</span>
        </>
      )}
    </div>
  )
}

// Compact version for tight spaces
export function GlobalSyncIndicatorCompact() {
  const { state, retryFailed } = useSync()

  const getStatusIcon = () => {
    if (!state.isOnline) {
      return <CloudOff className="h-4 w-4 text-muted-foreground" />
    }
    if (state.syncingCount > 0) {
      return <RefreshCw className="h-4 w-4 text-blue-500 animate-spin" />
    }
    if (state.failedCount > 0) {
      return (
        <button onClick={() => retryFailed()}>
          <AlertCircle className="h-4 w-4 text-destructive" />
        </button>
      )
    }
    if (state.pendingCount > 0) {
      return <Cloud className="h-4 w-4 text-yellow-500" />
    }
    return <Cloud className="h-4 w-4 text-green-500" />
  }

  return <div className="flex items-center">{getStatusIcon()}</div>
}

const translations = {
  ru: {
    synced: 'Сохранено',
    savedLocally: 'Сохранено локально',
    syncing: 'Синхронизация…',
    syncError: 'Ошибка синхронизации',
    retry: 'Повторить',
    offline: 'Нет сети',
  },
  en: {
    synced: 'Saved',
    savedLocally: 'Saved locally',
    syncing: 'Syncing…',
    syncError: 'Sync error',
    retry: 'Retry',
    offline: 'Offline',
  },
}
