import http from 'http'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it } from 'vitest'

import { DashboardStateReader } from '../server/dashboardState'
import { EntityMapper } from '../server/entityMapper'
import { HermesStateReader } from '../server/hermesState'

const tempRoots: string[] = []
const servers: http.Server[] = []

function makeHermesHome(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dashboard-state-reader-'))
  tempRoots.push(root)
  return root
}

function writeFile(filePath: string, content: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, content)
}

function json(res: http.ServerResponse, value: unknown) {
  res.writeHead(200, { 'content-type': 'application/json' })
  res.end(JSON.stringify(value))
}

async function startMockDashboard(): Promise<string> {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1')
    if (url.pathname === '/sessions') {
      res.writeHead(200, { 'content-type': 'text/html' })
      res.end('<script>window.__HERMES_SESSION_TOKEN__="test-token";</script>')
      return
    }
    if (req.headers['x-hermes-session-token'] !== 'test-token') {
      res.writeHead(401, { 'content-type': 'application/json' })
      res.end('{"detail":"Unauthorized"}')
      return
    }

    switch (url.pathname) {
      case '/api/status':
        json(res, {
          active_sessions: 1,
          gateway_running: true,
          gateway_state: 'running',
          gateway_platforms: { discord: { state: 'connected' } },
          version: '1.2.3',
          hermes_home: '/tmp/hermes',
        })
        return
      case '/api/sessions':
        json(res, {
          total: 2,
          sessions: [{
            id: 's1',
            source: 'cli',
            model: 'openrouter/test-model',
            title: 'Active session',
            started_at: 100,
            last_active: 120,
            ended_at: null,
            is_active: true,
            message_count: 3,
            tool_call_count: 4,
            input_tokens: 1000,
            output_tokens: 250,
          }],
        })
        return
      case '/api/analytics/usage':
        json(res, {
          daily: [{ day: '2026-04-30', input_tokens: 1000, output_tokens: 250, sessions: 1 }],
          by_model: [{ model: 'openrouter/test-model', input_tokens: 1000, output_tokens: 250, sessions: 1 }],
          totals: { total_input: 1000, total_output: 250, total_sessions: 2, total_api_calls: 5 },
          skills: {
            summary: { total_skill_loads: 2, total_skill_edits: 1, total_skill_actions: 3, distinct_skills_used: 1 },
            top_skills: [{ skill: 'browser', total_count: 3, percentage: 100, view_count: 2, manage_count: 1 }],
          },
        })
        return
      case '/api/cron/jobs':
        json(res, [{
          id: 'cron1',
          name: 'Daily cron',
          prompt: 'do work',
          schedule: { kind: 'cron', expr: '0 9 * * *', display: '0 9 * * *' },
          enabled: true,
          state: 'scheduled',
          last_error: null,
        }])
        return
      case '/api/skills':
        json(res, [{ name: 'browser', description: 'Browse pages', category: 'web', enabled: true }])
        return
      case '/api/tools/toolsets':
        json(res, [{ name: 'web', label: 'Web', description: 'Web tools', enabled: true, configured: true, tools: ['browser'] }])
        return
      case '/api/config':
        json(res, { model: { default: 'openrouter/test-model', provider: 'openrouter' }, toolsets: ['web'], agent: { max_turns: 99 } })
        return
      case '/api/config/schema':
        json(res, { fields: { 'agent.max_turns': { category: 'agent' } }, category_order: ['agent'] })
        return
      case '/api/config/raw':
        json(res, { yaml: 'model: test\n' })
        return
      case '/api/env':
        json(res, { OPENROUTER_API_KEY: { is_set: true, redacted_value: 'sk-...', description: 'OpenRouter', url: null, category: 'provider', is_password: true, tools: ['llm'], advanced: false } })
        return
      case '/api/model/info':
        json(res, { model: 'openrouter/test-model', provider: 'openrouter', effective_context_length: 128000, capabilities: { supports_tools: true } })
        return
      case '/api/providers/oauth':
        json(res, { providers: [{ id: 'github', name: 'GitHub', flow: 'external', status: { logged_in: true } }] })
        return
      case '/api/dashboard/plugins':
        json(res, [{ name: 'hermesxstarcraft', label: 'Hermes x StarCraft', description: 'SC view', icon: 'Puzzle', version: '1', tab: { path: '/plugins/hermesxstarcraft' } }])
        return
      case '/api/dashboard/themes':
        json(res, { active: 'system', themes: [{ name: 'system', label: 'System', description: 'Default' }] })
        return
      case '/api/logs':
        json(res, { file: url.searchParams.get('file') || 'agent', lines: ['INFO ready', 'WARNING check', 'ERROR boom'] })
        return
      default:
        res.writeHead(404)
        res.end('not found')
    }
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  servers.push(server)
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('server did not bind')
  return `http://127.0.0.1:${address.port}`
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>((resolve) => server.close(() => resolve()))))
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

describe('DashboardStateReader', () => {
  it('uses official dashboard API sections and maps built-in tab entities', async () => {
    const home = makeHermesHome()
    writeFile(path.join(home, 'config.yaml'), 'model:\n  default: fallback\n')
    const dashboardUrl = await startMockDashboard()
    const reader = new DashboardStateReader(new HermesStateReader(home), dashboardUrl)

    const state = await reader.getFullState()
    expect(state.source).toMatchObject({ kind: 'dashboard-api', dashboardUrl })
    expect(state.sessions).toHaveLength(1)
    expect(state.stats.totalSessionsEver).toBe(2)
    expect(state.skills.map(skill => skill.name)).toEqual(['browser'])
    expect(state.cronJobs.map(job => job.id)).toEqual(['cron1'])
    expect(state.analytics?.by_model?.[0].model).toBe('openrouter/test-model')
    expect(state.logs?.agent.severityCounts).toMatchObject({ error: 1, warning: 1 })
    expect(state.toolsets?.[0]).toMatchObject({ name: 'web', configured: true })
    expect(state.env?.OPENROUTER_API_KEY.is_set).toBe(true)
    expect(state.oauth?.[0].id).toBe('github')
    expect(state.dashboard?.plugins?.[0].tab.path).toBe('/plugins/hermesxstarcraft')

    const mapper = new EntityMapper(path.join(process.cwd(), 'config', 'mapping.json'))
    const entities = mapper.mapState(state)
    const routes = new Set(entities.map(entity => entity.data.dashboardRoute))
    for (const route of ['/sessions', '/analytics', '/logs', '/cron', '/skills', '/config', '/env', '/docs', '/plugins/hermesxstarcraft']) {
      expect(routes.has(route)).toBe(true)
    }
  })

  it('falls back to direct filesystem state when the dashboard API is unavailable', async () => {
    const home = makeHermesHome()
    writeFile(path.join(home, 'cron', 'jobs.json'), JSON.stringify({ jobs: [{ id: 'fallback-cron', name: 'Fallback cron', schedule: 'every 1h', enabled: true }] }))
    const reader = new DashboardStateReader(new HermesStateReader(home), 'http://127.0.0.1:1')

    const state = await reader.getFullState()
    expect(state.source.kind).toBe('fallback-files')
    expect(state.source.fallbackReason).toBeTruthy()
    expect(state.cronJobs.map(job => job.id)).toEqual(['fallback-cron'])
  })
})
