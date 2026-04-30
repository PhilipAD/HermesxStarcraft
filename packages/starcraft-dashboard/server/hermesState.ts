/**
 * HermesStateReader — Reads Hermes Agent state from SQLite and filesystem.
 * 
 * Sources:
 *   - SQLite: ~/.hermes/state.db (sessions, messages, state_meta)
 *   - Filesystem: ~/.hermes/skills/, ~/.hermes/cron/, ~/.hermes/memories/
 *   - Config: ~/.hermes/config.yaml (model, toolsets, etc.)
 * 
 * Falls back gracefully when data is unavailable.
 */

import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'
import yaml from 'js-yaml'

export interface HermesState {
  source: StateSourceMetadata
  sessions: Session[]
  skills: Skill[]
  cronJobs: CronJob[]
  memory: MemoryEntry[]
  config: HermesConfig
  integrations: HermesIntegrations
  stats: HermesStats
  errors: ErrorEntry[]
  subagents: Subagent[]
  lastUpdated: number
  status?: DashboardStatus
  analytics?: DashboardAnalytics
  logs?: Record<string, DashboardLog>
  toolsets?: DashboardToolset[]
  env?: Record<string, DashboardEnvVar>
  oauth?: DashboardOAuthProvider[]
  dashboard?: DashboardMetadata
  modelInfo?: DashboardModelInfo
  configSchema?: DashboardConfigSchema
  configRaw?: string
}

export interface StateSourceMetadata {
  kind: 'dashboard-api' | 'fallback-files'
  fetchedAt: number
  dashboardUrl?: string
  fallbackReason?: string
}

export interface Session {
  id: string
  source: string
  model: string
  messageCount: number
  toolCallCount: number
  inputTokens: number
  outputTokens: number
  estimatedCost: number
  startedAt: number
  endedAt: number | null
  endReason: string | null
  isActive: boolean
  lastActive: number
  title: string | null
}

export interface Skill {
  name: string
  path: string
  category: string
  enabled: boolean
  lastModified: number
  size: number  // bytes
  description: string
}

export interface CronJob {
  id: string
  name: string
  schedule: string
  enabled: boolean
  lastRun: number | null
  nextRun: number | null
  runCount: number
  errorCount: number
  state?: string
  deliver?: string
  lastError?: string | null
  prompt?: string
}

export interface MemoryEntry {
  type: string
  content: string
  createdAt: number
  accessedAt: number
  tags: string[]
}

export interface HermesConfig {
  agentName: string
  model: string
  provider: string
  toolsets: string[]
  gatewayPlatforms: string[]
  maxIterations: number
  agentVersion: string
}

export interface HermesIntegrations {
  apiKeyGroups: string[]
  envKeyNames: string[]
  gatewayPlatforms: string[]
}

export interface HermesStats {
  totalSessions: number
  activeSessions: number
  totalSessionsEver: number
  totalMessages: number
  totalToolCalls: number
  totalInputTokens: number
  totalOutputTokens: number
  totalErrors: number
  totalCronJobs: number
  activeCronJobs: number
  totalSkills: number
  enabledSkills: number
  memoryEntries: number
  uptime: number
  memoryUsageMB: number
}

export interface ErrorEntry {
  timestamp: number
  message: string
  stack: string
  source: string
}

export interface Subagent {
  id: string
  model: string
  parentSession: string
  startedAt: number
  endedAt: number | null
  status: 'running' | 'completed' | 'failed'
}

export interface DashboardStatus {
  active_sessions?: number
  config_path?: string
  env_path?: string
  gateway_running?: boolean
  gateway_state?: string | null
  gateway_platforms?: Record<string, any>
  gateway_exit_reason?: string | null
  gateway_updated_at?: string | null
  hermes_home?: string
  version?: string
  release_date?: string
  [key: string]: any
}

export interface DashboardAnalytics {
  daily?: Array<Record<string, any>>
  by_model?: Array<Record<string, any>>
  totals?: Record<string, any>
  skills?: {
    summary?: Record<string, any>
    top_skills?: Array<Record<string, any>>
  }
  period_days?: number
}

export interface DashboardLog {
  file: string
  lines: string[]
  severityCounts: Record<'error' | 'warning' | 'info' | 'debug', number>
}

export interface DashboardToolset {
  name: string
  label: string
  description: string
  enabled: boolean
  configured: boolean
  tools: string[]
  available?: boolean
}

export interface DashboardEnvVar {
  is_set: boolean
  redacted_value: string | null
  description: string
  url: string | null
  category: string
  is_password: boolean
  tools: string[]
  advanced: boolean
}

export interface DashboardOAuthProvider {
  id: string
  name: string
  flow: string
  cli_command?: string
  docs_url?: string
  status?: Record<string, any>
}

export interface DashboardMetadata {
  docsUrl: string
  activeTheme?: string
  themes?: Array<Record<string, any>>
  plugins?: Array<{
    name: string
    label: string
    description: string
    icon: string
    version: string
    tab: { path: string; position?: string; override?: string; hidden?: boolean }
  }>
}

export interface DashboardModelInfo {
  model?: string
  provider?: string
  auto_context_length?: number
  config_context_length?: number
  effective_context_length?: number
  capabilities?: Record<string, any>
}

export interface DashboardConfigSchema {
  fields?: Record<string, any>
  category_order?: string[]
}

export class HermesStateReader {
  private hermesHome: string
  private db: Database.Database | null = null
  private config: HermesConfig | null = null
  private lastStats: HermesStats = {
    totalSessions: 0, activeSessions: 0, totalSessionsEver: 0,
    totalMessages: 0, totalToolCalls: 0, totalInputTokens: 0,
    totalOutputTokens: 0, totalErrors: 0, totalCronJobs: 0,
    activeCronJobs: 0, totalSkills: 0, enabledSkills: 0,
    memoryEntries: 0, uptime: 0, memoryUsageMB: 0
  }

  constructor(hermesHome: string) {
    this.hermesHome = hermesHome
    this.connect()
    this.loadConfig()
  }

  private connect() {
    const dbPath = path.join(this.hermesHome, 'state.db')
    if (!fs.existsSync(dbPath)) {
      console.warn(`[StateReader] DB not found: ${dbPath}`)
      return
    }
    try {
      this.db = new Database(dbPath, { readonly: true })
      console.log(`[StateReader] Connected to: ${dbPath}`)
    } catch (err) {
      console.warn(`[StateReader] DB open failed:`, err)
    }
  }

  private loadConfig() {
    const configPath = path.join(this.hermesHome, 'config.yaml')
    try {
      if (fs.existsSync(configPath)) {
        const raw = fs.readFileSync(configPath, 'utf-8')
        const cfg = yaml.load(raw) as any
        this.config = {
          agentName: this.extractAgentName(cfg),
          model: cfg?.model?.default || 'unknown',
          provider: cfg?.model?.provider || 'unknown',
          toolsets: cfg?.toolsets || [],
          gatewayPlatforms: this.extractGatewayPlatforms(cfg),
          maxIterations: cfg?.agent?.max_turns || 90,
          agentVersion: '1.x'
        }
      }
    } catch (err) {
      this.config = {
        agentName: 'Hermes Agent', model: 'unknown', provider: 'unknown',
        toolsets: [], gatewayPlatforms: [], maxIterations: 90, agentVersion: 'unknown'
      }
    }
  }

  getFullState(): HermesState {
    return {
      source: { kind: 'fallback-files', fetchedAt: Date.now() },
      sessions: this.getSessions(),
      skills: this.getSkills(),
      cronJobs: this.getCronJobs(),
      memory: this.getMemory(),
      config: this.config || {
        agentName: 'Hermes Agent', model: 'unknown', provider: 'unknown',
        toolsets: [], gatewayPlatforms: [], maxIterations: 90, agentVersion: 'unknown'
      },
      integrations: this.getIntegrations(),
      stats: this.getStats(),
      errors: this.getErrors(),
      subagents: this.getSubagents(),
      lastUpdated: Date.now()
    }
  }

  getSessions(): Session[] {
    if (!this.db) return []
    try {
      const rows = this.db.prepare(`
        SELECT s.id, s.source, s.user_id, s.model, s.model_config, s.system_prompt,
               parent_session_id, started_at, ended_at, end_reason,
               message_count, tool_call_count, input_tokens, output_tokens,
               cache_read_tokens, cache_write_tokens, reasoning_tokens,
               billing_provider, billing_base_url, billing_mode,
               estimated_cost_usd, actual_cost_usd, cost_status,
               cost_source, pricing_version, title, api_call_count,
               COALESCE(m.last_active, s.started_at) AS last_active
        FROM sessions s
        LEFT JOIN (
          SELECT session_id, MAX(timestamp) AS last_active
          FROM messages
          GROUP BY session_id
        ) m ON m.session_id = s.id
        ORDER BY last_active DESC, started_at DESC
        LIMIT 500
      `).all() as any[]

      const now = Date.now() / 1000
      return rows.map(r => ({
        id: r.id,
        source: r.source,
        model: r.model,
        messageCount: r.message_count || 0,
        toolCallCount: r.tool_call_count || 0,
        inputTokens: r.input_tokens || 0,
        outputTokens: r.output_tokens || 0,
        estimatedCost: r.estimated_cost_usd || 0,
        startedAt: r.started_at,
        endedAt: r.ended_at,
        endReason: r.end_reason,
        isActive: r.ended_at === null && (now - (r.last_active || r.started_at || 0)) < 300,
        lastActive: r.last_active || r.started_at || 0,
        title: r.title
      }))
    } catch (err) {
      console.warn('[StateReader] Sessions query failed:', err)
      return []
    }
  }

  getSkills(): Skill[] {
    const skillsDir = path.join(this.hermesHome, 'skills')
    const skills: Skill[] = []
    const seenNames = new Set<string>()
    const disabled = this.getDisabledSkills()
    const roots = [
      ...(fs.existsSync(skillsDir) ? [skillsDir] : []),
      ...this.getExternalSkillsDirs(skillsDir),
    ]

    for (const root of roots) {
      for (const skillMd of this.findSkillFiles(root)) {
        try {
          const stat = fs.statSync(skillMd)
          const content = fs.readFileSync(skillMd, 'utf-8')
          const { frontmatter, body } = this.parseFrontmatter(content)
          if (!this.skillMatchesPlatform(frontmatter)) continue

          const skillDir = path.dirname(skillMd)
          const name = String(frontmatter.name || path.basename(skillDir)).slice(0, 120)
          if (!name || seenNames.has(name)) continue

          const description = this.extractSkillDescription(frontmatter, body)
          seenNames.add(name)
          skills.push({
            name,
            path: skillDir,
            category: this.getSkillCategory(root, skillMd),
            enabled: !disabled.has(name),
            lastModified: stat.mtimeMs,
            size: stat.size,
            description
          })
        } catch {}
      }
    }

    return skills
  }

  getCronJobs(): CronJob[] {
    const jobsPath = path.join(this.hermesHome, 'cron', 'jobs.json')
    if (!fs.existsSync(jobsPath)) return []

    try {
      const raw = JSON.parse(fs.readFileSync(jobsPath, 'utf-8'))
      const rawJobs = Array.isArray(raw?.jobs) ? raw.jobs : Array.isArray(raw) ? raw : []
      return rawJobs.map((job: any) => ({
        id: String(job.id || job.job_id || ''),
        name: String(job.name || job.prompt || job.id || 'Cron job'),
        schedule: this.formatCronSchedule(job.schedule),
        enabled: job.enabled !== false && job.state !== 'paused',
        lastRun: this.toTimestamp(job.last_run_at || job.last_run),
        nextRun: this.toTimestamp(job.next_run_at || job.next_run),
        runCount: Number(job.run_count || job.completed_runs || 0),
        errorCount: Number(job.error_count || (job.last_error ? 1 : 0) || 0)
      })).filter((job: CronJob) => job.id)
    } catch {}

    return []
  }

  getMemory(): MemoryEntry[] {
    const memoriesDir = path.join(this.hermesHome, 'memories')
    if (!fs.existsSync(memoriesDir)) return []
    
    const entries: MemoryEntry[] = []
    
    try {
      const scanMemoryDir = (dir: string) => {
        for (const file of fs.readdirSync(dir)) {
          const fullPath = path.join(dir, file)
          if (fs.statSync(fullPath).isDirectory()) {
            scanMemoryDir(fullPath)
          } else if (file.endsWith('.json') || file.endsWith('.md')) {
            try {
              const stat = fs.statSync(fullPath)
              const content = file.endsWith('.json') 
                ? JSON.parse(fs.readFileSync(fullPath, 'utf-8'))
                : { content: fs.readFileSync(fullPath, 'utf-8').substring(0, 500) }
              entries.push({
                type: file.endsWith('.json') ? 'structured' : 'note',
                content: content.content || content.text || '',
                createdAt: stat.birthtimeMs,
                accessedAt: stat.mtimeMs,
                tags: content.tags || []
              })
            } catch {}
          }
        }
      }
      scanMemoryDir(memoriesDir)
    } catch {}

    return entries
  }

  getErrors(): ErrorEntry[] {
    const logsDir = path.join(this.hermesHome, 'logs')
    const errors: ErrorEntry[] = []
    
    if (!fs.existsSync(logsDir)) return errors
    
    try {
      const errorLog = path.join(logsDir, 'errors.log')
      if (fs.existsSync(errorLog)) {
        const lines = fs.readFileSync(errorLog, 'utf-8').split('\n').slice(-50)
        for (const line of lines) {
          if (!line.trim()) continue
          try {
            // Try JSON log format
            const parsed = JSON.parse(line)
            errors.push({
              timestamp: parsed.timestamp || Date.now(),
              message: parsed.message || line,
              stack: parsed.stack || '',
              source: parsed.level || 'error'
            })
          } catch {
            // Plain text
            errors.push({
              timestamp: Date.now(),
              message: line.substring(0, 200),
              stack: '',
              source: 'log'
            })
          }
        }
      }
    } catch {}

    return errors.slice(-20)
  }

  getSubagents(): Subagent[] {
    // Subagents are tracked in sessions with parent_session_id
    if (!this.db) return []
    try {
      const rows = this.db.prepare(`
        SELECT id, model, parent_session_id, started_at, ended_at
        FROM sessions
        WHERE parent_session_id IS NOT NULL
        ORDER BY started_at DESC
        LIMIT 100
      `).all() as any[]

      return rows.map(r => ({
        id: r.id,
        model: r.model,
        parentSession: r.parent_session_id,
        startedAt: r.started_at,
        endedAt: r.ended_at,
        status: r.ended_at ? 'completed' : 'running'
      }))
    } catch {
      return []
    }
  }

  getIntegrations(): HermesIntegrations {
    const envKeyNames = this.getEnvKeyNames()
    const apiKeyGroups = this.getApiKeyGroups(envKeyNames)
    const gatewayPlatforms = Array.from(new Set([
      ...(this.config?.gatewayPlatforms || []),
      ...this.getPlatformNamesFromEnv(envKeyNames)
    ])).sort()
    return { apiKeyGroups, envKeyNames, gatewayPlatforms }
  }

  private getEnvKeyNames(): string[] {
    const names = new Set<string>()
    for (const key of Object.keys(process.env)) {
      if (this.isSecretLikeKey(key) && process.env[key]) names.add(key)
    }
    const envPath = path.join(this.hermesHome, '.env')
    try {
      if (fs.existsSync(envPath)) {
        const lines = fs.readFileSync(envPath, 'utf-8').split(/\r?\n/)
        for (const line of lines) {
          const match = line.match(/^\s*([A-Z0-9_]+)\s*=/)
          if (match && this.isSecretLikeKey(match[1])) names.add(match[1])
        }
      }
    } catch {}
    return Array.from(names).sort()
  }

  private isSecretLikeKey(key: string): boolean {
    return /(?:API_KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|AUTH)$/i.test(key)
  }

  private getApiKeyGroups(envKeyNames: string[]): string[] {
    const groups = new Set<string>()
    const provider = this.config?.provider
    if (provider && provider !== 'unknown') groups.add('LLM providers')
    if (envKeyNames.some(k => /(?:OPENAI|ANTHROPIC|OPENROUTER|GOOGLE|GEMINI|GROQ|MISTRAL|DEEPSEEK|XAI|GLM|KIMI|DASHSCOPE|MINIMAX|AI_GATEWAY|MOONSHOT|VOYAGE|COHERE)/.test(k))) {
      groups.add('LLM providers')
    }
    if (envKeyNames.some(k => /(?:FIRECRAWL|TAVILY|EXA|PARALLEL|GITHUB|BROWSERBASE|DAYTONA|LINEAR|SENTRY|DATADOG|SERP|BRAVE|SEARCH)/.test(k))) {
      groups.add('Tool APIs')
    }
    if (envKeyNames.some(k => /(?:SLACK|DISCORD|TELEGRAM|MATRIX|TWILIO|LINE_|WHATSAPP|NOTION|GOOGLE_DRIVE|GMAIL|YOUTUBE|VERCEL|NETLIFY)/.test(k))) {
      groups.add('Platform tokens')
    }
    return Array.from(groups)
  }

  private getPlatformNamesFromEnv(envKeyNames: string[]): string[] {
    const names: string[] = []
    const platformPatterns: Array<[string, RegExp]> = [
      ['slack', /SLACK/],
      ['discord', /DISCORD/],
      ['telegram', /TELEGRAM/],
      ['matrix', /MATRIX/],
      ['twilio', /TWILIO/],
      ['line', /LINE_/],
      ['notion', /NOTION/]
    ]
    for (const [name, pattern] of platformPatterns) {
      if (envKeyNames.some(k => pattern.test(k))) names.push(name)
    }
    return names
  }

  private extractGatewayPlatforms(cfg: any): string[] {
    const raw = cfg?.gateway?.platforms || cfg?.platforms || cfg?.messaging?.platforms || {}
    if (Array.isArray(raw)) return raw.map(String)
    if (raw && typeof raw === 'object') return Object.keys(raw).filter(k => raw[k] !== false)
    return []
  }

  private extractAgentName(cfg: any): string {
    const candidates = [
      cfg?.agent?.name,
      cfg?.agent?.display_name,
      cfg?.agent?.displayName,
      cfg?.identity?.name,
      cfg?.profile?.name,
      cfg?.name,
    ]
    const hit = candidates.find(v => typeof v === 'string' && v.trim().length > 0)
    return hit ? hit.trim() : 'Hermes Agent'
  }

  getStats(): HermesStats {
    const sessions = this.getSessions()
    const skills = this.getSkills()
    const cronJobs = this.getCronJobs()
    const memory = this.getMemory()
    const errors = this.getErrors()

    const activeSessions = sessions.filter(s => s.isActive).length
    const activeCronJobs = cronJobs.filter(j => j.enabled).length

    // Total tokens from sessions
    let totalInputTokens = 0
    let totalOutputTokens = 0
    for (const s of sessions) {
      totalInputTokens += s.inputTokens
      totalOutputTokens += s.outputTokens
    }

    const memUsage = process.memoryUsage()

    return {
      totalSessions: sessions.length,
      activeSessions,
      totalSessionsEver: this.getSessionCount(),
      totalMessages: sessions.reduce((a, s) => a + s.messageCount, 0),
      totalToolCalls: sessions.reduce((a, s) => a + s.toolCallCount, 0),
      totalInputTokens,
      totalOutputTokens,
      totalErrors: errors.length,
      totalCronJobs: cronJobs.length,
      activeCronJobs,
      totalSkills: skills.length,
      enabledSkills: skills.filter(s => s.enabled).length,
      memoryEntries: memory.length,
      uptime: process.uptime(),
      memoryUsageMB: Math.round(memUsage.heapUsed / 1024 / 1024)
    }
  }

  close() {
    this.db?.close()
  }

  private findSkillFiles(root: string): string[] {
    const matches: string[] = []
    const walk = (dir: string) => {
      let entries: fs.Dirent[]
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true })
      } catch {
        return
      }

      if (entries.some(entry => entry.isFile() && entry.name === 'SKILL.md')) {
        matches.push(path.join(dir, 'SKILL.md'))
      }

      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        if (entry.name === '.git' || entry.name === '.github' || entry.name === '.hub') continue
        walk(path.join(dir, entry.name))
      }
    }

    walk(root)
    return matches.sort((a, b) => path.relative(root, a).localeCompare(path.relative(root, b)))
  }

  private parseFrontmatter(content: string): { frontmatter: any, body: string } {
    if (!content.startsWith('---')) return { frontmatter: {}, body: content }
    const match = content.slice(3).match(/\n---\s*\n/)
    if (!match || match.index === undefined) return { frontmatter: {}, body: content }

    const yamlText = content.slice(3, match.index + 3)
    const body = content.slice(match.index + match[0].length + 3)
    try {
      const parsed = yaml.load(yamlText)
      return { frontmatter: parsed && typeof parsed === 'object' ? parsed : {}, body }
    } catch {
      const frontmatter: Record<string, string> = {}
      for (const line of yamlText.split(/\r?\n/)) {
        const idx = line.indexOf(':')
        if (idx > 0) frontmatter[line.slice(0, idx).trim()] = line.slice(idx + 1).trim()
      }
      return { frontmatter, body }
    }
  }

  private skillMatchesPlatform(frontmatter: any): boolean {
    const raw = frontmatter?.platforms
    if (!raw) return true
    const platforms = Array.isArray(raw) ? raw : [raw]
    const current = process.platform
    const platformMap: Record<string, string> = { macos: 'darwin', linux: 'linux', windows: 'win32' }
    return platforms.some((platform: unknown) => {
      const normalized = String(platform).toLowerCase().trim()
      const mapped = platformMap[normalized] || normalized
      return current.startsWith(mapped)
    })
  }

  private extractSkillDescription(frontmatter: any, body: string): string {
    const fromFrontmatter = frontmatter?.description
    if (typeof fromFrontmatter === 'string' && fromFrontmatter.trim()) {
      return fromFrontmatter.trim().slice(0, 500)
    }
    const line = body.split(/\r?\n/).map(l => l.trim()).find(l => l && !l.startsWith('#'))
    return (line || '').slice(0, 500)
  }

  private getSkillCategory(root: string, skillMd: string): string {
    const relativeParts = path.relative(root, skillMd).split(path.sep)
    return relativeParts.length >= 3 ? relativeParts[0] : 'general'
  }

  private getDisabledSkills(): Set<string> {
    const skillsCfg = (this.config as any)?.skills
    if (skillsCfg && typeof skillsCfg === 'object' && Array.isArray(skillsCfg.disabled)) {
      return new Set(skillsCfg.disabled.map(String))
    }
    try {
      const configPath = path.join(this.hermesHome, 'config.yaml')
      if (!fs.existsSync(configPath)) return new Set()
      const cfg = yaml.load(fs.readFileSync(configPath, 'utf-8')) as any
      const disabled = cfg?.skills?.disabled
      return new Set(Array.isArray(disabled) ? disabled.map(String) : [])
    } catch {
      return new Set()
    }
  }

  private getExternalSkillsDirs(localSkillsDir: string): string[] {
    let rawDirs: unknown
    try {
      const configPath = path.join(this.hermesHome, 'config.yaml')
      if (fs.existsSync(configPath)) {
        const cfg = yaml.load(fs.readFileSync(configPath, 'utf-8')) as any
        rawDirs = cfg?.skills?.external_dirs
      }
    } catch {}
    const entries = typeof rawDirs === 'string' ? [rawDirs] : Array.isArray(rawDirs) ? rawDirs : []
    const local = path.resolve(localSkillsDir)
    const seen = new Set<string>()
    const dirs: string[] = []
    for (const entry of entries) {
      const expanded = String(entry)
        .replace(/^~(?=$|\/)/, process.env.HOME || '')
        .replace(/\$\{([^}]+)\}|\$([A-Z0-9_]+)/gi, (_, braced, bare) => process.env[braced || bare] || '')
      const resolved = path.resolve(expanded)
      if (resolved === local || seen.has(resolved) || !fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) continue
      seen.add(resolved)
      dirs.push(resolved)
    }
    return dirs
  }

  private formatCronSchedule(schedule: any): string {
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

  private getSessionCount(): number {
    if (!this.db) return this.lastStats.totalSessionsEver
    try {
      const row = this.db.prepare('SELECT COUNT(*) AS count FROM sessions').get() as any
      return Number(row?.count || 0)
    } catch {
      return this.lastStats.totalSessionsEver
    }
  }
}
