/**
 * DeltaEngine — Computes minimal deltas between entity snapshots.
 * 
 * Only sends what changed: new entities, removed IDs, updated properties,
 * and position changes. This keeps WebSocket payloads tiny.
 */

import type { Entity, Delta } from './index.js'

export class DeltaEngine {
  private entityMap = new Map<string, Entity>()
  private tickCount = 0

  computeDelta(old: Entity[], fresh: Entity[]): Delta {
    const oldMap = new Map(old.map(e => [e.id, e]))
    const freshMap = new Map(fresh.map(e => [e.id, e]))

    const added: Entity[] = []
    const removed: string[] = []
    const updated: Entity[] = []
    const moved: { id: string; x: number; y: number; z: number }[] = []

    // Find added and updated
    for (const [id, entity] of freshMap) {
      const oldEntity = oldMap.get(id)
      if (!oldEntity) {
        added.push(entity)
      } else {
        const changes = this.diffEntities(oldEntity, entity)
        if (changes.length > 0) {
          updated.push(entity)
          // Check for position changes
          if (Math.abs(oldEntity.x - entity.x) > 0.1 ||
              Math.abs(oldEntity.y - entity.y) > 0.1 ||
              Math.abs(oldEntity.z - entity.z) > 0.1) {
            moved.push({ id, x: entity.x, y: entity.y, z: entity.z })
          }
        }
      }
    }

    // Find removed
    for (const id of oldMap.keys()) {
      if (!freshMap.has(id)) {
        removed.push(id)
      }
    }

    // Age all entities
    this.tickCount++
    for (const entity of fresh) {
      entity.age = (this.entityMap.get(entity.id)?.age || 0) + 1
    }

    return { added, removed, updated, moved }
  }

  private diffEntities(old: Entity, fresh: Entity): string[] {
    const changes: string[] = []
    
    const fields: (keyof Entity)[] = [
      'label', 'tooltip', 'health', 'maxHealth', 'activity',
      'color', 'emissive', 'scale', 'tier', 'x', 'y', 'z'
    ]

    for (const field of fields) {
      if (JSON.stringify(old[field]) !== JSON.stringify(fresh[field])) {
        changes.push(field)
      }
    }

    return changes
  }

  hasChanges(delta: Delta): boolean {
    return delta.added.length > 0 ||
           delta.removed.length > 0 ||
           delta.updated.length > 0 ||
           delta.moved.length > 0
  }

  getSnapshotSize(entities: Entity[]): number {
    return JSON.stringify(entities).length
  }
}
