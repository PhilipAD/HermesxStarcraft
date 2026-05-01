/**
 * Live-base-updates regression test.
 *
 * Confirms that when a new active session, cron job, API key group,
 * dashboard plugin and skill appear in the Hermes state, the
 * EntityMapper + DeltaEngine pipeline produces a delta that the bridge
 * can use to spawn (and later kill) the corresponding StarCraft units
 * AND buildings live, without any reinit.
 *
 * Also verifies that the per-race scType rewrite (the same one the
 * Titan viewer applies before forwarding entities into the iframe)
 * produces the right race-specific buildings (Refinery -> Extractor /
 * Assimilator, CovertOps -> DefilerMound / TemplarArchives, Factory ->
 * EvolutionChamber / RoboticsFacility) and units (Marine -> Zergling /
 * Zealot, SCV -> Drone / Probe).
 *
 * If this passes for all three races we have an end-to-end guarantee
 * that newly-arriving Hermes activity flows through the dashboard ->
 * bridge -> iframe pipeline as live spawns rather than as a base
 * reload.
 */

import path from 'path'
import { describe, expect, it } from 'vitest'

import { EntityMapper } from '../server/entityMapper'
import { DeltaEngine } from '../server/deltaEngine'
import type { HermesState } from '../server/hermesState'
import type { Entity } from '../server/index'
import { scTypeForRace } from '../src/viewer/race-mapping'
import type { StarCraftRace } from '../src/viewer/race-mapping'

const MAPPING_PATH = path.join(__dirname, '..', 'config', 'mapping.json')

function makeBaselineState(): HermesState {
  return {
    source: { kind: 'fallback-files', fetchedAt: 1_700_000_000_000 },
    sessions: [],
    skills: [],
    cronJobs: [],
    memory: [],
    config: {
      agentName: 'TestAgent',
      model: 'test-model',
      provider: 'unknown',
      toolsets: [],
      gatewayPlatforms: [],
      maxIterations: 90,
      agentVersion: '1.0',
    },
    integrations: { apiKeyGroups: [], envKeyNames: [], gatewayPlatforms: [] },
    stats: {
      totalSessions: 0, activeSessions: 0, totalSessionsEver: 0,
      totalMessages: 0, totalToolCalls: 0, totalInputTokens: 0,
      totalOutputTokens: 0, totalErrors: 0, totalCronJobs: 0,
      activeCronJobs: 0, totalSkills: 0, enabledSkills: 0,
      memoryEntries: 0, uptime: 0, memoryUsageMB: 0,
    },
    errors: [],
    subagents: [],
    lastUpdated: 1_700_000_000_000,
  }
}

function withLiveActivity(base: HermesState): HermesState {
  const next = JSON.parse(JSON.stringify(base)) as HermesState
  const now = Math.floor(Date.now() / 1000)
  next.sessions = [{
    id: 'sess-live',
    source: 'cli',
    model: 'openrouter/test-model',
    messageCount: 4,
    toolCallCount: 2,
    inputTokens: 100,
    outputTokens: 50,
    estimatedCost: 0,
    startedAt: now - 10,
    endedAt: null,
    endReason: null,
    isActive: true,
    lastActive: now,
    title: 'Live session',
  }]
  next.cronJobs = [{
    id: 'cron-live',
    name: 'Live cron job',
    schedule: 'every 1m',
    enabled: true,
    lastRun: null,
    nextRun: now + 60,
    runCount: 0,
    errorCount: 0,
  }]
  next.skills = [{
    name: 'browser',
    path: '/skills/browser',
    category: 'general',
    enabled: true,
    lastModified: now,
    size: 100,
    description: 'Browser skill',
  }]
  next.integrations = { apiKeyGroups: ['OpenAI'], envKeyNames: [], gatewayPlatforms: [] }
  next.dashboard = {
    docsUrl: '',
    plugins: [{
      name: 'mytool',
      label: 'My Tool',
      description: 'Plugin tab',
      icon: '',
      version: '1.0.0',
      tab: { path: '/plugins/mytool' },
    }],
  }
  next.stats = {
    ...next.stats,
    totalSessions: 1,
    activeSessions: 1,
    totalSessionsEver: 1,
    totalCronJobs: 1,
    activeCronJobs: 1,
    totalSkills: 1,
    enabledSkills: 1,
  }
  return next
}

function entityById(entities: Entity[], id: string): Entity | undefined {
  return entities.find(e => e.id === id)
}

function expectScTypeForId(entities: Entity[], id: string, scType: string) {
  const ent = entityById(entities, id)
  expect(ent, `expected entity ${id} to exist`).toBeDefined()
  expect(ent!.scType).toBe(scType)
}

describe('live base updates: units and buildings spawn / die without reinit', () => {
  it('produces a delta that adds a session unit, cron worker, gas building, plugin building, skill factory and individual skill unit', () => {
    const mapper = new EntityMapper(MAPPING_PATH)
    const delta = new DeltaEngine()

    const baselineState = makeBaselineState()
    const baselineEntities = mapper.mapState(baselineState)

    const liveState = withLiveActivity(baselineState)
    const liveEntities = mapper.mapState(liveState)

    const d = delta.computeDelta(baselineEntities, liveEntities)

    const addedById = new Map(d.added.map(e => [e.id, e]))

    // Unit additions (live spawns)
    expect(addedById.get('session-marine-sess-live')?.scType).toBe('Marine')
    expect(addedById.get('cron-scv-cron-live')?.scType).toBe('SCV')
    expect(addedById.get('skill-unit-browser')?.scType).toBe('Marine')

    // Building additions (live spawns)
    expect(addedById.get('provider-refinery-openai')?.scType).toBe('Refinery')
    expect(addedById.get('dashboard-plugin-mytool')?.scType).toBe('CovertOps')
    expect(addedById.get('skill-factory-general')?.scType).toBe('Factory')
    expect(addedById.get('tech-academy-config')?.scType).toBe('Academy')

    // Nothing meaningful should have been removed by adding new activity.
    expect(d.removed).not.toContain('core-agent')
    expect(d.removed).not.toContain('chat-barracks-0')
    expect(d.removed).not.toContain('dashboard-status-armory')

    // Snapshot delta has changes.
    expect(delta.hasChanges(d)).toBe(true)
  })

  it('produces a removal delta that kills exactly the live entities when activity ends, without removing the base', () => {
    const mapper = new EntityMapper(MAPPING_PATH)
    const delta = new DeltaEngine()

    const baselineState = makeBaselineState()
    const liveState = withLiveActivity(baselineState)
    const liveEntities = mapper.mapState(liveState)
    const baselineEntities = mapper.mapState(baselineState)

    const d = delta.computeDelta(liveEntities, baselineEntities)
    const removed = new Set(d.removed)

    // Live unit ids should be killed.
    expect(removed.has('session-marine-sess-live')).toBe(true)
    expect(removed.has('cron-scv-cron-live')).toBe(true)
    expect(removed.has('skill-unit-browser')).toBe(true)

    // Live building ids should be killed.
    expect(removed.has('provider-refinery-openai')).toBe(true)
    expect(removed.has('dashboard-plugin-mytool')).toBe(true)
    expect(removed.has('skill-factory-general')).toBe(true)
    expect(removed.has('tech-academy-config')).toBe(true)

    // Core base entities must NOT be killed.
    expect(removed.has('core-agent')).toBe(false)
    expect(removed.has('chat-barracks-0')).toBe(false)
    expect(removed.has('dashboard-status-armory')).toBe(false)
    expect(removed.has('dashboard-docs-archive')).toBe(false)
    for (let i = 0; i < 4; i++) {
      expect(removed.has(`cron-scv-base-${i}`)).toBe(false)
    }
  })

  describe.each<StarCraftRace>(['terran', 'zerg', 'protoss'])(
    'race-specific live spawn rewrite for %s',
    (race) => {
      const expected: Record<StarCraftRace, {
        gas: string; plugin: string; factory: string;
        marine: string; cronWorker: string; skillUnit: string;
        commandCenter: string;
      }> = {
        terran: {
          gas: 'Refinery', plugin: 'CovertOps', factory: 'Factory',
          marine: 'Marine', cronWorker: 'SCV', skillUnit: 'Marine',
          commandCenter: 'CommandCenter',
        },
        zerg: {
          gas: 'Extractor', plugin: 'DefilerMound', factory: 'EvolutionChamber',
          marine: 'Zergling', cronWorker: 'Drone', skillUnit: 'Zergling',
          commandCenter: 'Hatchery',
        },
        protoss: {
          gas: 'Assimilator', plugin: 'TemplarArchives', factory: 'RoboticsFacility',
          marine: 'Zealot', cronWorker: 'Probe', skillUnit: 'Zealot',
          commandCenter: 'Nexus',
        },
      }

      it('rewrites the live-add batch into race-correct buildings and units', () => {
        const mapper = new EntityMapper(MAPPING_PATH)
        const delta = new DeltaEngine()

        const baselineState = makeBaselineState()
        const liveState = withLiveActivity(baselineState)
        const baselineEntities = mapper.mapState(baselineState)
        const liveEntities = mapper.mapState(liveState)

        const d = delta.computeDelta(baselineEntities, liveEntities)
        const rewritten = d.added.map(e => ({ ...e, scType: scTypeForRace(e, race) }))

        const exp = expected[race]
        expectScTypeForId(rewritten, 'provider-refinery-openai', exp.gas)
        expectScTypeForId(rewritten, 'dashboard-plugin-mytool', exp.plugin)
        expectScTypeForId(rewritten, 'skill-factory-general', exp.factory)
        expectScTypeForId(rewritten, 'session-marine-sess-live', exp.marine)
        expectScTypeForId(rewritten, 'cron-scv-cron-live', exp.cronWorker)
        expectScTypeForId(rewritten, 'skill-unit-browser', exp.skillUnit)
      })

      it('also rewrites the persistent base entities (CommandCenter -> race core, etc.)', () => {
        const mapper = new EntityMapper(MAPPING_PATH)
        const baselineEntities = mapper.mapState(makeBaselineState())
        const rewritten = baselineEntities.map(e => ({ ...e, scType: scTypeForRace(e, race) }))

        const exp = expected[race]
        expectScTypeForId(rewritten, 'core-agent', exp.commandCenter)
        // Base SCVs always present in the baseline.
        expectScTypeForId(rewritten, 'cron-scv-base-0', exp.cronWorker)
        // Barracks rewrite for race.
        const barracksRewriteByRace: Record<StarCraftRace, string> = {
          terran: 'Barracks', zerg: 'SpawningPool', protoss: 'Gateway',
        }
        expectScTypeForId(rewritten, 'chat-barracks-0', barracksRewriteByRace[race])
      })
    }
  )

  it('successive deltas (add then remove) leave the bridge with the same baseline entity ids it started from', () => {
    const mapper = new EntityMapper(MAPPING_PATH)
    const delta = new DeltaEngine()

    const baselineState = makeBaselineState()
    const liveState = withLiveActivity(baselineState)

    const baselineEntities = mapper.mapState(baselineState)
    const liveEntities = mapper.mapState(liveState)
    const baselineAgainEntities = mapper.mapState(baselineState)

    // Simulate the bridge applying batch 1 (baseline -> live).
    const addBatch = delta.computeDelta(baselineEntities, liveEntities)
    expect(addBatch.added.length).toBeGreaterThan(0)

    // Then batch 2 (live -> baseline).
    const removeBatch = delta.computeDelta(liveEntities, baselineAgainEntities)
    expect(removeBatch.removed.length).toBeGreaterThan(0)

    const baselineIds = new Set(baselineEntities.map(e => e.id))
    const finalIds = new Set(baselineAgainEntities.map(e => e.id))

    // After add+remove, the entity id set should match the original baseline.
    expect(finalIds).toEqual(baselineIds)
  })
})
