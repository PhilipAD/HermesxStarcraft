import type { Delta } from './store'

/**
 * The bridge server broadcasts `{ type: 'delta', delta: { added, ... } }`.
 * Older clients incorrectly passed the whole message into `applyDelta`,
 * which never matched the Delta shape and silently dropped all live updates.
 */
export function deltaPayloadFromBridgeMessage(msg: unknown): Delta | null {
  if (!msg || typeof msg !== 'object') return null
  const m = msg as Record<string, unknown>
  if (m.type !== 'delta') return null

  const inner = m.delta
  if (inner && typeof inner === 'object') {
    const d = inner as Record<string, unknown>
    return {
      added: Array.isArray(d.added) ? d.added : [],
      removed: Array.isArray(d.removed) ? d.removed : [],
      updated: Array.isArray(d.updated) ? d.updated : [],
      moved: Array.isArray(d.moved) ? d.moved : [],
    }
  }

  return {
    added: Array.isArray(m.added) ? m.added : [],
    removed: Array.isArray(m.removed) ? m.removed : [],
    updated: Array.isArray(m.updated) ? m.updated : [],
    moved: Array.isArray(m.moved) ? m.moved : [],
  }
}
