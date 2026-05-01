import { useMemo, useState } from 'react'
import { useDashboardStore, type Entity } from '../store'
import { entityDisplayLabel } from '../entityDisplay'

/**
 * Hermes drill-down popup for clicked Titan units.
 *
 * Titan's WorldComposer emits a postMessage of the form
 *   { type: 'titan:selected-units', units: TitanSelectedUnit[] }
 * whenever the user clicks a unit / building / drags a selection box.
 *
 * The useful part is `hermesId`: every Hermes-spawned unit/building carries the
 * ID of the dashboard entity that created it. This panel resolves that ID back
 * into the live Hermes entity store and surfaces the real logs/config/session/
 * skill/env/analytics payloads carried by the mapper.
 */
export interface TitanSelectedUnit {
  id: number
  hermesId?: string | null
  typeId: number
  owner: number
  x: number
  y: number
  hp: number
  shields: number
  energy: number
  typeName: string | null
  isBuilding: boolean
  isResourceContainer: boolean
}

export interface TitanUnitInspectorProps {
  units: TitanSelectedUnit[]
  onClose: () => void
}

const HERMES_TYPE_HINTS: Record<string, string[]> = {
  CommandCenter: ['command_center', 'core_agent', 'CommandCenter'],
  TechBuilding: ['skill', 'TechBuilding'],
  SCV: ['worker', 'tool', 'SCV'],
  Marine: ['marine', 'session', 'Marine'],
  Refinery: ['refinery', 'cache', 'Refinery'],
  Barracks: ['barracks', 'queue', 'Barracks'],
  SupplyDepot: ['supply', 'memory', 'SupplyDepot'],
  Bunker: ['bunker', 'guard', 'Bunker'],
  MineralField: ['mineral', 'resource'],
  VespeneGeyser: ['vespene', 'fuel'],
}

type DisplayRow = { label: string; value: unknown }
type DisplaySection = { title: string; rows?: DisplayRow[]; lines?: string[]; json?: unknown }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const compact = (value: unknown): string => {
  if (value == null || value === '') return 'n/a'
  if (typeof value === 'number') return Number.isFinite(value) ? value.toLocaleString() : String(value)
  if (typeof value === 'boolean') return value ? 'yes' : 'no'
  if (Array.isArray(value)) return `${value.length} item${value.length === 1 ? '' : 's'}`
  if (typeof value === 'object') return `${Object.keys(value as Record<string, unknown>).length} field${Object.keys(value as Record<string, unknown>).length === 1 ? '' : 's'}`
  return String(value)
}

const fmtTime = (value: unknown): string => {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return 'n/a'
  const ms = n > 10_000_000_000 ? n : n * 1000
  try {
    return new Date(ms).toLocaleString()
  } catch {
    return String(value)
  }
}

const truncate = (value: unknown, max = 180): string => {
  const text = compact(value)
  return text.length > max ? `${text.slice(0, max - 1)}...` : text
}

const summarizeKeys = (value: unknown): string[] => {
  if (!isRecord(value)) return []
  return Object.keys(value).sort()
}

const topLogLines = (logs: unknown): string[] => {
  if (!isRecord(logs)) return []
  const lines: string[] = []
  for (const [name, log] of Object.entries(logs)) {
    if (!isRecord(log)) continue
    const rawLines = Array.isArray(log.lines) ? log.lines : []
    const recent = rawLines.slice(-6).map((line) => `[${name}] ${String(line)}`)
    lines.push(...recent)
  }
  return lines.slice(-12)
}

const makeSections = (entity: Entity | null): DisplaySection[] => {
  if (!entity) return []
  const data = entity.data || {}
  const sections: DisplaySection[] = []

  sections.push({
    title: 'Entity',
    rows: [
      { label: 'Hermes ID', value: entity.id },
      { label: 'Type', value: entity.type },
      { label: 'StarCraft type', value: entity.scType },
      { label: 'Cluster', value: entity.cluster },
      { label: 'Action', value: entity.clickAction },
      { label: 'Dashboard route', value: data.dashboardRoute },
      { label: 'Activity', value: entity.activity },
    ],
  })

  if (isRecord(data.session)) {
    sections.push({
      title: 'Session',
      rows: [
        { label: 'ID', value: data.session.id },
        { label: 'Title', value: data.session.title },
        { label: 'Source', value: data.session.source },
        { label: 'Model', value: data.session.model },
        { label: 'Messages', value: data.session.messageCount },
        { label: 'Tool calls', value: data.session.toolCallCount },
        { label: 'Input tokens', value: data.session.inputTokens },
        { label: 'Output tokens', value: data.session.outputTokens },
        { label: 'Cost', value: data.session.estimatedCost },
        { label: 'Started', value: fmtTime(data.session.startedAt) },
        { label: 'Last active', value: fmtTime(data.session.lastActive) },
      ],
    })
  }

  if (isRecord(data.job)) {
    sections.push({
      title: 'Cron Job',
      rows: [
        { label: 'ID', value: data.job.id },
        { label: 'Name', value: data.job.name },
        { label: 'Schedule', value: data.job.schedule },
        { label: 'Enabled', value: data.job.enabled },
        { label: 'State', value: data.job.state },
        { label: 'Runs', value: data.job.runCount },
        { label: 'Errors', value: data.job.errorCount },
        { label: 'Last run', value: fmtTime(data.job.lastRun) },
        { label: 'Next run', value: fmtTime(data.job.nextRun) },
        { label: 'Deliver', value: data.job.deliver },
        { label: 'Last error', value: data.job.lastError },
        { label: 'Prompt', value: data.job.prompt },
      ],
    })
  }

  if (isRecord(data.skill)) {
    sections.push({
      title: 'Skill',
      rows: [
        { label: 'Name', value: data.skill.name },
        { label: 'Category', value: data.skill.category },
        { label: 'Enabled', value: data.skill.enabled },
        { label: 'Description', value: data.skill.description },
        { label: 'Path', value: data.skill.path },
        { label: 'Size', value: data.skill.size },
        { label: 'Modified', value: fmtTime(data.skill.lastModified) },
      ],
    })
  }

  if (Array.isArray(data.skills)) {
    sections.push({
      title: `Skills (${data.skills.length})`,
      lines: data.skills.slice(0, 18).map((skill) => {
        if (!isRecord(skill)) return String(skill)
        return `${compact(skill.name)} - ${compact(skill.enabled)} - ${truncate(skill.description, 120)}`
      }),
    })
  }

  if (isRecord(data.config)) {
    sections.push({
      title: 'Config',
      rows: [
        { label: 'Agent', value: data.config.agentName },
        { label: 'Model', value: data.config.model },
        { label: 'Provider', value: data.config.provider },
        { label: 'Toolsets', value: Array.isArray(data.config.toolsets) ? data.config.toolsets.join(', ') : data.config.toolsets },
        { label: 'Gateway platforms', value: Array.isArray(data.config.gatewayPlatforms) ? data.config.gatewayPlatforms.join(', ') : data.config.gatewayPlatforms },
        { label: 'Max iterations', value: data.config.maxIterations },
        { label: 'Version', value: data.config.agentVersion },
      ],
    })
  }

  if (isRecord(data.stats)) {
    sections.push({
      title: 'Stats',
      rows: Object.entries(data.stats).map(([label, value]) => ({ label, value })),
    })
  }

  if (isRecord(data.status)) {
    sections.push({
      title: 'Dashboard Status',
      rows: Object.entries(data.status).slice(0, 20).map(([label, value]) => ({ label, value })),
    })
  }

  if (isRecord(data.env)) {
    const setEnv = Object.entries(data.env)
      .filter(([, info]) => isRecord(info) && info.is_set)
      .slice(0, 24)
      .map(([name, info]) => {
        const category = isRecord(info) ? compact(info.category) : 'setting'
        const value = isRecord(info) ? compact(info.redacted_value) : 'set'
        return `${name} (${category}) ${value}`
      })
    sections.push({
      title: `Environment (${setEnv.length} set shown)`,
      lines: setEnv.length ? setEnv : ['No set environment variables surfaced for this entity.'],
    })
  }

  if (Array.isArray(data.oauth)) {
    sections.push({
      title: `OAuth Providers (${data.oauth.length})`,
      lines: data.oauth.slice(0, 16).map((provider) => {
        if (!isRecord(provider)) return String(provider)
        return `${compact(provider.name || provider.id)} - ${compact(provider.flow)} - ${compact(provider.status)}`
      }),
    })
  }

  if (isRecord(data.analytics)) {
    sections.push({
      title: 'Analytics',
      rows: [
        { label: 'Period days', value: data.analytics.period_days },
        { label: 'Totals', value: data.analytics.totals },
        { label: 'Models', value: Array.isArray(data.analytics.by_model) ? data.analytics.by_model.length : 0 },
        { label: 'Top skills', value: isRecord(data.analytics.skills) && Array.isArray(data.analytics.skills.top_skills) ? data.analytics.skills.top_skills.length : 0 },
      ],
    })
  }

  if (isRecord(data.model)) {
    sections.push({
      title: 'Model Analytics',
      rows: Object.entries(data.model).slice(0, 18).map(([label, value]) => ({ label, value })),
    })
  }

  if (isRecord(data.logs)) {
    const severity = Object.values(data.logs).reduce<Record<string, number>>((acc, log) => {
      if (!isRecord(log) || !isRecord(log.severityCounts)) return acc
      for (const [k, v] of Object.entries(log.severityCounts)) acc[k] = (acc[k] || 0) + Number(v || 0)
      return acc
    }, {})
    sections.push({
      title: 'Logs',
      rows: [
        { label: 'Files', value: summarizeKeys(data.logs).join(', ') },
        { label: 'Severity counts', value: severity },
      ],
      lines: topLogLines(data.logs),
    })
  }

  if (Array.isArray(data.errors)) {
    sections.push({
      title: `Errors (${data.errors.length})`,
      lines: data.errors.slice(0, 12).map((error) => {
        if (!isRecord(error)) return String(error)
        return `${fmtTime(error.timestamp)} ${truncate(error.message, 170)}`
      }),
    })
  }

  if (isRecord(data.plugin)) {
    sections.push({
      title: 'Dashboard Plugin',
      rows: [
        { label: 'Name', value: data.plugin.name },
        { label: 'Label', value: data.plugin.label },
        { label: 'Description', value: data.plugin.description },
        { label: 'Version', value: data.plugin.version },
        { label: 'Route', value: isRecord(data.plugin.tab) ? data.plugin.tab.path : data.dashboardRoute },
      ],
    })
  }

  if (Array.isArray(data.platforms)) {
    sections.push({ title: `Platforms (${data.platforms.length})`, lines: data.platforms.map(String) })
  }

  if (Array.isArray(data.runningSubagents)) {
    sections.push({
      title: `Running Subagents (${data.runningSubagents.length})`,
      lines: data.runningSubagents.slice(0, 20).map((agent) => {
        if (!isRecord(agent)) return String(agent)
        return `${compact(agent.id)} - ${compact(agent.model)} - ${compact(agent.status)}`
      }),
    })
  }

  sections.push({
    title: 'Available Payload Keys',
    lines: summarizeKeys(data).map((key) => `${key}: ${compact(data[key])}`),
  })

  sections.push({
    title: 'Raw Entity Data',
    json: data,
  })

  return sections
}

const findFallbackEntities = (
  typeName: string,
  entities: Map<string, Entity>,
) => {
  const hints = HERMES_TYPE_HINTS[typeName] || [typeName]
  const out = []
  for (const e of entities.values()) {
    if (!e) continue
    for (const hint of hints) {
      const lc = hint.toLowerCase()
      if (
        e.scType === hint ||
        e.id.toLowerCase().includes(lc) ||
        e.type.toLowerCase().includes(lc) ||
        e.cluster.toLowerCase().includes(lc) ||
        (e.label || '').toLowerCase().includes(lc)
      ) {
        out.push(e)
        break
      }
    }
    if (out.length >= 8) break
  }
  return out
}

export function TitanUnitInspector({ units, onClose }: TitanUnitInspectorProps) {
  const entities = useDashboardStore((s) => s.entities)
  const [rawOpen, setRawOpen] = useState(false)
  const u = units?.[0] ?? null
  const typeName = u?.typeName || (u ? `Unit#${u.typeId}` : 'Unit')
  const entity = u?.hermesId ? entities.get(u.hermesId) ?? null : null
  const fallbackEntities = useMemo(
    () => (!u || entity ? [] : findFallbackEntities(typeName, entities)),
    [entity, entities, typeName, u],
  )
  const inspectedEntity = entity ?? fallbackEntities[0] ?? null
  const sections = useMemo(() => makeSections(inspectedEntity), [inspectedEntity])

  if (!u) return null

  return (
    <div
      data-testid="titan-unit-inspector"
      style={{
        position: 'fixed',
        left: 12,
        bottom: 12,
        width: 430,
        maxHeight: '72vh',
        background: 'rgba(4,12,24,0.92)',
        border: '1px solid #1e5a82',
        borderRadius: 4,
        color: '#bfe',
        fontFamily: '"Courier New", ui-monospace, monospace',
        fontSize: 11,
        zIndex: 1100,
        pointerEvents: 'auto',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 4px 24px rgba(0,0,0,0.7)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '6px 10px',
          background: 'rgba(10,30,50,0.85)',
          borderBottom: '1px solid #153a52',
        }}
      >
        <strong style={{ color: '#5cf', flex: 1, letterSpacing: 1 }}>
          HERMES DRILL-DOWN
        </strong>
        <button
          onClick={onClose}
          style={{
            background: 'transparent',
            color: '#9cf',
            border: '1px solid #1e5a82',
            padding: '1px 6px',
            cursor: 'pointer',
            fontFamily: 'inherit',
            fontSize: 10,
          }}
          aria-label="close inspector"
        >
          x
        </button>
      </div>

      <div style={{ padding: '8px 12px', display: 'grid', gap: 4 }}>
        <div style={{ color: '#fff', fontSize: 13, fontWeight: 'bold' }}>
          {inspectedEntity ? entityDisplayLabel(inspectedEntity) : typeName}
          {u.isBuilding ? ' (building)' : u.isResourceContainer ? ' (resource)' : ''}
        </div>
        {inspectedEntity ? (
          <div style={{ color: '#9cf' }}>
            {inspectedEntity.tooltip || 'Hermes-backed StarCraft entity'}
          </div>
        ) : (
          <div style={{ color: '#dd9b6c' }}>
            No Hermes entity ID was attached to this selected StarCraft object.
          </div>
        )}
        <div style={{ color: '#9cf' }}>
          SC ID <span style={{ color: '#fff' }}>{u.id}</span> · TypeID{' '}
          <span style={{ color: '#fff' }}>{u.typeId}</span> · Player{' '}
          <span style={{ color: '#fff' }}>{u.owner}</span>
        </div>
        <div style={{ color: '#9cf' }}>
          HP <span style={{ color: '#fff' }}>{u.hp}</span> · Shields{' '}
          <span style={{ color: '#fff' }}>{u.shields}</span> · Energy{' '}
          <span style={{ color: '#fff' }}>{u.energy}</span>
        </div>
        <div style={{ color: '#9cf' }}>
          POS{' '}
          <span style={{ color: '#fff' }}>
            ({u.x.toFixed(1)}, {u.y.toFixed(1)})
          </span>
        </div>
        {units.length > 1 && (
          <div style={{ color: '#888' }}>
            +{units.length - 1} more selected (click one to inspect)
          </div>
        )}
      </div>

      {fallbackEntities.length > 1 && (
        <div
          style={{
            borderTop: '1px solid #153a52',
            padding: '6px 12px',
            background: 'rgba(10,20,30,0.6)',
          }}
        >
          <div style={{ color: '#5cf', fontSize: 10, marginBottom: 4 }}>
            RELATED HERMES ENTITIES
          </div>
          {fallbackEntities.slice(1).map((e) => (
            <div
              key={e.id}
              title={e.tooltip}
              style={{
                color: '#cfe',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                fontSize: 10,
                padding: '2px 0',
              }}
            >
              <span style={{ color: '#7af' }}>[{e.scType}]</span> {entityDisplayLabel(e)}
            </div>
          ))}
        </div>
      )}

      {inspectedEntity && (
        <div style={{ overflow: 'auto', borderTop: '1px solid #153a52' }}>
          {sections.map((section) => {
            if (section.title === 'Raw Entity Data' && !rawOpen) {
              return (
                <button
                  key={section.title}
                  onClick={() => setRawOpen(true)}
                  style={sectionButtonStyle}
                >
                  show raw entity data
                </button>
              )
            }
            return (
              <div key={section.title} style={sectionStyle}>
                <div style={sectionTitleStyle}>{section.title}</div>
                {section.rows?.map((row) => (
                  <div key={`${section.title}-${row.label}`} style={rowStyle}>
                    <span style={{ color: '#7af' }}>{row.label}</span>
                    <span style={{ color: '#dff', textAlign: 'right', overflowWrap: 'anywhere' }}>
                      {truncate(row.value)}
                    </span>
                  </div>
                ))}
                {section.lines?.map((line, idx) => (
                  <div key={`${section.title}-line-${idx}`} style={lineStyle}>
                    {line}
                  </div>
                ))}
                {section.json !== undefined && (
                  <pre style={jsonStyle}>{JSON.stringify(section.json, null, 2)}</pre>
                )}
              </div>
            )
          })}
        </div>
      )}

      <div
        style={{
          padding: '4px 12px',
          color: '#666',
          fontSize: 9,
          borderTop: '1px solid #153a52',
        }}
      >
        Click units/buildings to inspect the Hermes entity they represent
      </div>
    </div>
  )
}

const sectionStyle = {
  padding: '8px 12px',
  borderBottom: '1px solid #0b2232',
  background: 'rgba(10,20,30,0.38)',
}

const sectionTitleStyle = {
  color: '#5cf',
  fontSize: 10,
  letterSpacing: 1,
  marginBottom: 6,
  textTransform: 'uppercase' as const,
}

const rowStyle = {
  display: 'grid',
  gridTemplateColumns: '120px minmax(0, 1fr)',
  gap: 8,
  padding: '2px 0',
}

const lineStyle = {
  color: '#dff',
  fontSize: 10,
  padding: '2px 0',
  whiteSpace: 'pre-wrap' as const,
  overflowWrap: 'anywhere' as const,
}

const jsonStyle = {
  margin: 0,
  color: '#cfe',
  fontSize: 10,
  whiteSpace: 'pre-wrap' as const,
  overflowWrap: 'anywhere' as const,
}

const sectionButtonStyle = {
  margin: 8,
  background: '#11324a',
  color: '#cfe',
  border: '1px solid #1e5a82',
  padding: '4px 8px',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 11,
}
