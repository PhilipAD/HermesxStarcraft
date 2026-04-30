#!/usr/bin/env /usr/bin/node
'use strict'

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const casclib = require('bw-casclib')

const ROOT = process.env.STARCRAFT_REMASTERED_ROOT || '/home/rdpuser/Games/battlenet/drive_c/Program Files (x86)/StarCraft'
const OUT = process.env.REMASTERED_ASSET_OUT || path.join(__dirname, '..', 'analysis', 'remastered-target-assets')

const GROUPS = {
  startupSplash: [
    'glue\\title\\*',
    'HD2\\glue\\title\\*',
    'glue\\mainmenu\\*',
    'HD2\\glue\\mainmenu\\*',
  ],
  raceSelection: [
    'glue\\ready*\\*',
    'HD2\\glue\\ready*\\*',
    'SD\\rez\\gluRdy*.ui.json',
    'SD\\rez\\GluRdyZ.ui.json',
    'locales\\enUS\\Assets\\rez\\gluRdy*.ui.json',
    'locales\\enUS\\Assets\\rez\\GluRdyZ.ui.json',
    'webui\\dist\\lib\\images\\avatar*',
    'webui\\dist\\lib\\images\\*terran*',
    'webui\\dist\\lib\\images\\*protoss*',
    'webui\\dist\\lib\\images\\*zerg*',
  ],
  loadingScreens: [
    'SD\\rez\\gluLoad.ui.json',
    'locales\\enUS\\Assets\\rez\\gluLoad.ui.json',
    'SD\\rez\\gluScore.ui.json',
    'locales\\enUS\\Assets\\rez\\gluScore.ui.json',
    'glue\\score*\\*',
    'HD2\\glue\\score*\\*',
    'glue\\campaign\\*',
    'HD2\\glue\\campaign\\*',
  ],
  lobbyAndMatchmaking: [
    'SD\\rez\\gluGameLobby.ui.json',
    'SD\\rez\\gluMatchmaking*.ui.json',
    'SD\\rez\\gluJoin*.ui.json',
    'locales\\enUS\\Assets\\rez\\gluGameLobby.ui.json',
    'locales\\enUS\\Assets\\rez\\gluMatchmaking*.ui.json',
    'locales\\enUS\\Assets\\rez\\gluJoin*.ui.json',
  ],
}

const ALLOW_EXTS = new Set(['.dds', '.pcx', '.grp', '.json', '.txt', '.html', '.css', '.js', '.png', '.jpg', '.jpeg'])
const SKIP_EXTS = new Set(['.webm', '.ogg', '.wav', '.mp3'])
const MAX_BYTES = 30 * 1024 * 1024

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

function safeOutPath(base, logicalPath) {
  const parts = logicalPath.replace(/\\/g, '/').split('/').filter((p) => p && p !== '..')
  return path.join(base, ...parts)
}

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex')
}

function norm(entry) {
  return String(entry.fullName || entry.path || entry)
}

function textRefs(logicalPath, buf) {
  const ext = path.extname(logicalPath).toLowerCase()
  if (!['.json', '.txt', '.html', '.css', '.js'].includes(ext)) return []
  const refs = new Set()
  const text = buf.toString('utf8')
  const pattern = /["']([^"']+\.(?:DDS|dds|GRP|grp|PCX|pcx|png|jpg|jpeg|webm|json|ui\.json))["']/g
  let m
  while ((m = pattern.exec(text))) refs.add(m[1])
  return Array.from(refs).slice(0, 200)
}

function main() {
  ensureDir(OUT)
  const storage = casclib.openStorageSync(ROOT)
  const manifest = {
    generatedAt: new Date().toISOString(),
    root: ROOT,
    outDir: OUT,
    groups: {},
    extracted: [],
    skipped: [],
    errors: [],
    references: [],
  }

  try {
    for (const [group, patterns] of Object.entries(GROUPS)) {
      const paths = new Set()
      for (const pattern of patterns) {
        try {
          for (const entry of casclib.findFilesSync(storage, pattern)) paths.add(norm(entry))
        } catch (e) {
          manifest.errors.push({ group, pattern, error: e.message })
        }
      }

      manifest.groups[group] = { patterns, matched: paths.size, extracted: 0 }
      for (const logicalPath of Array.from(paths).sort()) {
        const ext = path.extname(logicalPath).toLowerCase()
        if (SKIP_EXTS.has(ext) || !ALLOW_EXTS.has(ext)) {
          manifest.skipped.push({ group, logicalPath, reason: `skipped extension ${ext || '(none)'}` })
          continue
        }

        try {
          const buf = Buffer.from(casclib.readFileSync(storage, logicalPath))
          if (buf.length > MAX_BYTES) {
            manifest.skipped.push({ group, logicalPath, size: buf.length, reason: 'over max bytes' })
            continue
          }
          const outPath = safeOutPath(path.join(OUT, group), logicalPath)
          ensureDir(path.dirname(outPath))
          fs.writeFileSync(outPath, buf)
          manifest.groups[group].extracted++
          manifest.extracted.push({
            group,
            logicalPath,
            outPath: path.relative(OUT, outPath).split(path.sep).join('/'),
            size: buf.length,
            sha256: sha256(buf),
          })
          const refs = textRefs(logicalPath, buf)
          if (refs.length) manifest.references.push({ group, logicalPath, refs })
        } catch (e) {
          manifest.errors.push({ group, logicalPath, error: e.message })
        }
      }
    }
  } finally {
    casclib.closeStorage(storage)
  }

  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2))
  fs.writeFileSync(
    path.join(OUT, 'extracted-paths.txt'),
    manifest.extracted.map((e) => `${e.group}\t${e.size}\t${e.logicalPath}`).join('\n') + '\n'
  )
  console.log(JSON.stringify({
    outDir: OUT,
    groups: manifest.groups,
    extracted: manifest.extracted.length,
    skipped: manifest.skipped.length,
    errors: manifest.errors.length,
    manifest: path.join(OUT, 'manifest.json'),
  }, null, 2))
}

main()
