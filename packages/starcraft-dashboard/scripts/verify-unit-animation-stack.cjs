#!/usr/bin/env node
'use strict'

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const casclib = require('bw-casclib')
const { chromium } = require('playwright')

const ROOT = path.join(__dirname, '..')
const OUT = path.join(ROOT, 'analysis', 'unit-animation-stack-verify')
const GAME_ROOT =
  process.env.SCR_ROOT ||
  process.env.SC_ROOT ||
  '/home/rdpuser/Games/battlenet/drive_c/Program Files (x86)/StarCraft'
const FRONTEND_URL = process.env.TITAN_URL || 'http://127.0.0.1:9120/?titan=1'

const EXPECTED_COUNTS = {
  anim: 1686,
  hd2Anim: 1686,
  unitFiles: 1027,
  unitGrpSprites: 925,
}

const CONTROL_FILES = [
  'arr\\images.dat',
  'arr\\sprites.dat',
  'arr\\flingy.dat',
  'arr\\units.dat',
  'arr\\orders.dat',
  'scripts\\iscript.bin',
  'scripts\\iscriptx.bin',
]

const SCV_BUNDLE = [
  'unit\\terran\\scv.grp',
  'unit\\terran\\scv.loo',
  'unit\\bullet\\scvspark.grp',
  'anim\\main_007.anim',
  'HD2\\anim\\main_007.anim',
]

const RESOURCE_TARGETS = [
  'unit\\neutral\\min01.grp',
  'unit\\neutral\\min02.grp',
  'unit\\neutral\\min03.grp',
  'unit\\neutral\\geyser.grp',
  'unit\\neutral\\gasorb.grp',
  'unit\\neutral\\gassac.grp',
  'unit\\neutral\\gastank.grp',
  'unit\\terran\\refinery.grp',
]

const REQUIRED_PATHS = [...CONTROL_FILES, ...SCV_BUNDLE, ...RESOURCE_TARGETS]

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const ensureDir = (dir) => fs.mkdirSync(dir, { recursive: true })
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex')
const pass = (id, evidence) => ({ id, status: 'PASS', evidence })
const fail = (id, evidence) => ({ id, status: 'FAIL', evidence })

function list(handle, pattern) {
  return casclib.findFilesSync(handle, pattern).map((item) => item.fullName || String(item)).sort()
}

function parseGrp(buf) {
  if (buf.length < 6) return null
  return {
    frames: buf.readUInt16LE(0),
    width: buf.readUInt16LE(2),
    height: buf.readUInt16LE(4),
  }
}

function parseAnim(buf) {
  if (buf.length < 16 || buf.toString('ascii', 0, 4) !== 'ANIM') return null
  return {
    magic: 'ANIM',
    versionA: buf.readUInt16LE(4),
    versionB: buf.readUInt16LE(6),
    id: buf.readUInt16LE(8),
    variant: buf.readUInt16LE(10),
    tag: buf.toString('ascii', 12, 16),
  }
}

function extensionMeta(logicalPath, buf) {
  const ext = path.extname(logicalPath).toLowerCase()
  if (ext === '.grp') return parseGrp(buf)
  if (ext === '.anim') return parseAnim(buf)
  return null
}

function verifyCasc() {
  const checks = []
  const assets = []
  const handle = casclib.openStorageSync(GAME_ROOT)
  try {
    const anim = list(handle, 'anim\\*.anim')
    const hd2Anim = list(handle, 'HD2\\anim\\*.anim')
    const unitFiles = list(handle, 'unit\\*')
    const unitGrpSprites = unitFiles.filter((file) => path.extname(file).toLowerCase() === '.grp')
    const counts = {
      anim: anim.length,
      hd2Anim: hd2Anim.length,
      unitFiles: unitFiles.length,
      unitGrpSprites: unitGrpSprites.length,
    }

    for (const [key, expected] of Object.entries(EXPECTED_COUNTS)) {
      const actual = counts[key]
      checks.push(
        actual === expected
          ? pass(`casc-count-${key}`, `${actual} matches expected ${expected}`)
          : fail(`casc-count-${key}`, `expected ${expected}, got ${actual}`)
      )
    }

    for (const logicalPath of REQUIRED_PATHS) {
      try {
        const buf = Buffer.from(casclib.readFileSync(handle, logicalPath))
        const meta = extensionMeta(logicalPath, buf)
        const ok =
          buf.length > 0 &&
          (!logicalPath.endsWith('.grp') || (meta && meta.frames > 0 && meta.width > 0 && meta.height > 0)) &&
          (!logicalPath.endsWith('.anim') || (meta && meta.magic === 'ANIM'))
        checks.push(
          ok
            ? pass(`asset-${logicalPath}`, `read ${buf.length} bytes${meta ? ` meta=${JSON.stringify(meta)}` : ''}`)
            : fail(`asset-${logicalPath}`, `invalid or undecodable asset; size=${buf.length} meta=${JSON.stringify(meta)}`)
        )
        assets.push({
          logicalPath,
          size: buf.length,
          sha256: sha256(buf),
          head: buf.subarray(0, 16).toString('hex'),
          meta,
        })
      } catch (err) {
        checks.push(fail(`asset-${logicalPath}`, err.message))
      }
    }

    const anim007 = assets.find((asset) => asset.logicalPath === 'anim\\main_007.anim')
    const hdAnim007 = assets.find((asset) => asset.logicalPath === 'HD2\\anim\\main_007.anim')
    checks.push(
      anim007?.meta?.id === 7 && hdAnim007?.meta?.id === 7
        ? pass('scv-anim-id', 'anim/main_007.anim and HD2/anim/main_007.anim both declare id=7')
        : fail('scv-anim-id', `unexpected ids anim=${anim007?.meta?.id} hd2=${hdAnim007?.meta?.id}`)
    )

    return { counts, checks, assets }
  } finally {
    casclib.closeStorage(handle)
  }
}

async function verifyFrontend() {
  const browser = await chromium.launch({ headless: true })
  const consoleMessages = []
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  page.on('console', (msg) => {
    const text = msg.text()
    if (/error|warn|hermes|world-composer|scene-composer/i.test(text)) {
      consoleMessages.push({ type: msg.type(), text })
    }
  })

  try {
    await page.goto(FRONTEND_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await page.waitForSelector('iframe', { timeout: 60_000 })
    const iframeSrc = await page
      .waitForFunction(
        () =>
          Array.from(document.querySelectorAll('iframe'))
            .map((iframe) => iframe.src)
            .find((src) => src.includes('127.0.0.1:3344')),
        null,
        { timeout: 60_000 }
      )
      .then((handle) => handle.jsonValue())
    const frame = page.frame({ url: iframeSrc })
    if (!frame) throw new Error('Titan iframe not found')

    await frame.getByRole('button', { name: /Select Terran/i }).click({ timeout: 60_000 })
    await frame.waitForFunction(() => !!globalThis.__hermesImages && !!globalThis.__hermesSprites, null, {
      timeout: 120_000,
    })
    await frame.waitForFunction(
      () => globalThis.__hermesUnitVisualActions instanceof Map && globalThis.__hermesUnitVisualActions.size > 0,
      null,
      { timeout: 120_000 }
    )

    const runtimeMapping = await frame.evaluate(() => {
      const bwDat = globalThis.__hermesAssets?.bwDat
      const loader = globalThis.__hermesAssets?.loader
      const normalize = (value) => String(value ?? '').replaceAll('/', '\\').toLowerCase()
      const unitPath = (unitId) => {
        const unit = bwDat?.units?.[unitId]
        const sprite = unit?.flingy?.sprite
        const image = sprite?.image
        const atlas = image ? loader?.getImage?.(image.index) : null
        return {
          unitId,
          unitName: unit?.name ?? null,
          spriteId: sprite?.index ?? null,
          spriteName: sprite?.name ?? null,
          imageId: image?.index ?? null,
          imageName: image?.name ?? null,
          grpFile: image?.grpFile ?? null,
          iscript: image?.iscript ?? null,
          iscriptPresent:
            image?.iscript != null && !!bwDat?.iscript?.iscripts?.[image.iscript],
          atlasLoaded: !!atlas,
          atlasFrames: atlas?.frames?.length ?? null,
        }
      }
      const findImages = (needle) =>
        (bwDat?.images ?? [])
          .filter((image) => normalize(image.grpFile).includes(normalize(needle)))
          .map((image) => ({
            imageId: image.index,
            imageName: image.name,
            grpFile: image.grpFile,
            iscript: image.iscript,
            iscriptPresent: !!bwDat?.iscript?.iscripts?.[image.iscript],
            atlasLoaded: !!loader?.getImage?.(image.index),
            atlasFrames: loader?.getImage?.(image.index)?.frames?.length ?? null,
          }))
      return {
        units: {
          scv: unitPath(7),
          refinery: unitPath(110),
          mineral1: unitPath(176),
          mineral2: unitPath(177),
          mineral3: unitPath(178),
          geyser: unitPath(188),
        },
        images: {
          scvSpark: findImages('bullet\\scvspark.grp'),
          gasOrb: findImages('neutral\\gasorb.grp'),
          gasSac: findImages('neutral\\gassac.grp'),
          gasTank: findImages('neutral\\gastank.grp'),
        },
      }
    })

    const samples = []
    for (let i = 0; i < 18; i++) {
      samples.push(
        await frame.evaluate(() => {
          const actions = globalThis.__hermesUnitVisualActions
          const actionRows =
            actions instanceof Map
              ? Array.from(actions.entries()).map(([unitId, action]) => ({
                  unitId,
                  kind: action.kind,
                  resource: action.resource ?? null,
                  direction8: action.direction8 ?? null,
                  direction32: action.direction32 ?? null,
                }))
              : []
          const actionUnitIds = new Set(actionRows.map((row) => row.unitId))
          const imageStore = globalThis.__hermesImages
          const spriteStore = globalThis.__hermesSprites
          const images =
            imageStore && typeof imageStore[Symbol.iterator] === 'function'
              ? Array.from(imageStore)
                  .map((image) => {
                    const unit = typeof imageStore.getUnit === 'function' ? imageStore.getUnit(image) : undefined
                    const action = unit ? actions.get(unit.id) : undefined
                    return {
                      unitId: unit?.id ?? null,
                      typeId: unit?.typeId ?? null,
                      action: action?.kind ?? null,
                      resource: action?.resource ?? null,
                      direction32: action?.direction32 ?? null,
                      visible: !!image.visible,
                      frame: image.frame ?? null,
                      frameCount: image.frames?.length ?? null,
                      atlasImageIndex: image.atlas?.imageIndex ?? null,
                      renderOrder: image.renderOrder ?? null,
                      is3d: !!image.isImage3d,
                    }
                  })
                  .filter((row) => row.visible && row.unitId != null)
              : []
          const markers =
            spriteStore && typeof spriteStore[Symbol.iterator] === 'function'
              ? Array.from(spriteStore)
                  .map((sprite) => {
                    const marker = sprite.userData?.hermesCarryMarker
                    const unit = typeof spriteStore.getUnit === 'function' ? spriteStore.getUnit(sprite.userData?.typeId) : undefined
                    return marker
                      ? {
                          spriteTypeId: sprite.userData?.typeId ?? null,
                          parentName: marker.parent?.name ?? null,
                          visible: !!marker.visible,
                          renderOrder: marker.renderOrder ?? null,
                          depthTest: marker.material?.depthTest ?? null,
                          depthWrite: marker.material?.depthWrite ?? null,
                          color: marker.material?.color?.getHexString?.() ?? null,
                          y: marker.position?.y ?? null,
                          unitId: unit?.id ?? null,
                        }
                      : null
                  })
                  .filter(Boolean)
              : []
          return {
            completedRender: !!globalThis.__hermesCompletedRenderMode,
            actions: actionRows,
            actionCounts: actionRows.reduce((acc, row) => {
              const key = row.resource ? `${row.kind}:${row.resource}` : row.kind
              acc[key] = (acc[key] ?? 0) + 1
              return acc
            }, {}),
            totalActions: actionRows.length,
            visibleActionImages: images.filter((row) => actionUnitIds.has(row.unitId)).slice(0, 20),
            visibleImages: images.slice(0, 40),
            visibleMarkers: markers.filter((row) => row.visible).slice(0, 20),
            markerCount: markers.length,
          }
        })
      )
      await sleep(1000)
    }

    const checks = []
    const any = (predicate) => samples.some(predicate)
    checks.push(
      samples[0]?.completedRender
        ? pass('frontend-completed-render-mode', 'iframe reports __hermesCompletedRenderMode=true')
        : fail('frontend-completed-render-mode', 'completed render mode was not enabled')
    )
    checks.push(
      any((sample) => (sample.actionCounts.moving ?? 0) > 0)
        ? pass('frontend-moving-actions', 'runtime action map contains moving units')
        : fail('frontend-moving-actions', 'no moving units observed')
    )
    checks.push(
      any((sample) => (sample.actionCounts['gathering:mineral'] ?? 0) > 0)
        ? pass('frontend-mineral-gather-actions', 'runtime action map contains mineral gathering workers')
        : fail('frontend-mineral-gather-actions', 'no mineral gathering worker action observed')
    )
    checks.push(
      any((sample) => (sample.actionCounts['gathering:gas'] ?? 0) > 0 || (sample.actionCounts['carrying:gas'] ?? 0) > 0)
        ? pass('frontend-gas-actions', 'runtime action map contains gas gathering/carrying workers')
        : fail('frontend-gas-actions', 'no gas gathering/carrying worker action observed in 18s window')
    )
    const actionDirection32Values = new Set()
    for (const sample of samples) {
      for (const action of sample.actions ?? []) {
        if (typeof action.direction32 === 'number') actionDirection32Values.add(action.direction32)
      }
      for (const image of sample.visibleActionImages ?? []) {
        if (typeof image.direction32 === 'number') actionDirection32Values.add(image.direction32)
      }
    }
    checks.push(
      actionDirection32Values.size > 1
        ? pass(
            'frontend-direction-changing-actions',
            `observed changing action directions: ${Array.from(actionDirection32Values).join(',')}`
          )
        : fail('frontend-direction-changing-actions', 'action directions did not vary during frontend sampling')
    )
    checks.push(
      any((sample) => sample.visibleImages.length > 0)
        ? pass('frontend-visible-images', 'visible unit/resource images exist in scene composer')
        : fail('frontend-visible-images', 'no visible images found')
    )
    checks.push(
      any((sample) => sample.visibleMarkers.length > 0)
        ? pass('frontend-carry-markers-visible', 'carry markers become visible for resource workers')
        : fail('frontend-carry-markers-visible', 'no visible carry markers observed')
    )
    checks.push(
      any((sample) =>
        sample.visibleMarkers.some(
          (marker) => marker.renderOrder >= 10_000 && marker.depthTest === false && marker.depthWrite === false
        )
      )
        ? pass('frontend-carry-markers-front', 'carry markers renderOrder>=10000 with depthTest/depthWrite disabled')
        : fail('frontend-carry-markers-front', 'visible markers are not forced to the front')
    )
    const markerY = samples.flatMap((sample) => sample.visibleMarkers.map((marker) => marker.y))
    const markerMoves = markerY.length >= 2 && Math.max(...markerY) - Math.min(...markerY) > 0.02
    checks.push(
      markerMoves
        ? pass('frontend-carry-marker-motion', `marker y range ${Math.min(...markerY).toFixed(3)}..${Math.max(...markerY).toFixed(3)}`)
        : fail('frontend-carry-marker-motion', 'marker position did not visibly animate')
    )
    const hardErrors = consoleMessages.filter(
      (msg) =>
        msg.type === 'error' &&
        !msg.text.includes('[WS] Error: Event') &&
        !msg.text.includes('createMapImage failed')
    )
    checks.push(
      hardErrors.length === 0
        ? pass('frontend-console-hard-errors', 'no unexpected browser console errors captured')
        : fail('frontend-console-hard-errors', `${hardErrors.length} unexpected errors: ${hardErrors.slice(0, 3).map((e) => e.text).join(' | ')}`)
    )

    const hasPath = (entry, expected) =>
      String(entry?.grpFile ?? '').replaceAll('/', '\\').toLowerCase().includes(expected)
    checks.push(
      hasPath(runtimeMapping.units.scv, 'terran\\scv.grp') && runtimeMapping.units.scv.iscriptPresent
        ? pass(
            'runtime-map-scv',
            `SCV unit 7 maps to ${runtimeMapping.units.scv.grpFile}, image=${runtimeMapping.units.scv.imageId}, iscript=${runtimeMapping.units.scv.iscript}`
          )
        : fail('runtime-map-scv', JSON.stringify(runtimeMapping.units.scv))
    )
    for (const [key, expected] of [
      ['mineral1', 'neutral\\min01.grp'],
      ['mineral2', 'neutral\\min02.grp'],
      ['mineral3', 'neutral\\min03.grp'],
      ['geyser', 'neutral\\geyser.grp'],
      ['refinery', 'terran\\refinery.grp'],
    ]) {
      const entry = runtimeMapping.units[key]
      checks.push(
        hasPath(entry, expected)
          ? pass(`runtime-map-${key}`, `unit ${entry.unitId} maps to ${entry.grpFile}`)
          : fail(`runtime-map-${key}`, JSON.stringify(entry))
      )
    }
    for (const [key, label] of [
      ['scvSpark', 'SCV spark image'],
      ['gasOrb', 'gas orb image'],
      ['gasSac', 'gas sac image'],
      ['gasTank', 'gas tank image'],
    ]) {
      const matches = runtimeMapping.images[key]
      checks.push(
        matches.length > 0 && matches.some((entry) => entry.iscriptPresent)
          ? pass(`runtime-image-${key}`, `${label} resolves through images.dat/iscript (${matches.length} match(es))`)
          : fail(`runtime-image-${key}`, `${label} not resolved: ${JSON.stringify(matches)}`)
      )
    }

    return { checks, samples, consoleMessages, runtimeMapping }
  } finally {
    await browser.close()
  }
}

async function main() {
  ensureDir(OUT)
  const casc = verifyCasc()
  const frontend = await verifyFrontend()
  const checks = [...casc.checks, ...frontend.checks]
  const summary = {
    generatedAt: new Date().toISOString(),
    gameRoot: GAME_ROOT,
    frontendUrl: FRONTEND_URL,
    pass: checks.filter((check) => check.status === 'PASS').length,
    fail: checks.filter((check) => check.status === 'FAIL').length,
    checks,
    casc: {
      counts: casc.counts,
      assets: casc.assets,
    },
    frontend: {
      samples: frontend.samples,
      consoleMessages: frontend.consoleMessages,
      runtimeMapping: frontend.runtimeMapping,
    },
  }
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(summary, null, 2))
  console.log(JSON.stringify({ out: OUT, pass: summary.pass, fail: summary.fail, failed: checks.filter((c) => c.status === 'FAIL') }, null, 2))
  if (summary.fail > 0) process.exitCode = 1
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})

