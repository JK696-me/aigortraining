export interface SessionOutboxItem {
  id: string
  type: SessionOutboxItemType
  payload: Record<string, unknown>
  created_at: string
}

export type SessionOutboxItemType =
  | 'TOUCH_SESSION_ACTIVITY'
  | 'AUTO_COMPLETE_SESSION'

const OUTBOX_KEY = 'session_outbox_v1'

export function getSessionOutbox(): SessionOutboxItem[] {
  try {
    const raw = localStorage.getItem(OUTBOX_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed as SessionOutboxItem[]
  } catch {
    return []
  }
}

export function setSessionOutbox(items: SessionOutboxItem[]) {
  localStorage.setItem(OUTBOX_KEY, JSON.stringify(items))
}

export function enqueueSessionOutboxItem({
  type,
  payload,
}: {
  type: SessionOutboxItemType
  payload: Record<string, unknown>
}): SessionOutboxItem {
  const item: SessionOutboxItem = {
    id: crypto.randomUUID(),
    type,
    payload,
    created_at: new Date().toISOString(),
  }

  const items = getSessionOutbox()
  setSessionOutbox([...items, item])
  return item
}

export function removeSessionOutboxItem(itemId: string) {
  const items = getSessionOutbox()
  setSessionOutbox(items.filter(i => i.id !== itemId))
}
