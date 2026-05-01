import { describe, expect, it } from 'vitest'

import { displayScTypeName, prettifyScTypeId } from '../src/viewer/race-mapping'
import { entityScTypeDisplay } from '../src/viewer/entityDisplay'
import type { Entity } from '../src/viewer/store'

describe('displayScTypeName', () => {
  it('maps Terran internal types to Zerg names with spacing', () => {
    expect(displayScTypeName('Marine', 'zerg')).toBe('Zergling')
    expect(displayScTypeName('Refinery', 'zerg')).toBe('Extractor')
    expect(displayScTypeName('Barracks', 'zerg')).toBe('Spawning Pool')
  })

  it('maps Terran internal types to Protoss names with spacing', () => {
    expect(displayScTypeName('Marine', 'protoss')).toBe('Zealot')
    expect(displayScTypeName('Refinery', 'protoss')).toBe('Assimilator')
    expect(displayScTypeName('Barracks', 'protoss')).toBe('Gateway')
  })

  it('keeps Terran ids as prettified labels', () => {
    expect(displayScTypeName('CommandCenter', 'terran')).toBe('Command Center')
  })

  it('uses tier for CommandCenter on non-Terran races', () => {
    expect(displayScTypeName('CommandCenter', 'zerg', 1)).toBe('Hatchery')
    expect(displayScTypeName('CommandCenter', 'zerg', 2)).toBe('Lair')
    expect(displayScTypeName('CommandCenter', 'zerg', 3)).toBe('Hive')
  })
})

describe('prettifyScTypeId', () => {
  it('inserts spaces before inner capitals', () => {
    expect(prettifyScTypeId('SpawningPool')).toBe('Spawning Pool')
  })
})

describe('entityScTypeDisplay', () => {
  it('prettifies when race is not yet selected', () => {
    const e = { id: 'x', scType: 'SupplyDepot' } as Pick<Entity, 'id' | 'scType'>
    expect(entityScTypeDisplay(e, null)).toBe('Supply Depot')
  })

  it('uses race mapping when race is set', () => {
    const e = { id: 'x', scType: 'SupplyDepot' } as Pick<Entity, 'id' | 'scType'>
    expect(entityScTypeDisplay(e, 'zerg')).toBe('Overlord')
  })
})
