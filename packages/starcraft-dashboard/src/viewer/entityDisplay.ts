import type { Entity } from './store'

type EntityDisplayParts = Pick<Entity, 'id' | 'label' | 'scType'> & { cluster?: string }

export function entityIconFor(entity: EntityDisplayParts): string {
  const text = `${entity.id} ${entity.label} ${entity.scType} ${entity.cluster ?? ''}`.toLowerCase()
  if (text.includes('cron')) return '⏱️'
  if (text.includes('skill')) return '🛠️'
  if (text.includes('dashboard')) return '📊'
  if (text.includes('chat') || text.includes('session')) return '💬'
  if (text.includes('subagent') || text.includes('agent')) return '🤖'
  if (text.includes('memory') || text.includes('wiki') || text.includes('docs')) return '📚'
  if (text.includes('monitor') || text.includes('intel') || text.includes('analytics')) return '🔎'
  if (text.includes('platform') || text.includes('integration')) return '🔌'
  if (text.includes('config') || text.includes('env') || text.includes('model')) return '⚙️'
  if (text.includes('supply')) return '📦'
  if (text.includes('worker') || text.includes('scv') || text.includes('drone') || text.includes('probe')) return '⛏️'
  return '◆'
}

export function entityDisplayLabel(entity: EntityDisplayParts): string {
  const label = entity.label || entity.id
  return label.startsWith(entityIconFor(entity)) ? label : `${entityIconFor(entity)} ${label}`
}
