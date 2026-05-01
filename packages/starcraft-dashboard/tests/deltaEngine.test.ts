import { describe, expect, it } from 'vitest'

import { DeltaEngine } from '../server/deltaEngine'
import type { Entity } from '../server/index'

function baseEntity(overrides: Partial<Entity> = {}): Entity {
  return {
    id: 'e1',
    type: 't',
    scType: 'Marine',
    cluster: 'combat',
    label: 'old-label',
    tooltip: 'old-tip',
    x: 10,
    y: 0,
    z: 20,
    health: 40,
    maxHealth: 40,
    activity: 'idle',
    color: 1,
    emissive: 2,
    scale: [1, 1, 1],
    clickAction: '',
    data: {},
    tier: 0,
    age: 0,
    ...overrides,
  }
}

describe('DeltaEngine', () => {
  it('does not emit updates for label or tooltip-only changes', () => {
    const engine = new DeltaEngine()
    const oldList = [baseEntity({ id: 'x', label: 'a', tooltip: 't1' })]
    const newList = [baseEntity({ id: 'x', label: 'b', tooltip: 't2' })]
    const d = engine.computeDelta(oldList, newList)
    expect(d.updated).toHaveLength(0)
    expect(d.moved).toHaveLength(0)
  })

  it('still emits updates when placement or activity fields change', () => {
    const engine = new DeltaEngine()
    const oldList = [baseEntity({ id: 'x', activity: 'idle', x: 0 })]
    const newList = [baseEntity({ id: 'x', activity: 'patrol', x: 5 })]
    const d = engine.computeDelta(oldList, newList)
    expect(d.updated).toHaveLength(1)
    expect(d.moved.length).toBeGreaterThanOrEqual(1)
  })
})
