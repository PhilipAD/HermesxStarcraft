#!/usr/bin/env /usr/bin/node
'use strict'

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const casclib = require('bw-casclib')
const triage = require('./remastered-asset-triage.cjs')

const DEFAULT_ROOT = '/home/rdpuser/Games/battlenet/drive_c/Program Files (x86)/StarCraft'
const DEFAULT_OUT = path.join(__dirname, '..', 'analysis', 'remastered-assets')

const CATEGORIES = {
  raceSelection: [
    /(^|[\\/])glue[\\/].*(race|ready|join|select|terran|protoss|zerg)/i,
    /(^|[\\/])HD2[\\/]glue[\\/].*(race|ready|join|select|terran|protoss|zerg)/i,
    /(^|[\\/])SD[\\/]rez[\\/]glu.*\.ui\.json$/i,
    /(^|[\\/])locales[\\/][^\\/]+[\\/]Assets[\\/]rez[\\/]glu.*\.ui\.json$/i,
    /webui[\\/].*(race|avatar|terran|protoss|zerg|versus|profile)/i,
  ],
  startupSplash: [
    /(^|[\\/])glue[\\/]title[\\/]/i,
    /(^|[\\/])HD2[\\/]glue[\\/]title[\\/]/i,
    /(^|[\\/])SD[\\/]glue[\\/]title[\\/]/i,
    /(^|[\\/])glue[\\/]mainmenu[\\/]/i,
    /(^|[\\/])HD2[\\/]glue[\\/]mainmenu[\\/]/i,
    /(^|[\\/])SD[\\/]rez[\\/]gluMain\.ui\.json$/i,
    /(^|[\\/])locales[\\/][^\\/]+[\\/]Assets[\\/]rez[\\/]gluMain\.ui\.json$/i,
  ],
  loadingScreens: [
    /(^|[\\/])glue[\\/].*(load|loading|ready|score|campaign)/i,
    /(^|[\\/])HD2[\\/]glue[\\/].*(load|loading|ready|score|campaign)/i,
    /(^|[\\/])SD[\\/]glue[\\/].*(load|loading|ready|score|campaign)/i,
    /(^|[\\/])locales[\\/][^\\/]+[\\/]Assets[\\/]rez[\\/]glu.*\.ui\.json$/i,
  ],
}

const EXPORT_EXTS = new Set(['.dds', '.pcx', '.grp', '.json', '.txt', '.html', '.css', '.js'])
const SKIP_EXTS = new Set(['.webm', '.ogg', '.wav', '.mp3'])
const MAX_EXPORT_BYTES = 25 * 1024 * 1024
const MAX_EXPORTS_PER_CATEGORY = 80
const TEXT_EXTS = new Set(['.json', '.txt', '.html', '.css', '.js'])

function parseArgs(argv) {
  const out = { root: process.env.STARCRAFT_REMASTERED_ROOT || DEFAULT_ROOT, outDir: DEFAULT_OUT }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--root') out.root = argv[++i]
    else if (a === '--out') out.outDir = argv[++i]
    else if (a === '--max-bytes') out.maxBytes = Number(argv[++i])
  }
  return out
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

function safeOutPath(base, logicalPath) {
  const clean = logicalPath.replace(/\\/g, '/').replace(/^\/+/, '').split('/').filter((p) => p && p !== '..')
  return path.join(base, ...clean)
}

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex')
}

function normalizeEntry(entry) {
  const logicalPath = String(entry.fullName || entry.path || entry)
  const fileSize =
    typeof entry.fileSize === 'number'
      ? entry.fileSize
      : typeof entry.size === 'number'
      ? entry.size
      : null
  return { logicalPath, fileSize }
}

function categoryFor(logicalPath) {
  for (const [category, patterns] of Object.entries(CATEGORIES)) {
    if (patterns.some((pattern) => pattern.test(logicalPath))) return category
  }
  return null
}

function extractJsonReferences(logicalPath, buf) {
  const ext = path.extname(logicalPath).toLowerCase()
  if (!TEXT_EXTS.has(ext)) return []
  const text = buf.toString('utf8')
  const refs = new Set()
  const patterns = [
    /["']([^"']+\.(?:DDS|dds|GRP|grp|PCX|pcx|anim|json|webm|wav|ogg))["']/g,
    /\b((?:HD2|SD|glue|game|webui|anim|locales|rez)[\\/][^\s"'<>]+?\.(?:DDS|dds|GRP|grp|PCX|pcx|anim|json|webm|wav|ogg))\b/g,
  ]
  for (const pattern of patterns) {
    let m
    while ((m = pattern.exec(text))) refs.add(m[1].replace(/\//g, '\\'))
  }
  return Array.from(refs).slice(0, 200)
}

function main() {
  const options = parseArgs(process.argv.slice(2))
  const maxBytes = Number.isFinite(options.maxBytes) ? options.maxBytes : MAX_EXPORT_BYTES
  ensureDir(options.outDir)

  const report = triage.buildReport({ root: options.root })
  const storage = casclib.openStorageSync(options.root)
  const manifest = {
    generatedAt: new Date().toISOString(),
    root: options.root,
    outDir: options.outDir,
    report,
    totals: {},
    extracted: [],
    skippedLarge: [],
    readErrors: [],
    references: [],
  }

  try {
    const all = casclib.findFilesSync(storage, '*').map(normalizeEntry)
    manifest.totals.namespaceCount = all.length

    const matched = []
    for (const entry of all) {
      const { logicalPath, fileSize } = entry
      const category = categoryFor(logicalPath)
      const triageScore = triage.scoreNamespacePath(logicalPath)
      if (category) {
        matched.push({ logicalPath, category, triageScore, fileSize })
      }
    }
    matched.sort((a, b) => (a.category || '').localeCompare(b.category || '') || b.triageScore - a.triageScore || a.logicalPath.localeCompare(b.logicalPath))
    manifest.totals.matched = matched.length
    fs.writeFileSync(path.join(options.outDir, 'matched-paths.txt'), matched.map((m) => `${m.category || 'triage'}\t${m.triageScore}\t${m.logicalPath}`).join('\n') + '\n')

    const perCategory = new Map()
    for (const hit of matched) {
      const ext = path.extname(hit.logicalPath).toLowerCase()
      if (SKIP_EXTS.has(ext) || !EXPORT_EXTS.has(ext)) {
        manifest.skippedLarge.push({ ...hit, reason: `skipped extension ${ext || '(none)'}` })
        continue
      }

      const category = hit.category || 'triage'
      const count = perCategory.get(category) || 0
      if (count >= MAX_EXPORTS_PER_CATEGORY) continue
      perCategory.set(category, count + 1)

      try {
        if (hit.fileSize !== null && hit.fileSize > maxBytes) {
          manifest.skippedLarge.push({ ...hit, size: hit.fileSize, reason: 'listed size over max' })
          continue
        }
        const buf = Buffer.from(casclib.readFileSync(storage, hit.logicalPath))
        if (buf.length > maxBytes) {
          manifest.skippedLarge.push({ ...hit, size: buf.length })
          continue
        }
        const outPath = safeOutPath(path.join(options.outDir, category), hit.logicalPath)
        ensureDir(path.dirname(outPath))
        fs.writeFileSync(outPath, buf)
        const rec = {
          ...hit,
          size: buf.length,
          sha256: sha256(buf),
          outPath: path.relative(options.outDir, outPath).split(path.sep).join('/'),
        }
        manifest.extracted.push(rec)
        const refs = extractJsonReferences(hit.logicalPath, buf)
        if (refs.length) manifest.references.push({ logicalPath: hit.logicalPath, refs })
      } catch (e) {
        manifest.readErrors.push({ ...hit, error: e.message })
      }
    }

    manifest.totals.extracted = manifest.extracted.length
    manifest.totals.skippedLarge = manifest.skippedLarge.length
    manifest.totals.readErrors = manifest.readErrors.length
    fs.writeFileSync(path.join(options.outDir, 'manifest.json'), JSON.stringify(manifest, null, 2))

    console.log(JSON.stringify({
      outDir: options.outDir,
      namespaceCount: manifest.totals.namespaceCount,
      matched: manifest.totals.matched,
      extracted: manifest.totals.extracted,
      skippedLarge: manifest.totals.skippedLarge,
      readErrors: manifest.totals.readErrors,
      manifest: path.join(options.outDir, 'manifest.json'),
    }, null, 2))
  } finally {
    casclib.closeStorage(storage)
  }
}

main()
