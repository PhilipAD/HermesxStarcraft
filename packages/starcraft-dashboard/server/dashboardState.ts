import type {
  CronJob,
  DashboardAnalytics,
  DashboardEnvVar,
  DashboardLog,
  DashboardMetadata,
  DashboardOAuthProvider,
  DashboardStatus,
  DashboardToolset,
  ErrorEntry,
  HermesConfig,
  HermesIntegrations,
  HermesState,
  HermesStateReader,
  HermesStats,
  Session,
  Skill,
} from './hermesState.js'

const DEFAULT_DASHBOARD_URL = 'http://127.0.0.1:9119'
const REQUEST_TIMEOUT_MS = 2500
const DOCS_URL = 'https://hermes-agent.nousresearch.com/docs/'

type FetchResult<T> = { ok: true; value: T } | { ok: false; error: string }

interface DashboardSessionsResponse {
  sessions?: any[]
  total?: number
}

export class DashboardStateReader {
  constructor(
    private readonly fallback: HermesStateReader,
    private readonly dashboardUrl = process.env.HERMES_DASHBOARD_URL || DEFAULT_DASHBOARD_URL,
  ) {}

  async getFullState(): Promise<HermesState> {
    const fallbackState = this.fallback.getFullState()
    const baseUrl = this.dashboardUrl.replace(/\/+$/, '')

    try {
      const token = await this.getSessionToken(baseUrl)
      const headers: Record<string, string> = token ? { 'X-Hermes-Session-Token': token } : {}
      const [
        status,
        sessions,
        analytics,
        cronJobs,
        skills,
        toolsets,
        config,
        configSchema,
        configRaw,
        env,
        modelInfo,
        oauth,
        plugins,
        themes,
        agentLogs,
        errorLogs,
        gatewayLogs,
      ] = await Promise.all([
        this.getJson<DashboardStatus>(baseUrl, '/api/status', headers),
        this.getJson<DashboardSessionsResponse>(baseUrl, '/api/sessions?limit=500&offset=0', headers),
        this.getJson<DashboardAnalytics>(baseUrl, '/api/analytics/usage?days=30', headers),
        this.getJson<any[]>(baseUrl, '/api/cron/jobs', headers),
        this.getJson<any[]>(baseUrl, '/api/skills', headers),
        this.getJson<DashboardToolset[]>(baseUrl, '/api/tools/toolsets', headers),
        this.getJson<Record<string, any>>(baseUrl, '/api/config', headers),
        this.getJson<any>(baseUrl, '/api/config/schema', headers),
        this.getJson<{ yaml: string }>(baseUrl, '/api/config/raw', headers),
        this.getJson<Record<string, DashboardEnvVar>>(baseUrl, '/api/env', headers),
        this.getJson<any>(baseUrl, '/api/model/info', headers),
        this.getJson<{ providers?: DashboardOAuthProvider[] }>(baseUrl, '/api/providers/oauth', headers),
        this.getJson<any[]>(baseUrl, '/api/dashboard/plugins', headers),
        this.getJson<any>(baseUrl, '/api/dashboard/themes', headers),
        this.getJson<{ file: string; lines: string[] }>(baseUrl, '/api/logs?file=agent&lines=200', headers),
        this.getJson<{ file: string; lines: string[] }>(baseUrl, '/api/logs?file=errors&lines=200', headers),
        this.getJson<{ file: string; lines: string[] }>(baseUrl, '/api/logs?file=gateway&lines=200', headers),
      ])

      const critical = [status, sessions, cronJobs, skills]
      const failures = critical.filter(r => !r.ok).map(r => r.ok ? '' : r.error)
      if (failures.length === critical.length) {
        throw new Error(failures[0] || 'dashboard API unavailable')
      }

      const logs = this.mergeLogs(agentLogs, errorLogs, gatewayLogs)
      const mappedSessions = sessions.ok ? this.mapSessions(sessions.value.sessions || []) : fallbackState.sessions
      const mappedSkills = skills.ok ? this.mapSkills(skills.value, fallbackState.skills) : fallbackState.skills
      const mappedCron = cronJobs.ok ? this.mapCronJobs(cronJobs.value) : fallbackState.cronJobs
      const mappedErrors = logs.errors?.lines?.length ? this.mapLogErrors(logs.errors.lines) : fallbackState.errors
      const mappedToolsets = toolsets.ok ? toolsets.value : fallbackState.toolsets
      const mappedEnv = env.ok ? env.value : fallbackState.env
      const mappedStatus = status.ok ? status.value : fallbackState.status
      const mappedAnalytics = analytics.ok ? analytics.value : fallbackState.analytics
      const mappedConfig = config.ok ? this.mapConfig(config.value, fallbackState.config) : fallbackState.config
      const mappedIntegrations = this.mapIntegrations(mappedEnv, mappedStatus, fallbackState.integrations)
      const mappedStats = this.mapStats({
        fallback: fallbackState.stats,
        sessions: mappedSessions,
        sessionsTotal: sessions.ok ? sessions.value.total : undefined,
        skills: mappedSkills,
        cronJobs: mappedCron,
        analytics: mappedAnalytics,
        errors: mappedErrors,
        memoryEntries: fallbackState.memory.length,
        activeSessions: mappedStatus?.active_sessions,
      })

      return {
        ...fallbackState,
        source: { kind: 'dashboard-api', fetchedAt: Date.now(), dashboardUrl: baseUrl },
        sessions: mappedSessions,
        skills: mappedSkills,
        cronJobs: mappedCron,
        config: mappedConfig,
        integrations: mappedIntegrations,
        stats: mappedStats,
        errors: mappedErrors,
        status: mappedStatus,
        analytics: mappedAnalytics,
        logs,
        toolsets: mappedToolsets,
        env: mappedEnv,
        oauth: oauth.ok ? oauth.value.providers || [] : fallbackState.oauth,
        dashboard: this.mapDashboard(plugins, themes),
        modelInfo: modelInfo.ok ? modelInfo.value : fallbackState.modelInfo,
        configSchema: configSchema.ok ? configSchema.value : fallbackState.configSchema,
        configRaw: configRaw.ok ? configRaw.value.yaml : fallbackState.configRaw,
        lastUpdated: Date.now(),
      }
    } catch (err) {
      return {
        ...fallbackState,
        source: {
          kind: 'fallback-files',
          fetchedAt: Date.now(),
          dashboardUrl: baseUrl,
          fallbackReason: err instanceof Error ? err.message : String(err),
        },
      }
    }
  }

  close() {
    this.fallback.close()
  }

  private async getSessionToken(baseUrl: string): Promise<string | null> {
    const html = await this.getText(baseUrl, '/sessions')
    const match = html.match(/__HERMES_SESSION_TOKEN__\s*=\s*"([^"]+)"/)
    return match?.[1] || null
  }

  private async getText(baseUrl: string, path: string): Promise<string> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    try {
      const response = await fetch(`${baseUrl}${path}`, { signal: controller.signal })
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
      return await response.text()
    } finally {
      clearTimeout(timeout)
    }
  }

  private async getJson<T>(baseUrl: string, path: string, headers: Record<string, string>): Promise<FetchResult<T>> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    try {
      const response = await fetch(`${baseUrl}${path}`, { headers, signal: controller.signal })
      if (!response.ok) return { ok: false, error: `${path}: ${response.status} ${response.statusText}` }
      return { ok: true, value: await response.json() as T }
    } catch (err) {
      return { ok: false, error: `${path}: ${err instanceof Error ? err.message : String(err)}` }
    } finally {
      clearTimeout(timeout)
    }
  }

  private mapSessions(rows: any[]): Session[] {
    return rows.map(row => ({
      id: String(row.id || ''),
      source: String(row.source || 'unknown'),
      model: String(row.model || 'unknown'),
      messageCount: Number(row.message_count || 0),
      toolCallCount: Number(row.tool_call_count || 0),
      inputTokens: Number(row.input_tokens || 0),
      outputTokens: Number(row.output_tokens || 0),
      estimatedCost: Number(row.estimated_cost_usd || row.estimated_cost || 0),
      startedAt: Number(row.started_at || 0),
      endedAt: row.ended_at ?? null,
      endReason: row.end_reason ?? null,
      isActive: Boolean(row.is_active),
      lastActive: Number(row.last_active || row.started_at || 0),
      title: row.title ?? row.preview ?? null,
    })).filter(s => s.id)
  }

  private mapSkills(rows: any[], fallback: Skill[]): Skill[] {
    const fallbackByName = new Map(fallback.map(skill => [skill.name, skill]))
    return rows.map(row => {
      const prior = fallbackByName.get(String(row.name))
      return {
        name: String(row.name || ''),
        path: prior?.path || '',
        category: row.category ? String(row.category) : 'general',
        enabled: row.enabled !== false,
        lastModified: prior?.lastModified || 0,
        size: prior?.size || 0,
        description: String(row.description || ''),
      }
    }).filter(skill => skill.name)
  }

  private mapCronJobs(rows: any[]): CronJob[] {
    return rows.map(row => ({
      id: String(row.id || row.job_id || ''),
      name: String(row.name || row.prompt || row.id || 'Cron job'),
      schedule: this.formatSchedule(row.schedule, row.schedule_display),
      enabled: row.enabled !== false && row.state !== 'paused',
      lastRun: this.toTimestamp(row.last_run_at || row.last_run),
      nextRun: this.toTimestamp(row.next_run_at || row.next_run),
      runCount: Number(row.run_count || row.completed_runs || 0),
      errorCount: Number(row.error_count || (row.last_error ? 1 : 0) || 0),
      state: row.state,
      deliver: row.deliver,
      lastError: row.last_error ?? null,
      prompt: row.prompt,
    })).filter(job => job.id)
  }

  private mapConfig(config: Record<string, any>, fallback: HermesConfig): HermesConfig {
    const model = typeof config.model === 'object' && config.model
      ? config.model.default || fallback.model
      : typeof config.model === 'string'
        ? config.model
        : fallback.model
    const provider = typeof config.model === 'object' && config.model
      ? config.model.provider || fallback.provider
      : fallback.provider
    return {
      agentName: config.agent?.name || config.name || fallback.agentName,
      model,
      provider,
      toolsets: Array.isArray(config.toolsets) ? config.toolsets.map(String) : fallback.toolsets,
      gatewayPlatforms: this.gatewayPlatformsFromStatus(undefined, fallback.gatewayPlatforms),
      maxIterations: Number(config.agent?.max_turns || fallback.maxIterations),
      agentVersion: config.version || fallback.agentVersion,
    }
  }

  private mapIntegrations(
    env: Record<string, DashboardEnvVar> | undefined,
    status: DashboardStatus | undefined,
    fallback: HermesIntegrations,
  ): HermesIntegrations {
    if (!env) return fallback
    const envKeyNames = Object.entries(env).filter(([, info]) => info?.is_set).map(([key]) => key).sort()
    const apiKeyGroups = Array.from(new Set(Object.values(env).filter(info => info?.is_set).map(info => info.category || 'setting'))).sort()
    return {
      envKeyNames,
      apiKeyGroups: apiKeyGroups.length ? apiKeyGroups : fallback.apiKeyGroups,
      gatewayPlatforms: this.gatewayPlatformsFromStatus(status, fallback.gatewayPlatforms),
    }
  }

  private gatewayPlatformsFromStatus(status: DashboardStatus | undefined, fallback: string[]): string[] {
    const platforms = status?.gateway_platforms
    if (!platforms || typeof platforms !== 'object') return fallback
    return Object.keys(platforms).sort()
  }

  private mapStats(input: {
    fallback: HermesStats
    sessions: Session[]
    sessionsTotal?: number
    skills: Skill[]
    cronJobs: CronJob[]
    analytics?: DashboardAnalytics
    errors: ErrorEntry[]
    memoryEntries: number
    activeSessions?: number
  }): HermesStats {
    const totals = input.analytics?.totals || {}
    const activeSessions = input.activeSessions ?? input.sessions.filter(s => s.isActive).length
    return {
      ...input.fallback,
      totalSessions: input.sessions.length,
      activeSessions,
      totalSessionsEver: Number(input.sessionsTotal || totals.total_sessions || input.fallback.totalSessionsEver),
      totalMessages: input.sessions.reduce((sum, session) => sum + session.messageCount, 0),
      totalToolCalls: input.sessions.reduce((sum, session) => sum + session.toolCallCount, 0),
      totalInputTokens: Number(totals.total_input || input.sessions.reduce((sum, session) => sum + session.inputTokens, 0)),
      totalOutputTokens: Number(totals.total_output || input.sessions.reduce((sum, session) => sum + session.outputTokens, 0)),
      totalErrors: input.errors.length,
      totalCronJobs: input.cronJobs.length,
      activeCronJobs: input.cronJobs.filter(job => job.enabled).length,
      totalSkills: input.skills.length,
      enabledSkills: input.skills.filter(skill => skill.enabled).length,
      memoryEntries: input.memoryEntries,
      memoryUsageMB: input.fallback.memoryUsageMB,
      uptime: input.fallback.uptime,
    }
  }

  private mergeLogs(...results: Array<FetchResult<{ file: string; lines: string[] }>>): Record<string, DashboardLog> {
    const logs: Record<string, DashboardLog> = {}
    for (const result of results) {
      if (!result.ok) continue
      const key = result.value.file || 'log'
      logs[key] = {
        file: key,
        lines: result.value.lines || [],
        severityCounts: this.countSeverities(result.value.lines || []),
      }
    }
    return logs
  }

  private countSeverities(lines: string[]): DashboardLog['severityCounts'] {
    const counts = { error: 0, warning: 0, info: 0, debug: 0 }
    for (const line of lines) {
      const upper = line.toUpperCase()
      if (upper.includes('ERROR') || upper.includes('CRITICAL') || upper.includes('FATAL')) counts.error++
      else if (upper.includes('WARNING') || upper.includes('WARN')) counts.warning++
      else if (upper.includes('DEBUG')) counts.debug++
      else counts.info++
    }
    return counts
  }

  private mapLogErrors(lines: string[]): ErrorEntry[] {
    return lines.filter(line => line.trim()).slice(-50).map(line => ({
      timestamp: Date.now(),
      message: line.slice(0, 200),
      stack: '',
      source: 'dashboard-errors-log',
    }))
  }

  private mapDashboard(
    plugins: FetchResult<any[]>,
    themes: FetchResult<any>,
  ): DashboardMetadata {
    return {
      docsUrl: DOCS_URL,
      plugins: plugins.ok ? plugins.value : [],
      activeTheme: themes.ok ? themes.value.active : undefined,
      themes: themes.ok ? themes.value.themes || [] : [],
    }
  }

  private formatSchedule(schedule: any, display?: string): string {
    if (display) return String(display)
    if (!schedule) return 'unknown'
    if (typeof schedule === 'string') return schedule
    if (typeof schedule.display === 'string') return schedule.display
    if (typeof schedule.expr === 'string') return schedule.expr
    return JSON.stringify(schedule)
  }

  private toTimestamp(value: any): number | null {
    if (value === null || value === undefined || value === '') return null
    if (typeof value === 'number') return value
    const parsed = Date.parse(String(value))
    return Number.isNaN(parsed) ? null : parsed / 1000
  }
}
