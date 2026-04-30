import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it } from 'vitest'

import { HermesStateReader } from '../server/hermesState'

const tempRoots: string[] = []

function makeHermesHome(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-state-reader-'))
  tempRoots.push(root)
  return root
}

function writeFile(filePath: string, content: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, content)
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

describe('HermesStateReader dashboard source parity', () => {
  it('reads cron jobs from the dashboard jobs.json store', () => {
    const home = makeHermesHome()
    writeFile(path.join(home, 'cron', 'jobs.json'), JSON.stringify({
      jobs: [
        {
          id: 'daily',
          name: 'Daily Plan',
          prompt: 'plan',
          schedule: { kind: 'cron', expr: '0 9 * * *', display: '0 9 * * *' },
          enabled: true,
          state: 'scheduled',
          last_run_at: '2026-04-29T09:00:00Z',
        },
        {
          id: 'paused',
          prompt: 'paused prompt',
          schedule: { kind: 'interval', minutes: 60, display: 'every 60m' },
          enabled: true,
          state: 'paused',
        },
      ],
    }))

    const reader = new HermesStateReader(home)
    const jobs = reader.getCronJobs()

    expect(jobs).toHaveLength(2)
    expect(jobs[0]).toMatchObject({
      id: 'daily',
      name: 'Daily Plan',
      schedule: '0 9 * * *',
      enabled: true,
    })
    expect(jobs[0].lastRun).toBe(1777453200)
    expect(jobs[1]).toMatchObject({
      id: 'paused',
      name: 'paused prompt',
      schedule: 'every 60m',
      enabled: false,
    })
  })

  it('matches dashboard skill discovery rules for frontmatter, platform, dedup, and external dirs', () => {
    const home = makeHermesHome()
    const external = path.join(home, 'external-skills')
    writeFile(path.join(home, 'config.yaml'), [
      'skills:',
      '  disabled:',
      '    - disabled-skill',
      '  external_dirs:',
      `    - ${external}`,
      '',
    ].join('\n'))
    writeFile(path.join(home, 'skills', 'devops', 'enabled', 'SKILL.md'), [
      '---',
      'name: enabled-skill',
      'description: Enabled from frontmatter',
      'platforms: [linux]',
      '---',
      'Body description',
      '',
    ].join('\n'))
    writeFile(path.join(home, 'skills', 'devops', 'disabled', 'SKILL.md'), [
      '---',
      'name: disabled-skill',
      'description: Disabled from config',
      '---',
      '',
    ].join('\n'))
    writeFile(path.join(home, 'skills', 'macos', 'only', 'SKILL.md'), [
      '---',
      'name: mac-only',
      'platforms: [macos]',
      '---',
      '',
    ].join('\n'))
    writeFile(path.join(home, 'skills', '.hub', 'ignored', 'SKILL.md'), [
      '---',
      'name: ignored-hub-skill',
      '---',
      '',
    ].join('\n'))
    writeFile(path.join(external, 'research', 'external', 'SKILL.md'), [
      '---',
      'name: external-skill',
      'description: External skill',
      '---',
      '',
    ].join('\n'))
    writeFile(path.join(external, 'research', 'duplicate', 'SKILL.md'), [
      '---',
      'name: enabled-skill',
      'description: Duplicate should lose to local skill',
      '---',
      '',
    ].join('\n'))

    const reader = new HermesStateReader(home)
    const skills = reader.getSkills()

    expect(skills.map(skill => skill.name)).toEqual([
      'disabled-skill',
      'enabled-skill',
      'external-skill',
    ])
    expect(skills.find(skill => skill.name === 'enabled-skill')).toMatchObject({
      category: 'devops',
      enabled: true,
      description: 'Enabled from frontmatter',
    })
    expect(skills.find(skill => skill.name === 'disabled-skill')).toMatchObject({
      enabled: false,
    })
    expect(skills.find(skill => skill.name === 'external-skill')).toMatchObject({
      category: 'research',
    })
  })
})
