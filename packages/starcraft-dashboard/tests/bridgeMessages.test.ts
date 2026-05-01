import { describe, expect, it } from 'vitest'

import { deltaPayloadFromBridgeMessage } from '../src/viewer/bridgeMessages'

describe('deltaPayloadFromBridgeMessage', () => {
  it('extracts nested delta from bridge broadcast shape', () => {
    const msg = {
      type: 'delta',
      delta: {
        added: [{ id: 'a', scType: 'Marine' }],
        removed: ['b'],
        updated: [{ id: 'c', scType: 'SCV' }],
        moved: [{ id: 'd', x: 1, y: 2, z: 3 }],
      },
      entities: [],
      timestamp: 1,
    }
    const d = deltaPayloadFromBridgeMessage(msg)
    expect(d).toEqual({
      added: [{ id: 'a', scType: 'Marine' }],
      removed: ['b'],
      updated: [{ id: 'c', scType: 'SCV' }],
      moved: [{ id: 'd', x: 1, y: 2, z: 3 }],
    })
  })

  it('returns null for non-delta messages', () => {
    expect(deltaPayloadFromBridgeMessage({ type: 'snapshot', entities: [] })).toBeNull()
    expect(deltaPayloadFromBridgeMessage(null)).toBeNull()
  })

  it('accepts flat legacy delta shape', () => {
    const d = deltaPayloadFromBridgeMessage({
      type: 'delta',
      added: [],
      removed: ['x'],
      updated: [],
      moved: [],
    })
    expect(d).toEqual({ added: [], removed: ['x'], updated: [], moved: [] })
  })
})
