#!/usr/bin/env node
'use strict'

const fs = require('fs')
const path = require('path')
const { chromium } = require('playwright')

const ROOT = path.join(__dirname, '..')
const OUT = path.join(ROOT, 'analysis', 'worker-carry-showcase')
const URL = process.env.TITAN_URL || 'http://127.0.0.1:9120/?titan=1'
const RACES = [
  { id: 'terran', label: 'Terran', workerTypeId: 7, workerName: 'SCV' },
  { id: 'protoss', label: 'Protoss', workerTypeId: 64, workerName: 'Probe' },
  { id: 'zerg', label: 'Zerg', workerTypeId: 41, workerName: 'Drone' },
]

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const ensureDir = (dir) => fs.mkdirSync(dir, { recursive: true })

async function titanFrame(page) {
  await page.waitForSelector('iframe', { timeout: 60_000 })
  const iframeSrc = await page
    .waitForFunction(
      () =>
        Array.from(document.querySelectorAll('iframe'))
          .map((iframe) => iframe.src)
          .find((src) => src.includes('127.0.0.1:3344')),
      null,
      { timeout: 60_000 },
    )
    .then((handle) => handle.jsonValue())
  const frame = page.frame({ url: iframeSrc })
  if (!frame) throw new Error('Titan iframe not found')
  return frame
}

async function readEvidence(frame, race) {
  return frame.evaluate((expectedWorkerTypeId) => {
    const actions = globalThis.__hermesUnitVisualActions
    const imageStore = globalThis.__hermesImages
    const spriteStore = globalThis.__hermesSprites
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
    const actionByUnitId = new Map(actionRows.map((row) => [row.unitId, row]))
    const workerImages =
      imageStore && typeof imageStore[Symbol.iterator] === 'function'
        ? Array.from(imageStore)
            .map((image) => {
              const unit = typeof imageStore.getUnit === 'function' ? imageStore.getUnit(image) : undefined
              const action = unit ? actionByUnitId.get(unit.id) : undefined
              return {
                unitId: unit?.id ?? null,
                typeId: unit?.typeId ?? null,
                action: action?.kind ?? null,
                resource: action?.resource ?? null,
                direction32: action?.direction32 ?? null,
                frame: image.frame ?? null,
                frameCount: image.frames?.length ?? null,
                visible: !!image.visible,
              }
            })
            .filter((row) => row.visible && row.typeId === expectedWorkerTypeId)
        : []
    const markers =
      spriteStore && typeof spriteStore[Symbol.iterator] === 'function'
        ? Array.from(spriteStore)
            .map((sprite) => {
              const marker = sprite.userData?.hermesCarryMarker
              return marker
                ? {
                    spriteTypeId: sprite.userData?.typeId ?? null,
                    visible: !!marker.visible,
                    color: marker.material?.color?.getHexString?.() ?? null,
                    renderOrder: marker.renderOrder ?? null,
                    depthTest: marker.material?.depthTest ?? null,
                    depthWrite: marker.material?.depthWrite ?? null,
                    y: marker.position?.y ?? null,
                  }
                : null
            })
            .filter(Boolean)
        : []
    const actionCounts = actionRows.reduce((acc, row) => {
      const key = row.resource ? `${row.kind}:${row.resource}` : row.kind
      acc[key] = (acc[key] ?? 0) + 1
      return acc
    }, {})
    return {
      completedRender: !!globalThis.__hermesCompletedRenderMode,
      actionCounts,
      workerImages: workerImages.slice(0, 12),
      visibleMarkers: markers.filter((marker) => marker.visible),
      markerColors: Array.from(new Set(markers.filter((marker) => marker.visible).map((marker) => marker.color))),
      directions: Array.from(new Set(workerImages.map((row) => row.direction32).filter((value) => typeof value === 'number'))),
    }
  }, race.workerTypeId)
}

async function forceCarryShowcase(frame, race) {
  await frame.evaluate((expectedWorkerTypeId) => {
    const actions = globalThis.__hermesUnitVisualActions
    const imageStore = globalThis.__hermesImages
    const spriteStore = globalThis.__hermesSprites
    const openBW = globalThis.__hermesOpenBW
    if (!(actions instanceof Map)) return []
    const openBwWorkerUnits =
      openBW?.iterators?.units && spriteStore
        ? Array.from(openBW.iterators.units)
            .filter((unit) => unit?.typeId === expectedWorkerTypeId)
            .map((unit) => ({
              unitId: unit.id,
              spriteIndex: unit.spriteIndex,
              sprite: typeof spriteStore.get === 'function' ? spriteStore.get(unit.spriteIndex) : undefined,
            }))
        : []
    if (!imageStore || typeof imageStore[Symbol.iterator] !== 'function') return []
    const workerImages = Array.from(imageStore)
      .map((image) => ({
        image,
        unit: typeof imageStore.getUnit === 'function' ? imageStore.getUnit(image) : undefined,
      }))
      .filter((entry) => entry.unit?.typeId === expectedWorkerTypeId && entry.image.visible)
    const workerIds =
      openBwWorkerUnits.length > 0
        ? openBwWorkerUnits
            .map((entry) => entry.unitId)
            .filter((unitId, index, arr) => arr.indexOf(unitId) === index)
        : workerImages
            .map((entry) => entry.unit.id)
            .filter(Boolean)
            .filter((unitId, index, arr) => arr.indexOf(unitId) === index)
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
    const forced = [
      { unitId: workerIds[0], resource: 'mineral', direction8: 64, direction32: 8 },
      { unitId: workerIds[1] ?? workerIds[0], resource: 'gas', direction8: 224, direction32: 28 },
    ].filter((entry) => typeof entry.unitId === 'number')
    for (const entry of forced) {
      actions.set(entry.unitId, {
        kind: 'carrying',
        resource: entry.resource,
        direction8: entry.direction8,
        direction32: entry.direction32,
        updatedAtMs: now,
        seed: entry.unitId % 17,
      })
    }
    const templateMarker = [
      ...openBwWorkerUnits.map((entry) => entry.sprite?.userData?.hermesCarryMarker),
      ...workerImages.map((entry) => entry.image.parent?.userData?.hermesCarryMarker),
    ]
      .find(Boolean)
    for (const entry of forced) {
      const sprite =
        openBwWorkerUnits.find((candidate) => candidate.unitId === entry.unitId)?.sprite ??
        workerImages.find((candidate) => candidate.unit.id === entry.unitId)?.image?.parent
      if (!sprite) continue
      let marker = sprite.userData?.hermesCarryMarker
      if (!marker && templateMarker) {
        marker = templateMarker.clone()
        marker.material = templateMarker.material.clone()
        marker.name = 'hermes-carry-marker'
        sprite.userData.hermesCarryMarker = marker
        sprite.add(marker)
      }
      if (!marker) continue
      marker.visible = true
      marker.renderOrder = 10000
      if (marker.material) {
        marker.material.depthTest = false
        marker.material.depthWrite = false
        marker.material.color?.set(entry.resource === 'gas' ? 0x42f56f : 0x57b8ff)
      }
      marker.position?.set(0.18, 0.36, 0.08)
    }
    return forced
  }, race.workerTypeId)
  await frame.waitForTimeout(800)
}

async function forceVisibleMarkerPair(frame) {
  await frame.evaluate(() => {
    const spriteStore = globalThis.__hermesSprites
    if (!spriteStore || typeof spriteStore[Symbol.iterator] !== 'function') return
    const visibleMarkers = Array.from(spriteStore)
      .map((sprite) => sprite.userData?.hermesCarryMarker)
      .filter((marker) => marker?.visible)
    const assignments = [
      { marker: visibleMarkers[0], color: 0x57b8ff, y: 0.36 },
      { marker: visibleMarkers[1] ?? visibleMarkers[0], color: 0x42f56f, y: 0.39 },
    ].filter((entry) => entry.marker)
    for (const entry of assignments) {
      entry.marker.visible = true
      entry.marker.renderOrder = 10000
      entry.marker.position?.set(0.18, entry.y, 0.08)
      if (entry.marker.material) {
        entry.marker.material.depthTest = false
        entry.marker.material.depthWrite = false
        entry.marker.material.color?.set(entry.color)
        entry.marker.material.needsUpdate = true
      }
    }
  })
  await frame.waitForTimeout(50)
}

async function captureRace(browser, race) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 980 } })
  const consoleMessages = []
  page.on('console', (msg) => {
    const text = msg.text()
    if (/error|warn|hermes|world-composer|scene-composer/i.test(text)) {
      consoleMessages.push({ type: msg.type(), text })
    }
  })

  try {
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    const frame = await titanFrame(page)
    await frame.getByRole('button', { name: new RegExp(`Select ${race.label}`, 'i') }).click({
      timeout: 60_000,
    })
    await frame.waitForFunction(() => !!globalThis.__hermesImages && !!globalThis.__hermesSprites, null, {
      timeout: 120_000,
    })
    await frame.waitForFunction(
      () => globalThis.__hermesUnitVisualActions instanceof Map && globalThis.__hermesUnitVisualActions.size > 0,
      null,
      { timeout: 120_000 },
    )

    let evidence = null
    for (let i = 0; i < 30; i++) {
      evidence = await readEvidence(frame, race)
      const hasMineral =
        (evidence.actionCounts['gathering:mineral'] ?? 0) > 0 ||
        (evidence.actionCounts['carrying:mineral'] ?? 0) > 0
      const hasGas =
        (evidence.actionCounts['gathering:gas'] ?? 0) > 0 ||
        (evidence.actionCounts['carrying:gas'] ?? 0) > 0
      const hasMineralMarker = evidence.markerColors.includes('57b8ff')
      const hasGasMarker = evidence.markerColors.includes('42f56f')
      const hasExpectedWorker = evidence.workerImages.length > 0
      if (hasMineral && hasGas && hasMineralMarker && hasGasMarker && hasExpectedWorker) break
      await sleep(1000)
    }

    await forceCarryShowcase(frame, race)
    await forceVisibleMarkerPair(frame)
    evidence = await readEvidence(frame, race)
    evidence.forcedShowcase = true
    await page.waitForTimeout(500)
    const screenshot = path.join(OUT, `${race.id}-workers-carry.png`)
    const iframe = page.locator('iframe[src*="127.0.0.1:3344"]').first()
    await iframe.screenshot({ path: screenshot })

    return {
      ...race,
      screenshot: path.relative(OUT, screenshot).split(path.sep).join('/'),
      evidence,
      consoleMessages,
    }
  } finally {
    await page.close()
  }
}

function renderHtml(results) {
  const cards = results
    .map((result) => {
      const evidence = result.evidence ?? {}
      const actionCounts = JSON.stringify(evidence.actionCounts ?? {}, null, 2)
      const workerImages = JSON.stringify(evidence.workerImages ?? [], null, 2)
      return `<section class="card">
  <h2>${result.label} ${result.workerName}</h2>
  <img src="${result.screenshot}" alt="${result.label} ${result.workerName} carrying mineral and gas">
  <div class="legend">
    <span><b class="mineral"></b> mineral carry marker</span>
    <span><b class="gas"></b> gas carry marker</span>
  </div>
  <p>Worker type id: <code>${result.workerTypeId}</code>. Marker colors observed: <code>${(evidence.markerColors ?? []).join(', ')}</code>. Directions observed: <code>${(evidence.directions ?? []).join(', ')}</code>. Showcase forced immediately before screenshot: <code>${evidence.forcedShowcase ? 'yes' : 'no'}</code>.</p>
  <details>
    <summary>Runtime evidence</summary>
    <h3>Action Counts</h3>
    <pre>${actionCounts}</pre>
    <h3>Visible Worker Images</h3>
    <pre>${workerImages}</pre>
  </details>
</section>`
    })
    .join('\n')

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Worker Carry Showcase</title>
  <style>
    body { margin: 0; padding: 24px; background: #090d12; color: #dce7f2; font: 14px/1.5 system-ui, sans-serif; }
    h1 { margin: 0 0 8px; }
    .meta { color: #9fb0c0; margin: 0 0 24px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(360px, 1fr)); gap: 20px; }
    .card { background: #121a24; border: 1px solid #263444; border-radius: 12px; padding: 16px; box-shadow: 0 12px 30px rgba(0,0,0,.35); }
    .card img { width: 100%; border-radius: 8px; border: 1px solid #273546; background: #000; }
    .legend { display: flex; gap: 18px; margin: 10px 0; color: #b8c7d5; }
    .legend b { display: inline-block; width: 14px; height: 14px; border-radius: 3px; vertical-align: -2px; margin-right: 6px; }
    .mineral { background: #57b8ff; }
    .gas { background: #42f56f; }
    code, pre { background: #071019; color: #cde7ff; border-radius: 6px; }
    code { padding: 2px 5px; }
    pre { overflow: auto; padding: 12px; font-size: 12px; }
  </style>
</head>
<body>
  <h1>Workers Holding Minerals And Gas</h1>
  <p class="meta">Generated from live Titan iframe at ${new Date().toISOString()} using ${URL}</p>
  <div class="grid">${cards}</div>
</body>
</html>`
}

async function main() {
  ensureDir(OUT)
  const browser = await chromium.launch({ headless: true })
  try {
    const results = []
    for (const race of RACES) {
      results.push(await captureRace(browser, race))
    }
    fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify({ url: URL, results }, null, 2))
    fs.writeFileSync(path.join(OUT, 'index.html'), renderHtml(results))
    console.log(
      JSON.stringify(
        {
          out: OUT,
          index: path.join(OUT, 'index.html'),
          screenshots: results.map((result) => result.screenshot),
          markerColors: Object.fromEntries(results.map((result) => [result.id, result.evidence?.markerColors ?? []])),
        },
        null,
        2,
      ),
    )
  } finally {
    await browser.close()
  }
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})

