#!/usr/bin/env node
'use strict'

/**
 * Experiment 1: one-shot export of known CASC paths to a local folder (binary as on disk).
 * Uses the same bw-casclib stack as server/casc-http.cjs (alexpineda/cascbridge-compatible reads).
 *
 * Run with a Node where bw-casclib loads (often /usr/bin/node on Ubuntu):
 *   CASCLIB_NODE=/usr/bin/node npm run export:casc-samples
 *
 * Optional extra paths:
 *   node scripts/casc-export-samples.cjs "unit/thingy/tileset/badlands/lcsign02.grp"
 */

const fs = require('fs')
const path = require('path')
const casclib = require('bw-casclib')

const DEFAULT_PATHS = [
  'HD2/glue/paltcx/xterranc.DDS',
  'HD2/glue/palta/terrana.DDS',
  'HD2/glue/palpb/protossb.DDS',
  'HD2/game/consoles/terran/conover.DDS',
  'HD2/game/consoles/terran/pbrfull.DDS',
  'unit/thingy/tileset/badlands/lcsign02.grp',
  'anim/main_509.anim',
]

function readScRoot() {
  if (process.env.SC_ROOT) return process.env.SC_ROOT
  const installPath = path.join(__dirname, '..', 'starcraft-install.path')
  if (!fs.existsSync(installPath)) return null
  const text = fs.readFileSync(installPath, 'utf8')
  for (const line of text.split('\n')) {
    const m = line.match(/^SC_ROOT=(.*)/)
    if (m) return m[1].trim()
  }
  return null
}

function main() {
  const outDir = process.env.CASC_EXPORT_DIR || path.join(__dirname, '..', 'exported-casc-samples')
  const scRoot = readScRoot()
  if (!scRoot || !fs.existsSync(scRoot)) {
    console.error('Set SC_ROOT or create starcraft-install.path with SC_ROOT=...')
    process.exit(1)
  }

  const extra = process.argv.slice(2).filter(Boolean)
  const paths = [...new Set([...DEFAULT_PATHS, ...extra])]

  fs.mkdirSync(outDir, { recursive: true })
  const h = casclib.openStorageSync(scRoot)
  let ok = 0
  let fail = 0

  for (const rel of paths) {
    const safe = rel.replace(/\\/g, '/').replace(/^\/+/, '')
    const dest = path.join(outDir, safe.split('/').join(path.sep))
    try {
      const buf = casclib.readFileSync(h, safe)
      fs.mkdirSync(path.dirname(dest), { recursive: true })
      fs.writeFileSync(dest, Buffer.from(buf))
      console.log('wrote', dest, '(' + buf.length + ' bytes)')
      ok++
    } catch (e) {
      console.warn('skip', safe, '-', e.message)
      fail++
    }
  }

  casclib.closeStorage(h)
  console.log('done:', ok, 'ok,', fail, 'failed ->', outDir)
}

main()
