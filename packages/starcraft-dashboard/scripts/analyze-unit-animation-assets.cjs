#!/usr/bin/env node
'use strict'

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const casclib = require('bw-casclib')

const ROOT = path.join(__dirname, '..')
const GAME_ROOT = process.env.SCR_ROOT || '/home/rdpuser/Games/battlenet/drive_c/Program Files (x86)/StarCraft'
const OUT = path.join(ROOT, 'analysis', 'unit-animation-hunt')
const ASSETS = path.join(OUT, 'assets')

const CONTROL_FILES = [
  'arr\\images.dat',
  'arr\\sprites.dat',
  'arr\\flingy.dat',
  'arr\\units.dat',
  'arr\\orders.dat',
  'scripts\\iscript.bin',
  'scripts\\iscriptx.bin',
]

const FOCUSED_ASSETS = [
  'unit\\terran\\scv.grp',
  'unit\\terran\\scv.loo',
  'unit\\bullet\\scvspark.grp',
  'unit\\neutral\\min01.grp',
  'unit\\neutral\\min01sha.grp',
  'unit\\neutral\\min02.grp',
  'unit\\neutral\\min02sha.grp',
  'unit\\neutral\\min03.grp',
  'unit\\neutral\\min03sha.grp',
  'unit\\neutral\\geyser.grp',
  'unit\\neutral\\geyser.los',
  'unit\\neutral\\gasorb.grp',
  'unit\\neutral\\gassac.grp',
  'unit\\neutral\\gastank.grp',
  'unit\\terran\\refinery.grp',
  'unit\\terran\\refinery.lof',
  'unit\\terran\\refinery.los',
  'unit\\protoss\\probe.grp',
  'unit\\zerg\\drone.grp',
  'unit\\zerg\\drone.loo',
  'unit\\zerg\\drone.log',
  'unit\\protoss\\nexus.grp',
  'unit\\protoss\\nexus.lof',
  'unit\\zerg\\extract.grp',
  'unit\\zerg\\extract.lof',
  'unit\\zerg\\extract.los',
  'unit\\zerg\\hatchery.grp',
  'unit\\zerg\\hatchery.lof',
  'anim\\main_007.anim',
  'HD2\\anim\\main_007.anim',
]

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

function safePath(logicalPath) {
  return path.join(ASSETS, ...logicalPath.replace(/\\/g, '/').split('/').filter((part) => part && part !== '..'))
}

function hash(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex')
}

function list(handle, pattern) {
  return casclib.findFilesSync(handle, pattern).map((item) => item.fullName || String(item)).sort()
}

function parseGrpHeader(buf) {
  if (buf.length < 6) return null
  return {
    frames: buf.readUInt16LE(0),
    width: buf.readUInt16LE(2),
    height: buf.readUInt16LE(4),
  }
}

function parseAnimHeader(buf) {
  if (buf.toString('ascii', 0, 4) !== 'ANIM') return null
  return {
    magic: 'ANIM',
    versionA: buf.readUInt16LE(4),
    versionB: buf.readUInt16LE(6),
    id: buf.readUInt16LE(8),
    variant: buf.readUInt16LE(10),
    tag: buf.toString('ascii', 12, 16),
  }
}

function extract(handle, logicalPath) {
  const dest = safePath(logicalPath)
  const buf = Buffer.from(casclib.readFileSync(handle, logicalPath))
  ensureDir(path.dirname(dest))
  fs.writeFileSync(dest, buf)
  const ext = path.extname(logicalPath).toLowerCase()
  const meta = ext === '.grp' ? parseGrpHeader(buf) : ext === '.anim' ? parseAnimHeader(buf) : null
  return {
    logicalPath,
    outPath: path.relative(OUT, dest).split(path.sep).join('/'),
    size: buf.length,
    sha256: hash(buf),
    head: buf.subarray(0, 16).toString('hex'),
    meta,
  }
}

function classifyUnitPath(logicalPath) {
  const normalized = logicalPath.replace(/\\/g, '/').toLowerCase()
  const [, group = 'other'] = normalized.match(/^unit\/([^/]+)\//) || []
  return group
}

function main() {
  ensureDir(OUT)
  ensureDir(ASSETS)
  const handle = casclib.openStorageSync(GAME_ROOT)
  try {
    const anim = list(handle, 'anim\\*.anim')
    const hdAnim = list(handle, 'HD2\\anim\\*.anim')
    const unitFiles = list(handle, 'unit\\*')
    const unitGrps = unitFiles.filter((file) => path.extname(file).toLowerCase() === '.grp')
    const byGroup = {}
    for (const file of unitGrps) {
      const group = classifyUnitPath(file)
      if (!byGroup[group]) byGroup[group] = []
      byGroup[group].push(file)
    }

    const extracted = []
    const extractionErrors = []
    for (const logicalPath of [...CONTROL_FILES, ...FOCUSED_ASSETS]) {
      try {
        extracted.push(extract(handle, logicalPath))
      } catch (e) {
        extractionErrors.push({ logicalPath, error: e.message })
      }
    }

    const report = {
      generatedAt: new Date().toISOString(),
      gameRoot: GAME_ROOT,
      conclusion:
        'StarCraft Remastered unit actions are sprite/iscript-driven, not exposed as separate 3D model action clips. Use unit/*.grp + anim/main_*.anim + arr/*.dat + scripts/iscript*.bin to reconstruct movement/build/gather states.',
      counts: {
        anim: anim.length,
        hdAnim: hdAnim.length,
        unitFiles: unitFiles.length,
        unitGrpSprites: unitGrps.length,
      },
      controlFiles: CONTROL_FILES,
      focusedWorkerResourceAssets: FOCUSED_ASSETS,
      keyFindings: {
        scv: [
          'unit\\terran\\scv.grp',
          'unit\\terran\\scv.loo',
          'unit\\bullet\\scvspark.grp',
          'anim\\main_007.anim',
          'HD2\\anim\\main_007.anim',
        ],
        resources: [
          'unit\\neutral\\min01.grp',
          'unit\\neutral\\min02.grp',
          'unit\\neutral\\min03.grp',
          'unit\\neutral\\geyser.grp',
          'unit\\neutral\\gasorb.grp',
          'unit\\neutral\\gassac.grp',
          'unit\\neutral\\gastank.grp',
        ],
        otherWorkers: ['unit\\protoss\\probe.grp', 'unit\\zerg\\drone.grp', 'unit\\zerg\\drone.loo'],
        gasBuildings: ['unit\\terran\\refinery.grp', 'unit\\zerg\\extract.grp'],
      },
      unitGrpByGroup: byGroup,
      animSamples: anim.slice(0, 40),
      hdAnimSamples: hdAnim.slice(0, 40),
      extracted,
      extractionErrors,
    }

    fs.writeFileSync(path.join(OUT, 'unit-animation-report.json'), JSON.stringify(report, null, 2))
    fs.writeFileSync(
      path.join(OUT, 'README.md'),
      `# Unit Animation Hunt\n\n${report.conclusion}\n\n## Key Worker/Resource Assets\n\n- SCV sprite: \`unit\\\\terran\\\\scv.grp\`\n- SCV overlay offsets: \`unit\\\\terran\\\\scv.loo\`\n- SCV build/spark effect: \`unit\\\\bullet\\\\scvspark.grp\`\n- SCV remastered animation payload candidate: \`anim\\\\main_007.anim\` and \`HD2\\\\anim\\\\main_007.anim\`\n- Minerals: \`unit\\\\neutral\\\\min01.grp\`, \`min02.grp\`, \`min03.grp\` plus shadow GRPs\n- Vespene/geyser: \`unit\\\\neutral\\\\geyser.grp\`, \`gasorb.grp\`, \`gassac.grp\`, \`gastank.grp\`\n- Runtime action mapping: \`arr\\\\images.dat\`, \`arr\\\\sprites.dat\`, \`arr\\\\flingy.dat\`, \`arr\\\\units.dat\`, \`scripts\\\\iscript.bin\`, \`scripts\\\\iscriptx.bin\`\n\nSee \`unit-animation-report.json\` for complete counts and grouped unit sprite paths.\n`
    )
    console.log(JSON.stringify({ out: OUT, counts: report.counts, extracted: extracted.length, extractionErrors }, null, 2))
  } finally {
    casclib.closeStorage(handle)
  }
}

main()
