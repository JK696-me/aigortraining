import { useState, useSyncExternalStore, useCallback } from 'react'
import { Bug, Copy, Check, Trash2, X, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  getTraceEvents,
  subscribeTrace,
  exportTraceText,
  clearTraceEvents,
  isDevTraceEnabled,
  TraceEvent,
} from '@/lib/devTraceStore'

function useTraceEvents(): TraceEvent[] {
  return useSyncExternalStore(subscribeTrace, getTraceEvents)
}

function useTraceEnabled(): boolean {
  return useSyncExternalStore(
    subscribeTrace,
    isDevTraceEnabled
  )
}

export function DevTracePanel() {
  const enabled = useTraceEnabled()
  const events = useTraceEvents()
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(exportTraceText())
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [])

  if (!enabled) return null

  // Collapsed: small floating badge
  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="fixed bottom-20 right-3 z-50 flex items-center gap-1.5 rounded-full bg-card border border-border px-3 py-1.5 shadow-lg text-xs font-mono text-foreground"
      >
        <Bug className="h-3.5 w-3.5 text-primary" />
        <span>{events.length}</span>
        <ChevronUp className="h-3 w-3" />
      </button>
    )
  }

  return (
    <div className="fixed bottom-20 right-2 left-2 z-50 max-h-[50vh] flex flex-col rounded-lg border border-border bg-card shadow-xl sm:left-auto sm:w-[420px]">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
          <Bug className="h-4 w-4 text-primary" />
          Save Trace ({events.length})
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleCopy}>
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={clearTraceEvents}>
            <Trash2 className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setExpanded(false)}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Events */}
      <div className="flex-1 overflow-y-auto px-2 py-1 text-[10px] font-mono leading-relaxed text-foreground/80">
        {events.length === 0 && (
          <p className="text-center text-muted-foreground py-4">Нет событий</p>
        )}
        {events.map(e => (
          <div key={e.id} className="py-1 border-b border-border/50">
            <span className="text-muted-foreground">{e.ts.slice(11, 23)}</span>{' '}
            <span className={
              e.type === 'SET_CHANGE' ? 'text-blue-400' :
              e.type === 'EXERCISE_REPLACE' ? 'text-amber-400' :
              'text-emerald-400'
            }>
              {e.type}
            </span>{' '}
            {e.type === 'SET_CHANGE' && (
              <>
                idx={e.set_index}{' '}
                {JSON.stringify(e.payload)}{' '}
                cache={e.local_cache_applied ? '✓' : '✗'}{' '}
                db={e.db_write_result}{' '}
                {e.outbox_queued && 'outbox=✓'}
              </>
            )}
            {e.type === 'EXERCISE_REPLACE' && (
              <>
                {e.old_exercise_id.slice(0, 8)}→{e.new_exercise_id.slice(0, 8)}{' '}
                sets: {e.set_ids_before.length}→{e.set_ids_after.length}
              </>
            )}
            {e.type === 'WORKOUT_COMPLETE' && (
              <>
                cache={e.count_sets_in_cache}{' '}
                upserted={e.count_sets_upserted}{' '}
                rpe={e.includes_rpe_field ? '✓' : '✗'}{' '}
                {e.db_result}
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
