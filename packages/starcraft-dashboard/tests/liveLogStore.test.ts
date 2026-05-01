/**
 * Live-log store regression test.
 *
 * Confirms that the dashboard store correctly tracks pending live deltas
 * for the "Reload Titan" affordance, logs every add / remove / update / move, and
 * resets the pending counter after a Titan sync OR when a fresh full
 * snapshot replaces the live entity set.
 */

import { describe, expect, it, beforeEach } from 'vitest'

import { useDashboardStore, type Entity } from '../src/viewer/store'

function makeEntity(overrides: Partial<Entity> = {}): Entity {
  return {
    id: 'e1',
    type: 'session',
    scType: 'Marine',
    cluster: 'combat',
    label: 'unit-1',
    tooltip: '',
    x: 0, y: 0, z: 0,
    health: 40, maxHealth: 40,
    activity: 'patrol',
    color: 0, emissive: 0,
    scale: [1, 1, 1],
    clickAction: '',
    data: {},
    tier: 1,
    age: 0,
    ...overrides,
  }
}

beforeEach(() => {
  useDashboardStore.setState({
    entities: new Map(),
    eventLog: [],
    eventLogPaused: false,
    pendingDeltaCount: 0,
    lastDeltaSummary: null,
  })
})

describe('TitanLiveLog store integration', () => {
  it('starts with no pending deltas (reload button must be disabled by default)', () => {
    const { pendingDeltaCount, lastDeltaSummary } = useDashboardStore.getState()
    expect(pendingDeltaCount).toBe(0)
    expect(lastDeltaSummary).toBeNull()
  })

  it('increments pendingDeltaCount and records the summary when a live delta arrives', () => {
    const { applyDelta } = useDashboardStore.getState()
    applyDelta({
      added: [makeEntity({ id: 'add-1' }), makeEntity({ id: 'add-2', label: 'unit-2' })],
      removed: ['rm-1'],
      updated: [],
      moved: [],
    })

    const state = useDashboardStore.getState()
    expect(state.pendingDeltaCount).toBe(3)
    expect(state.lastDeltaSummary).toMatchObject({ added: 2, removed: 1, updated: 0, moved: 0 })
    expect(state.lastDeltaSummary?.ts).toBeGreaterThan(0)
  })

  it('logs adds and removes with human-readable labels for the live-log window', () => {
    const { setEntities, applyDelta } = useDashboardStore.getState()
    setEntities([makeEntity({ id: 'rm-1', label: 'session marine' })])

    applyDelta({
      added: [makeEntity({ id: 'add-1', label: 'cron worker' })],
      removed: ['rm-1'],
      updated: [],
      moved: [],
    })

    const log = useDashboardStore.getState().eventLog
    const kinds = log.map(e => e.kind)
    expect(kinds).toContain('snapshot')
    expect(kinds).toContain('add')
    expect(kinds).toContain('remove')

    const addEvent = log.find(e => e.kind === 'add')!
    const removeEvent = log.find(e => e.kind === 'remove')!
    expect(addEvent.label).toContain('cron worker')
    expect(removeEvent.label).toContain('session marine')
  })

  it('keeps pendingDeltaCount stable when a delta arrives with zero changes', () => {
    const { applyDelta } = useDashboardStore.getState()
    applyDelta({ added: [], removed: [], updated: [], moved: [] })
    expect(useDashboardStore.getState().pendingDeltaCount).toBe(0)
    expect(useDashboardStore.getState().lastDeltaSummary).toBeNull()
  })

  it('markRefreshed resets pendingDeltaCount and lastDeltaSummary (reload button disables again after sync)', () => {
    const { applyDelta, markRefreshed } = useDashboardStore.getState()
    applyDelta({ added: [makeEntity({ id: 'a' })], removed: [], updated: [], moved: [] })
    expect(useDashboardStore.getState().pendingDeltaCount).toBeGreaterThan(0)

    markRefreshed()
    expect(useDashboardStore.getState().pendingDeltaCount).toBe(0)
    expect(useDashboardStore.getState().lastDeltaSummary).toBeNull()
  })

  it('subsequent deltas after markRefreshed re-enable the reload button', () => {
    const { applyDelta, markRefreshed } = useDashboardStore.getState()
    applyDelta({ added: [makeEntity({ id: 'a' })], removed: [], updated: [], moved: [] })
    markRefreshed()
    expect(useDashboardStore.getState().pendingDeltaCount).toBe(0)

    applyDelta({ added: [], removed: ['a'], updated: [], moved: [] })
    expect(useDashboardStore.getState().pendingDeltaCount).toBe(1)
    expect(useDashboardStore.getState().lastDeltaSummary).toMatchObject({ added: 0, removed: 1 })
  })

  it('full snapshot resets pendingDeltaCount (snapshot is authoritative)', () => {
    const { applyDelta, setEntities } = useDashboardStore.getState()
    applyDelta({
      added: [makeEntity({ id: 'a' }), makeEntity({ id: 'b' })],
      removed: [],
      updated: [],
      moved: [],
    })
    expect(useDashboardStore.getState().pendingDeltaCount).toBe(2)

    setEntities([makeEntity({ id: 'a' })])
    expect(useDashboardStore.getState().pendingDeltaCount).toBe(0)
    expect(useDashboardStore.getState().lastDeltaSummary).toBeNull()
  })

  it('event log is bounded and most-recent-wins (live log window does not grow unbounded)', () => {
    const { applyDelta } = useDashboardStore.getState()
    for (let i = 0; i < 200; i++) {
      applyDelta({
        added: [makeEntity({ id: `e-${i}`, label: `entity ${i}` })],
        removed: [],
        updated: [],
        moved: [],
      })
    }
    const log = useDashboardStore.getState().eventLog
    expect(log.length).toBeLessThanOrEqual(100)
    expect(log[log.length - 1].label).toBe('spawn entity 199')
  })

  it('paused log does not record new events but pending counter still tracks deltas', () => {
    const { toggleEventLogPaused, applyDelta } = useDashboardStore.getState()
    toggleEventLogPaused()
    applyDelta({ added: [makeEntity({ id: 'a' })], removed: [], updated: [], moved: [] })
    const state = useDashboardStore.getState()
    expect(state.eventLog.length).toBe(0)
    expect(state.pendingDeltaCount).toBe(1)
  })

  it('collapses six or more updates in one poll into one update_batch log line', () => {
    const { setEntities, applyDelta } = useDashboardStore.getState()
    const rows = Array.from({ length: 6 }, (_, i) => makeEntity({ id: `row-${i}`, label: `v0-${i}` }))
    setEntities(rows)
    useDashboardStore.setState({ eventLog: [] })

    applyDelta({
      added: [],
      removed: [],
      updated: rows.map((e, i) => ({ ...e, label: `v1-${i}` })),
      moved: [],
    })
    const log = useDashboardStore.getState().eventLog
    expect(log.filter(e => e.kind === 'update_batch')).toHaveLength(1)
    expect(log.filter(e => e.kind === 'update')).toHaveLength(0)
    expect(log.some(e => e.kind === 'update_batch' && e.label.includes('6 entity updates'))).toBe(true)
  })
})
