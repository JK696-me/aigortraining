/**
 * Dev Mode Save Trace — global event store (max 300 events).
 * Toggle persisted in localStorage. Events are in-memory only.
 */

export interface TraceEventBase {
  id: string
  ts: string
  type: 'SET_CHANGE' | 'EXERCISE_REPLACE' | 'WORKOUT_COMPLETE'
}

export interface SetChangeTrace extends TraceEventBase {
  type: 'SET_CHANGE'
  active_session_id: string
  session_exercise_id: string
  set_id: string
  set_index: number
  payload: {
    weight?: number
    reps?: number
    rpe?: number | null
    is_completed?: boolean
  }
  local_cache_applied: boolean
  db_write_attempted: boolean
  db_write_result: 'ok' | 'error' | 'pending'
  db_error_message?: string
  outbox_queued: boolean
}

export interface ExerciseReplaceTrace extends TraceEventBase {
  type: 'EXERCISE_REPLACE'
  session_id: string
  session_exercise_id: string
  old_exercise_id: string
  new_exercise_id: string
  set_ids_before: string[]
  set_ids_after: string[]
  active_set_id: string | null
}

export interface WorkoutCompleteTrace extends TraceEventBase {
  type: 'WORKOUT_COMPLETE'
  session_id: string
  count_sets_in_cache: number
  count_sets_upserted: number
  includes_rpe_field: boolean
  db_result: 'ok' | 'error' | 'offline'
  outbox_queued: boolean
}

export type TraceEvent = SetChangeTrace | ExerciseReplaceTrace | WorkoutCompleteTrace

const STORAGE_KEY = 'dev_trace_enabled'
const MAX_EVENTS = 300

let _enabled = typeof window !== 'undefined' && localStorage.getItem(STORAGE_KEY) === 'true'
let _events: TraceEvent[] = []
let _listeners: Array<() => void> = []

function notify() {
  for (const fn of _listeners) fn()
}

export function isDevTraceEnabled(): boolean {
  return _enabled
}

export function setDevTraceEnabled(val: boolean) {
  _enabled = val
  localStorage.setItem(STORAGE_KEY, val ? 'true' : 'false')
  notify()
}

export function pushTraceEvent(event: Omit<SetChangeTrace, 'id' | 'ts'> | Omit<ExerciseReplaceTrace, 'id' | 'ts'> | Omit<WorkoutCompleteTrace, 'id' | 'ts'>) {
  if (!_enabled) return
  const full = {
    ...event,
    id: crypto.randomUUID(),
    ts: new Date().toISOString(),
  } as TraceEvent
  _events = [full, ..._events].slice(0, MAX_EVENTS)
  if (import.meta.env.DEV) {
    console.log(`%c[TRACE:${full.type}]`, 'color:#0f0;font-weight:bold', full)
  }
  notify()
}

export function getTraceEvents(): TraceEvent[] {
  return _events
}

export function clearTraceEvents() {
  _events = []
  notify()
}

export function subscribeTrace(fn: () => void): () => void {
  _listeners.push(fn)
  return () => {
    _listeners = _listeners.filter(l => l !== fn)
  }
}

export function exportTraceText(): string {
  return _events.map(e => {
    const base = `[${e.ts}] ${e.type}`
    if (e.type === 'SET_CHANGE') {
      const s = e as SetChangeTrace
      return `${base} | session=${s.active_session_id} se=${s.session_exercise_id} set=${s.set_id} idx=${s.set_index} | payload=${JSON.stringify(s.payload)} | cache=${s.local_cache_applied} db=${s.db_write_attempted}/${s.db_write_result}${s.db_error_message ? ' err=' + s.db_error_message : ''} outbox=${s.outbox_queued}`
    }
    if (e.type === 'EXERCISE_REPLACE') {
      const r = e as ExerciseReplaceTrace
      return `${base} | session=${r.session_id} se=${r.session_exercise_id} | ${r.old_exercise_id} → ${r.new_exercise_id} | before=[${r.set_ids_before.join(',')}] after=[${r.set_ids_after.join(',')}] active=${r.active_set_id}`
    }
    if (e.type === 'WORKOUT_COMPLETE') {
      const c = e as WorkoutCompleteTrace
      return `${base} | session=${c.session_id} | cache=${c.count_sets_in_cache} upserted=${c.count_sets_upserted} rpe=${c.includes_rpe_field} result=${c.db_result} outbox=${c.outbox_queued}`
    }
    return `${base} | ${JSON.stringify(e)}`
  }).join('\n')
}
