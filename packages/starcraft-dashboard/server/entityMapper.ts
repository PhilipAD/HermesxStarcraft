/**
 * EntityMapper — Maps Hermes Agent state to StarCraft entity types.
 * 
 * Reads mapping.json to get declarative rules, then transforms
 * Hermes entities into 3D-renderable StarCraft entities.
 */

import fs from 'fs'
import path from 'path'
import type { HermesState } from './hermesState.js'
import type { Entity } from './index.js'

interface MappingConfig {
  entityTypes: Record<string, EntityTypeConfig>
  clusterLayouts: Record<string, ClusterLayout>
  upgradeRules: Record<string, any>
  terrain: TerrainConfig
  sounds: Record<string, string>
  performance: PerformanceConfig
}

interface EntityTypeConfig {
  scRepresentation: string
  model: string
  health: number
  category: string
  tier: number
  visual: VisualConfig
  behavior: BehaviorConfig
  clickAction: string
  tooltip: string
  cluster: string
}

interface VisualConfig {
  color: number
  emissive: number
  scale: [number, number, number]
  glowOnActivity?: boolean
  smokeEffect?: boolean
}

interface BehaviorConfig {
  animIdle: string
  animBuild: string
  animDestroyed: string
}

interface ClusterLayout {
  center: [number, number]
  arrangement: string
  spacing: number
}

interface TerrainConfig {
  backgroundColor: number
  fogColor: number
  fogNear: number
  fogFar: number
  groundTiles: number
  tileSize: number
  elevation: Record<string, number>
}

interface PerformanceConfig {
  maxFPS: number
  idleFPS: number
  hiddenFPS: number
  maxUnits: number
  instanceThreshold: number
  lodDistance: number
  shadowMapSize: number
  particleBudget: number
}

let _configCache: MappingConfig | null = null

function loadMapping(configPath: string): MappingConfig {
  if (_configCache) return _configCache
  try {
    const raw = fs.readFileSync(configPath, 'utf-8')
    _configCache = JSON.parse(raw) as MappingConfig
    return _configCache!
  } catch (err) {
    console.error(`[EntityMapper] Failed to load mapping from ${configPath}:`, err)
    // Return minimal default mapping
    return getDefaultMapping()
  }
}

function getDefaultMapping(): MappingConfig {
  return {
    entityTypes: {
      CommandCenter: {
        scRepresentation: 'building', model: 'CommandCenter', health: 1500,
        category: 'core', tier: 3,
        visual: { color: 16776960, emissive: 26112, scale: [4, 3, 4], glowOnActivity: true },
        behavior: { animIdle: 'pulse', animBuild: 'construct', animDestroyed: 'explode' },
        clickAction: 'dashboard_overview', tooltip: 'Core Agent', cluster: 'command'
      }
    },
    clusterLayouts: {
      command: { center: [0, 0], arrangement: 'radial', spacing: 8 },
      tech: { center: [-25, 15], arrangement: 'grid', spacing: 6 },
      combat: { center: [25, 15], arrangement: 'combat', spacing: 4 },
      storage: { center: [-25, -15], arrangement: 'grid', spacing: 5 },
      worker: { center: [0, -20], arrangement: 'scattered', spacing: 3 },
      resource: { center: [0, 25], arrangement: 'clustered', spacing: 10 },
      alerts: { center: [25, -15], arrangement: 'grid', spacing: 5 },
      army: { center: [0, 30], arrangement: 'formation', spacing: 5 }
    },
    upgradeRules: {},
    terrain: {
      backgroundColor: 2047, fogColor: 13312, fogNear: 50, fogFar: 200,
      groundTiles: 64, tileSize: 4, elevation: { base: 0, command: 2, tech: 1, resource: 0.5 }
    },
    sounds: {},
    performance: {
      maxFPS: 60, idleFPS: 10, hiddenFPS: 0, maxUnits: 500,
      instanceThreshold: 10, lodDistance: 50, shadowMapSize: 1024, particleBudget: 200
    }
  }
}

const FALLBACK_ENTITY_TYPES: Record<string, {
  scRepresentation: string
  health: number
  category: string
  tier: number
  color: number
  emissive: number
  scale: [number, number, number]
  clickAction: string
  tooltip: string
  cluster: string
}> = {
  Factory: { scRepresentation: 'building', health: 1250, category: 'skills', tier: 2, color: 0x9aa7b0, emissive: 0x334455, scale: [3.4, 2.2, 3.2], clickAction: 'skill_editor', tooltip: 'Enabled skill category', cluster: 'tech' },
  Starport: { scRepresentation: 'building', health: 1300, category: 'toolsets', tier: 2, color: 0x8fb8ff, emissive: 0x2255aa, scale: [3.4, 2.4, 3.4], clickAction: 'gateway', tooltip: 'Network/platform capability', cluster: 'army' },
  Academy: { scRepresentation: 'building', health: 600, category: 'config', tier: 2, color: 0xffcc66, emissive: 0x664400, scale: [2.4, 1.8, 2.2], clickAction: 'config', tooltip: 'Config doctrine', cluster: 'tech' },
  EngineeringBay: { scRepresentation: 'building', health: 850, category: 'skills', tier: 2, color: 0xffaa00, emissive: 0x664400, scale: [3, 2, 3], clickAction: 'skill_editor', tooltip: 'Skill upgrades', cluster: 'tech' },
  ScienceFacility: { scRepresentation: 'building', health: 850, category: 'analytics', tier: 3, color: 0x66ccff, emissive: 0x004466, scale: [3.5, 2.5, 3.2], clickAction: 'analytics_panel', tooltip: 'Analytics intelligence', cluster: 'tech' },
  ComsatStation: { scRepresentation: 'building', health: 500, category: 'observability', tier: 2, color: 0x77ddff, emissive: 0x003355, scale: [1.8, 1.4, 1.8], clickAction: 'logs', tooltip: 'Telemetry and scans', cluster: 'alerts' },
  ControlTower: { scRepresentation: 'building', health: 500, category: 'gateway', tier: 2, color: 0x99bbff, emissive: 0x223366, scale: [1.8, 1.4, 1.8], clickAction: 'gateway', tooltip: 'Gateway routing', cluster: 'army' },
  MachineShop: { scRepresentation: 'building', health: 500, category: 'toolsets', tier: 2, color: 0xb0b0a0, emissive: 0x333322, scale: [1.8, 1.4, 1.8], clickAction: 'config', tooltip: 'Toolset production add-on', cluster: 'tech' },
  Armory: { scRepresentation: 'building', health: 750, category: 'dashboard', tier: 2, color: 0xb8b8c8, emissive: 0x333344, scale: [2.8, 1.9, 2.8], clickAction: 'dashboard_overview', tooltip: 'Dashboard status surface', cluster: 'tech' },
  CovertOps: { scRepresentation: 'building', health: 750, category: 'plugins', tier: 2, color: 0xaaaaff, emissive: 0x222255, scale: [2.4, 1.8, 2.4], clickAction: 'plugin_tab', tooltip: 'Dashboard plugin tab', cluster: 'tech' },
  PhysicsLab: { scRepresentation: 'building', health: 600, category: 'docs', tier: 2, color: 0x99ddff, emissive: 0x224455, scale: [2.2, 1.7, 2.2], clickAction: 'docs', tooltip: 'Documentation archive', cluster: 'tech' },
  NuclearSilo: { scRepresentation: 'building', health: 600, category: 'theme', tier: 2, color: 0xffdd88, emissive: 0x553300, scale: [1.8, 1.5, 1.8], clickAction: 'themes', tooltip: 'Dashboard theme state', cluster: 'tech' },
  MissileTurret: { scRepresentation: 'building', health: 200, category: 'monitoring', tier: 1, color: 0xccddff, emissive: 0x223344, scale: [1.6, 1.8, 1.6], clickAction: 'error_logs', tooltip: 'Monitoring perimeter', cluster: 'alerts' },
  Refinery: { scRepresentation: 'building', health: 750, category: 'providers', tier: 1, color: 0x00ff80, emissive: 0x006633, scale: [3, 1.8, 2.4], clickAction: 'api_keys', tooltip: 'Provider/API key group', cluster: 'resource' },
  Firebat: { scRepresentation: 'unit', health: 50, category: 'sessions', tier: 0, color: 0xff6633, emissive: 0x661100, scale: [0.8, 0.8, 0.8], clickAction: 'session_detail', tooltip: 'High-value active session', cluster: 'combat' },
  Ghost: { scRepresentation: 'unit', health: 45, category: 'agents', tier: 1, color: 0xd8d8ff, emissive: 0x333366, scale: [0.8, 0.8, 0.8], clickAction: 'subagent_detail', tooltip: 'Summoned external agent', cluster: 'army' },
  Dropship: { scRepresentation: 'unit', health: 150, category: 'platforms', tier: 1, color: 0xaaccff, emissive: 0x223355, scale: [1.1, 1.1, 1.1], clickAction: 'gateway', tooltip: 'Gateway-connected platform', cluster: 'army' },
  ScienceVessel: { scRepresentation: 'unit', health: 200, category: 'analytics', tier: 2, color: 0x99ffff, emissive: 0x225555, scale: [1.1, 1.1, 1.1], clickAction: 'analytics_panel', tooltip: 'Analytics intelligence', cluster: 'army' },
  default: { scRepresentation: 'unit', health: 100, category: 'unknown', tier: 1, color: 0xffffff, emissive: 0x111111, scale: [1, 1, 1], clickAction: 'dashboard_overview', tooltip: 'Hermes capability', cluster: 'tech' },
}

export class EntityMapper {
  private config: MappingConfig
  private entityAges = new Map<string, number>()

  constructor(configPath: string) {
    this.config = loadMapping(configPath)
  }

  mapState(state: HermesState): Entity[] {
    const metrics = this.deriveTerranMetrics(state)
    const entities = [
      this.mapCommandCenter(state, metrics),
      ...this.mapDashboardSurface(state, metrics),
      ...this.mapProviderEconomy(state, metrics),
      ...this.mapCronWorkers(state, metrics),
      ...this.mapSessionLayer(state, metrics),
      ...this.mapActiveSessions(state, metrics),
      ...this.mapSummonedAgents(state, metrics),
      ...this.mapSkillFactories(state, metrics),
      ...this.mapIndividualSkills(state),
      ...this.mapToolsets(state, metrics),
      ...this.mapTech(state, metrics),
      ...this.mapAnalyticsBreakdown(state),
      ...this.mapObservability(state, metrics),
      ...this.mapMobility(state, metrics),
      ...this.mapSupply(state, metrics),
      ...this.mapDashboardExtensions(state),
    ]
    return entities.map(entity => ({
      ...entity,
      data: {
        source: state.source,
        ...entity.data,
      },
    }))
  }

  private deriveTerranMetrics(state: HermesState) {
    const enabledCronJobs = state.cronJobs.filter(j => j.enabled)
    const activeSessions = state.sessions.filter(s => s.isActive)
    const enabledSkills = state.skills.filter(s => s.enabled)
    const skillCategories = Array.from(new Set(enabledSkills.map(s => s.category || 'general'))).sort()
    const toolsets = Array.from(new Set(
      state.toolsets?.length
        ? state.toolsets.filter(t => t.enabled).map(t => t.name)
        : state.config.toolsets || []
    )).sort()
    const apiKeyGroups = state.integrations?.apiKeyGroups?.length
      ? state.integrations.apiKeyGroups
      : state.config.provider && state.config.provider !== 'unknown'
        ? ['LLM providers']
        : []
    const gatewayPlatforms = Array.from(new Set([
      ...(state.integrations?.gatewayPlatforms || []),
      ...(state.config.gatewayPlatforms || []),
    ])).sort()
    const runningSubagents = state.subagents.filter(s => s.status === 'running')
    const ghostProviders = Array.from(new Set(runningSubagents.map(s => this.providerFromModel(s.model)))).slice(0, 6)
    const totalTokens = state.stats.totalInputTokens + state.stats.totalOutputTokens
    const logSeverityCounts = Object.values(state.logs || {}).reduce((acc, log) => {
      acc.error += log.severityCounts.error
      acc.warning += log.severityCounts.warning
      acc.info += log.severityCounts.info
      acc.debug += log.severityCounts.debug
      return acc
    }, { error: 0, warning: 0, info: 0, debug: 0 })
    const observabilityScore = state.errors.length + (state.stats.totalErrors || 0) + logSeverityCounts.error + Math.ceil(logSeverityCounts.warning / 2)
    const hasAutomation = enabledCronJobs.length > 0
    const hasObservability = observabilityScore > 0 || totalTokens > 0 || state.stats.totalToolCalls > 0
    const stage = hasAutomation && hasObservability && (state.stats.activeSessions >= 5 || enabledCronJobs.length >= 10 || observabilityScore >= 8)
      ? 'planetary'
      : hasAutomation && hasObservability
        ? 'orbital'
        : 'base'

    return {
      enabledCronJobs,
      activeSessions,
      enabledSkills,
      skillCategories,
      toolsets,
      apiKeyGroups,
      gatewayPlatforms,
      runningSubagents,
      ghostProviders,
      totalTokens,
      observabilityScore,
      logSeverityCounts,
      stage,
    }
  }

  private mapCommandCenter(state: HermesState, metrics: ReturnType<EntityMapper['deriveTerranMetrics']>): Entity {
    const tier = metrics.stage === 'planetary' ? 3 : metrics.stage === 'orbital' ? 2 : 1
    const agentName = state.config.agentName || 'Hermes Agent'
    return this.makeEntity({
      id: 'core-agent',
      type: 'core_agent',
      scType: 'CommandCenter',
      cluster: 'command',
      label: metrics.stage === 'base' ? `${agentName} v${state.config.agentVersion}` : `${agentName} ${metrics.stage}`,
      tooltip: `${agentName} identity core: ${state.config.model} | ${metrics.activeSessions.length} active sessions | ${metrics.enabledCronJobs.length} active crons`,
      activity: metrics.activeSessions.length > 0 || metrics.enabledCronJobs.length > 0 ? 'active' : 'idle',
      tier,
      health: tier === 3 ? 1500 : tier === 2 ? 1250 : 1000,
      maxHealth: 1500,
      color: this.tierColor(tier),
      clickAction: 'dashboard_overview',
      data: { agentName, model: state.config.model, provider: state.config.provider, stage: metrics.stage, stats: state.stats, source: state.source },
    })
  }

  private mapDashboardSurface(state: HermesState, metrics: ReturnType<EntityMapper['deriveTerranMetrics']>): Entity[] {
    return [
      this.makeEntity({
        id: 'dashboard-status-armory',
        type: 'dashboard_status',
        scType: 'Armory',
        cluster: 'tech',
        label: state.status?.gateway_state ? `Gateway ${state.status.gateway_state}` : 'Dashboard status',
        tooltip: `Dashboard source: ${state.source.kind}${state.source.fallbackReason ? ` | ${state.source.fallbackReason}` : ''}`,
        activity: state.status?.gateway_running === false ? 'idle' : 'active',
        tier: state.status?.gateway_running === false ? 1 : 2,
        clickAction: 'dashboard_overview',
        data: { status: state.status, source: state.source, activeSessions: metrics.activeSessions.length },
        positionIndex: 0,
        positionTotal: 2,
      }),
      this.makeEntity({
        id: 'dashboard-docs-archive',
        type: 'documentation',
        scType: 'PhysicsLab',
        cluster: 'tech',
        label: 'Documentation archive',
        tooltip: 'Hermes documentation tab and external docs iframe',
        activity: 'idle',
        tier: 2,
        clickAction: 'docs',
        data: { docsUrl: state.dashboard?.docsUrl },
        positionIndex: 1,
        positionTotal: 2,
      }),
    ]
  }

  private mapProviderEconomy(state: HermesState, metrics: ReturnType<EntityMapper['deriveTerranMetrics']>): Entity[] {
    return metrics.apiKeyGroups.slice(0, 3).map((group, i) => this.makeEntity({
      id: `provider-refinery-${this.slug(group)}`,
      type: 'api_key_group',
      scType: 'Refinery',
      cluster: 'resource',
      label: group,
      tooltip: `API key group ready: ${group}`,
      activity: 'mining',
      tier: 1,
      clickAction: 'api_keys',
      data: { group, envKeyNames: state.integrations?.envKeyNames || [], env: state.env, oauth: state.oauth },
      positionIndex: i,
      positionTotal: Math.max(1, metrics.apiKeyGroups.length),
    }))
  }

  private mapCronWorkers(state: HermesState, metrics: ReturnType<EntityMapper['deriveTerranMetrics']>): Entity[] {
    const entities: Entity[] = []
    const activeJobs = metrics.enabledCronJobs
    const totalScvs = Math.min(80, 4 + activeJobs.length)
    for (let i = 0; i < totalScvs; i++) {
      const job = activeJobs[i - 4]
      entities.push(this.makeEntity({
        id: job ? `cron-scv-${job.id}` : `cron-scv-base-${i}`,
        type: job ? 'cron' : 'base_worker',
        scType: 'SCV',
        cluster: 'worker',
        label: job ? job.name.substring(0, 20) : `Base SCV ${i + 1}`,
        tooltip: job ? `Cron: ${job.schedule} | Runs: ${job.runCount} | Errors: ${job.errorCount}` : 'Baseline Hermes maintenance labor',
        activity: job ? 'patrol' : 'mining',
        tier: 0,
        clickAction: job ? 'cron_editor' : 'status',
        data: { job, baseWorker: !job, activeCronJobs: activeJobs.length, totalCronJobs: state.cronJobs.length },
        positionIndex: i,
        positionTotal: totalScvs,
      }))
    }
    return entities
  }

  private mapSessionLayer(state: HermesState, metrics: ReturnType<EntityMapper['deriveTerranMetrics']>): Entity[] {
    const barracksCount = Math.max(1, Math.min(4, 1 + Math.floor(metrics.activeSessions.length / 5) + Math.floor(state.stats.totalSessions / 50)))
    return Array.from({ length: barracksCount }, (_, i) => this.makeEntity({
      id: `chat-barracks-${i}`,
      type: 'chat_layer',
      scType: 'Barracks',
      cluster: 'combat',
      label: i === 0 ? 'Chat operations' : `Session barracks ${i + 1}`,
      tooltip: `Primary interaction surface: ${metrics.activeSessions.length} active sessions`,
      activity: metrics.activeSessions.length > 0 ? 'active' : 'idle',
      tier: 1,
      clickAction: 'sessions',
      data: { activeSessions: metrics.activeSessions.length, totalSessions: state.stats.totalSessions, totalSessionsEver: state.stats.totalSessionsEver },
      positionIndex: i,
      positionTotal: barracksCount,
    }))
  }

  private mapActiveSessions(_state: HermesState, metrics: ReturnType<EntityMapper['deriveTerranMetrics']>): Entity[] {
    return metrics.activeSessions.slice(0, 80).map((s, i) => this.makeEntity({
      id: `session-marine-${s.id}`,
      type: 'active_session',
      scType: s.toolCallCount >= 20 || s.messageCount >= 80 ? 'Firebat' : 'Marine',
      cluster: 'combat',
      label: `${s.source} | ${s.model.split('/').pop()}`,
      tooltip: `Live session: ${s.messageCount} messages, ${s.toolCallCount} tool calls`,
      activity: 'patrol',
      tier: 0,
      clickAction: 'session_detail',
      data: { session: s },
      positionIndex: i,
      positionTotal: metrics.activeSessions.length,
    }))
  }

  private mapSummonedAgents(_state: HermesState, metrics: ReturnType<EntityMapper['deriveTerranMetrics']>): Entity[] {
    return metrics.ghostProviders.map((provider, i) => this.makeEntity({
      id: `summon-ghost-${this.slug(provider)}`,
      type: 'summoned_agent',
      scType: 'Ghost',
      cluster: 'army',
      label: `${provider} agent`,
      tooltip: `Summoned external agent/provider: ${provider}`,
      activity: 'active',
      tier: 1,
      clickAction: 'subagent_detail',
      data: { provider, runningSubagents: metrics.runningSubagents.filter(s => this.providerFromModel(s.model) === provider) },
      positionIndex: i,
      positionTotal: metrics.ghostProviders.length,
    }))
  }

  private mapSkillFactories(state: HermesState, metrics: ReturnType<EntityMapper['deriveTerranMetrics']>): Entity[] {
    const visibleCategories = metrics.skillCategories.slice(0, 6)
    return visibleCategories.map((category, i) => this.makeEntity({
      id: `skill-factory-${this.slug(category)}`,
      type: 'skill_category',
      scType: 'Factory',
      cluster: 'tech',
      label: `${category} skills`,
      tooltip: `${state.skills.filter(s => s.enabled && (s.category || 'general') === category).length} enabled skills in ${category}`,
      activity: 'active',
      tier: 2,
      clickAction: 'skill_editor',
      data: { category, skills: state.skills.filter(s => s.enabled && (s.category || 'general') === category) },
      positionIndex: i,
      positionTotal: visibleCategories.length,
    }))
  }

  private mapIndividualSkills(state: HermesState): Entity[] {
    return state.skills.map((skill, i) => this.makeEntity({
      id: `skill-unit-${this.slug(skill.name)}`,
      type: 'skill',
      scType: skill.enabled ? 'Marine' : 'Ghost',
      cluster: 'army',
      label: skill.name,
      tooltip: `${skill.enabled ? 'Enabled' : 'Disabled'} skill: ${skill.description || skill.category}`,
      activity: skill.enabled ? 'patrol' : 'idle',
      tier: skill.enabled ? 1 : 0,
      clickAction: 'skill_editor',
      data: { skill, category: skill.category || 'general' },
      positionIndex: i,
      positionTotal: state.skills.length,
    }))
  }

  private mapToolsets(_state: HermesState, metrics: ReturnType<EntityMapper['deriveTerranMetrics']>): Entity[] {
    const visibleToolsets = metrics.toolsets.slice(0, 4)
    return visibleToolsets.map((toolset, i) => this.makeEntity({
      id: `toolset-${this.slug(toolset)}`,
      type: 'toolset',
      scType: this.isNetworkToolset(toolset) ? 'Starport' : 'MachineShop',
      cluster: 'tech',
      label: `${toolset} tools`,
      tooltip: `Enabled toolset: ${toolset}`,
      activity: 'active',
      tier: 2,
      clickAction: 'config',
      data: { toolset },
      positionIndex: i,
      positionTotal: visibleToolsets.length,
    }))
  }

  private mapTech(state: HermesState, metrics: ReturnType<EntityMapper['deriveTerranMetrics']>): Entity[] {
    const entities: Entity[] = []
    if (state.stats.enabledSkills > 0 || state.config.maxIterations > 90) {
      entities.push(this.makeEntity({
        id: 'tech-academy-config',
        type: 'config_doctrine',
        scType: 'Academy',
        cluster: 'tech',
        label: 'Config doctrine',
        tooltip: `Config maturity: ${state.stats.enabledSkills} enabled skills, max turns ${state.config.maxIterations}`,
        activity: state.stats.enabledSkills > 0 ? 'active' : 'idle',
        tier: 2,
        clickAction: 'config',
        data: { config: state.config },
      }))
    }
    if (state.stats.enabledSkills >= 3) {
      entities.push(this.makeEntity({
        id: 'tech-engineering-skills',
        type: 'skill_unlocks',
        scType: 'EngineeringBay',
        cluster: 'tech',
        label: 'Skill upgrades',
        tooltip: `${state.stats.enabledSkills} enabled skills`,
        activity: 'active',
        tier: 2,
        clickAction: 'skill_editor',
        data: { enabledSkills: metrics.enabledSkills.length },
      }))
    }
    if (metrics.totalTokens > 0 || state.stats.totalToolCalls > 0) {
      entities.push(this.makeEntity({
        id: 'analytics-science-facility',
        type: 'analytics',
        scType: 'ScienceFacility',
        cluster: 'tech',
        label: 'Analytics intel',
        tooltip: `${this.fmtNum(metrics.totalTokens)} tokens, ${this.fmtNum(state.stats.totalToolCalls)} tool calls`,
        activity: 'active',
        tier: 3,
        clickAction: 'analytics_panel',
      data: { stats: state.stats, analytics: state.analytics },
      }))
    }
    return entities
  }

  private mapAnalyticsBreakdown(state: HermesState): Entity[] {
    const models = state.analytics?.by_model || []
    const topSkills = state.analytics?.skills?.top_skills || []
    const entities: Entity[] = []
    for (let i = 0; i < Math.min(6, models.length); i++) {
      const model = models[i]
      const label = String(model.model || 'model').split('/').pop() || 'model'
      entities.push(this.makeEntity({
        id: `analytics-model-${this.slug(String(model.model || i))}`,
        type: 'analytics_model',
        scType: 'ScienceVessel',
        cluster: 'army',
        label,
        tooltip: `Model analytics: ${this.fmtNum(Number(model.input_tokens || 0) + Number(model.output_tokens || 0))} tokens`,
        activity: 'patrol',
        tier: 2,
        clickAction: 'analytics_panel',
        data: { model, analytics: state.analytics },
        positionIndex: i,
        positionTotal: Math.min(6, models.length),
      }))
    }
    for (let i = 0; i < Math.min(3, topSkills.length); i++) {
      const skill = topSkills[i]
      entities.push(this.makeEntity({
        id: `analytics-skill-${this.slug(String(skill.skill || i))}`,
        type: 'analytics_skill',
        scType: 'EngineeringBay',
        cluster: 'tech',
        label: String(skill.skill || 'skill usage'),
        tooltip: `Skill analytics: ${skill.total_count || 0} actions, ${skill.percentage || 0}%`,
        activity: 'active',
        tier: 2,
        clickAction: 'analytics_panel',
        data: { skill, analyticsSkills: state.analytics?.skills },
        positionIndex: i,
        positionTotal: Math.min(3, topSkills.length),
      }))
    }
    return entities
  }

  private mapObservability(state: HermesState, metrics: ReturnType<EntityMapper['deriveTerranMetrics']>): Entity[] {
    const entities: Entity[] = []
    if (metrics.stage !== 'base') {
      entities.push(this.makeEntity({
        id: 'intel-comsat',
        type: 'observability',
        scType: 'ComsatStation',
        cluster: 'alerts',
        label: 'Comsat telemetry',
        tooltip: 'Automation plus observability unlocked',
        activity: 'active',
        tier: 2,
        clickAction: 'logs',
        data: { stage: metrics.stage, logs: state.logs },
      }))
    }
    const turretCount = Math.min(4, Math.max(0, Math.ceil(metrics.observabilityScore / 5)))
    for (let i = 0; i < turretCount; i++) {
      entities.push(this.makeEntity({
        id: `monitor-turret-${i}`,
        type: 'monitoring',
        scType: 'MissileTurret',
        cluster: 'alerts',
        label: `Monitor ${i + 1}`,
        tooltip: `${metrics.observabilityScore} log/error signals (${metrics.logSeverityCounts.error} errors, ${metrics.logSeverityCounts.warning} warnings)`,
        activity: metrics.observabilityScore > 0 ? 'active' : 'idle',
        tier: 1,
        clickAction: 'error_logs',
        data: { errors: state.errors.slice(i * 5, i * 5 + 5), logs: state.logs, severityCounts: metrics.logSeverityCounts },
        positionIndex: i,
        positionTotal: turretCount,
      }))
    }
    const bunkerCount = metrics.stage === 'planetary' ? 2 : state.errors.length > 0 ? 1 : 0
    for (let i = 0; i < bunkerCount; i++) {
      entities.push(this.makeEntity({
        id: `defense-bunker-${i}`,
        type: 'defense',
        scType: 'Bunker',
        cluster: 'alerts',
        label: i === 0 ? 'Defensive controls' : `Bunker ${i + 1}`,
        tooltip: 'Hardened monitoring / approval perimeter',
        activity: state.errors.length > 0 ? 'active' : 'idle',
        tier: 1,
        clickAction: 'error_logs',
        data: { errors: state.errors, logs: state.logs, severityCounts: metrics.logSeverityCounts },
        positionIndex: i,
        positionTotal: bunkerCount,
      }))
    }
    return entities
  }

  private mapMobility(_state: HermesState, metrics: ReturnType<EntityMapper['deriveTerranMetrics']>): Entity[] {
    const entities: Entity[] = []
    if (metrics.gatewayPlatforms.length > 0 || metrics.toolsets.some(t => this.isNetworkToolset(t))) {
      entities.push(this.makeEntity({
        id: 'mobility-starport',
        type: 'platform_mobility',
        scType: 'Starport',
        cluster: 'army',
        label: 'Platform reach',
        tooltip: `${metrics.gatewayPlatforms.length} gateway/platform integrations`,
        activity: 'active',
        tier: 2,
        clickAction: 'gateway',
        data: { platforms: metrics.gatewayPlatforms },
      }))
      entities.push(this.makeEntity({
        id: 'mobility-control-tower',
        type: 'platform_routing',
        scType: 'ControlTower',
        cluster: 'army',
        label: 'Gateway routing',
        tooltip: 'Cross-platform routing and delivery',
        activity: 'active',
        tier: 2,
        clickAction: 'gateway',
        data: { platforms: metrics.gatewayPlatforms },
      }))
    }
    for (let i = 0; i < Math.min(6, metrics.gatewayPlatforms.length); i++) {
      const platform = metrics.gatewayPlatforms[i]
      entities.push(this.makeEntity({
        id: `platform-dropship-${this.slug(platform)}`,
        type: 'platform',
        scType: 'Dropship',
        cluster: 'army',
        label: `${platform} link`,
        tooltip: `Gateway-connected platform: ${platform}`,
        activity: 'patrol',
        tier: 1,
        clickAction: 'gateway',
        data: { platform },
        positionIndex: i,
        positionTotal: metrics.gatewayPlatforms.length,
      }))
    }
    if (metrics.totalTokens > 100000 || metrics.observabilityScore >= 5) {
      entities.push(this.makeEntity({
        id: 'intel-science-vessel',
        type: 'analytics_air',
        scType: 'ScienceVessel',
        cluster: 'army',
        label: 'Cost intelligence',
        tooltip: 'High analytics / observability depth',
        activity: 'patrol',
        tier: 2,
        clickAction: 'analytics_panel',
        data: { totalTokens: metrics.totalTokens, observabilityScore: metrics.observabilityScore },
      }))
    }
    return entities
  }

  private mapSupply(state: HermesState, metrics: ReturnType<EntityMapper['deriveTerranMetrics']>): Entity[] {
    const count = Math.min(8, Math.max(1, Math.ceil((4 + metrics.enabledCronJobs.length + metrics.activeSessions.length) / 8)))
    return Array.from({ length: count }, (_, i) => this.makeEntity({
      id: `supply-depot-${i}`,
      type: 'supply',
      scType: 'SupplyDepot',
      cluster: 'storage',
      label: `Supply ${i + 1}`,
      tooltip: `${state.memory.length} memories, ${metrics.enabledCronJobs.length} cron workers, ${metrics.activeSessions.length} active sessions`,
      activity: 'idle',
      tier: 1,
      clickAction: 'memory_browser',
      data: { memoryEntries: state.memory.length, activeCronJobs: metrics.enabledCronJobs.length, activeSessions: metrics.activeSessions.length },
      positionIndex: i,
      positionTotal: count,
    }))
  }

  private mapDashboardExtensions(state: HermesState): Entity[] {
    const entities: Entity[] = []
    const plugins = (state.dashboard?.plugins || []).filter(plugin => !plugin.tab?.hidden)
    for (let i = 0; i < Math.min(12, plugins.length); i++) {
      const plugin = plugins[i]
      entities.push(this.makeEntity({
        id: `dashboard-plugin-${this.slug(plugin.name)}`,
        type: 'dashboard_plugin',
        scType: 'CovertOps',
        cluster: 'tech',
        label: plugin.label || plugin.name,
        tooltip: `Dashboard plugin tab: ${plugin.tab?.path || plugin.name}`,
        activity: 'active',
        tier: 2,
        clickAction: 'plugin_tab',
        data: { plugin, dashboardRoute: plugin.tab?.path || '/sessions' },
        positionIndex: i,
        positionTotal: Math.min(12, plugins.length),
      }))
    }
    if (state.dashboard?.activeTheme) {
      entities.push(this.makeEntity({
        id: 'dashboard-theme-silo',
        type: 'dashboard_theme',
        scType: 'NuclearSilo',
        cluster: 'tech',
        label: `${state.dashboard.activeTheme} theme`,
        tooltip: `${state.dashboard.themes?.length || 0} dashboard themes available`,
        activity: 'idle',
        tier: 2,
        clickAction: 'themes',
        data: { activeTheme: state.dashboard.activeTheme, themes: state.dashboard.themes },
      }))
    }
    return entities
  }

  private getClusterPosition(clusterName: string, index: number, total: number): { x: number, y: number } {
    const layout = this.config.clusterLayouts[clusterName]
    if (!layout) return { x: index * 2, y: 0 }

    switch (layout.arrangement) {
      case 'radial':
        if (index === 0) return { x: 0, y: 0 }
        return {
          x: Math.cos((index / Math.max(1, total - 1)) * Math.PI * 2) * layout.spacing,
          y: Math.sin((index / Math.max(1, total - 1)) * Math.PI * 2) * layout.spacing
        }
      case 'grid': {
        const cols = Math.ceil(Math.sqrt(total))
        return {
          x: (index % cols - cols / 2) * layout.spacing,
          y: (Math.floor(index / cols) - cols / 2) * layout.spacing
        }
      }
      case 'combat': {
        // Form rows like SC units
        const cols = Math.min(5, total)
        return {
          x: (index % cols) * layout.spacing - (cols * layout.spacing) / 2,
          y: Math.floor(index / cols) * layout.spacing * 1.5
        }
      }
      case 'scattered':
        // Pseudo-random but deterministic
        const angle = (index / total) * Math.PI * 2 * 3.33
        const radius = 5 + (index % 3) * layout.spacing
        return {
          x: Math.cos(angle) * radius,
          y: Math.sin(angle) * radius
        }
      default:
        return {
          x: (index % 5) * layout.spacing - 10,
          y: Math.floor(index / 5) * layout.spacing
        }
    }
  }

  private tierColor(tier: number): number {
    switch (tier) {
      case 1: return 0xFF6600 // orange
      case 2: return 0xFFCC00 // gold
      case 3: return 0x00FFFF // cyan (upgraded CC)
      default: return 0xFFFF00
    }
  }

  private activeSessionColor(idx: number): number {
    const colors = [0xFF6600, 0xFF3300, 0xFF9900, 0xFFCC00, 0xFF6600, 0xFF3300, 0xFF9900, 0xFFCC00]
    return colors[idx % colors.length]
  }

  private makeEntity(opts: {
    id: string
    type: string
    scType: string
    cluster: string
    label: string
    tooltip: string
    activity: Entity['activity']
    tier: number
    clickAction: string
    data: Record<string, any>
    health?: number
    maxHealth?: number
    color?: number
    emissive?: number
    scale?: [number, number, number]
    positionIndex?: number
    positionTotal?: number
  }): Entity {
    const cfg = this.configFor(opts.scType)
    const cluster = this.config.clusterLayouts[opts.cluster] || this.config.clusterLayouts[cfg.cluster] || { center: [0, 0], arrangement: 'grid', spacing: 5 }
    const index = opts.positionIndex ?? 0
    const total = opts.positionTotal ?? 1
    const pos = this.getClusterPosition(opts.cluster, index, total)
    const age = this.entityAges.get(opts.id) || 0
    this.entityAges.set(opts.id, age + 1)
    return {
      id: opts.id,
      type: opts.type,
      scType: opts.scType,
      cluster: opts.cluster,
      label: opts.label.substring(0, 32),
      tooltip: opts.tooltip,
      x: cluster.center[0] + pos.x,
      y: this.yForCluster(opts.cluster),
      z: cluster.center[1] + pos.y,
      health: opts.health ?? cfg.health,
      maxHealth: opts.maxHealth ?? cfg.health,
      activity: opts.activity,
      color: opts.color ?? cfg.visual.color,
      emissive: opts.emissive ?? cfg.visual.emissive,
      scale: opts.scale ?? cfg.visual.scale,
      clickAction: opts.clickAction,
      data: {
        dashboardRoute: this.routeForAction(opts.clickAction),
        ...opts.data,
      },
      tier: opts.tier,
      age,
    }
  }

  private configFor(scType: string): EntityTypeConfig {
    const known = this.config.entityTypes[scType]
    if (known) return known
    const fallback = FALLBACK_ENTITY_TYPES[scType] || FALLBACK_ENTITY_TYPES.default
    return {
      scRepresentation: fallback.scRepresentation,
      model: scType,
      health: fallback.health,
      category: fallback.category,
      tier: fallback.tier,
      visual: {
        color: fallback.color,
        emissive: fallback.emissive,
        scale: fallback.scale,
      },
      behavior: { animIdle: 'idle', animBuild: 'spawn', animDestroyed: 'death' },
      clickAction: fallback.clickAction,
      tooltip: fallback.tooltip,
      cluster: fallback.cluster,
    }
  }

  private yForCluster(cluster: string): number {
    const elevation = this.config.terrain.elevation
    if (cluster === 'command') return elevation.command || 2
    if (cluster === 'resource') return elevation.resource || 0.5
    if (cluster === 'worker' || cluster === 'combat' || cluster === 'army') return 0.4
    if (cluster === 'storage') return elevation.base || 0
    return elevation.tech || 1
  }

  private providerFromModel(model: string): string {
    const first = (model || 'external').split('/')[0]
    return first && first !== model ? first : (model || 'external').split(':')[0]
  }

  private isNetworkToolset(toolset: string): boolean {
    return /web|browser|gateway|slack|telegram|discord|github|remote|cloud|deploy|net/i.test(toolset)
  }

  private slug(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'unknown'
  }

  private fmtNum(n: number): string {
    if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`
    if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`
    if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`
    return n.toString()
  }

  private routeForAction(action: string): string {
    const routes: Record<string, string> = {
      dashboard_overview: '/sessions',
      status: '/sessions',
      sessions: '/sessions',
      session_detail: '/sessions',
      analytics_panel: '/analytics',
      logs: '/logs',
      error_logs: '/logs',
      cron_editor: '/cron',
      skill_editor: '/skills',
      config: '/config',
      api_keys: '/env',
      gateway: '/env',
      memory_browser: '/sessions',
      docs: '/docs',
      plugins: '/sessions',
      plugin_tab: '/sessions',
      themes: '/config',
      subagent_detail: '/sessions',
    }
    return routes[action] || '/sessions'
  }

  getMappingSummary() {
    return {
      entityTypes: Object.keys(this.config.entityTypes),
      clusterLayouts: Object.keys(this.config.clusterLayouts),
      performance: this.config.performance,
      terrain: this.config.terrain
    }
  }
}
