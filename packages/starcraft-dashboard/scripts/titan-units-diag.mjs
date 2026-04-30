// Focused diagnostic for the "geyser shadow + plumes visible but no buildings/
// units rendered" complaint. Loads Titan via the Hermes dashboard iframe path
// (?titan=1 -> http://127.0.0.1:9120/?titan=1) so we exercise the same params
// the user sees, then:
//   1. Captures all browser-side console / pageerror lines.
//   2. Captures asset HTTP requests (esp. HD2 anim + tileset DDS).
//   3. After the GameScene mounts, walks the Three.js scene graph through a
//      window-installed probe to count meshes, sprites, image-frames per type
//      so we can see which categories are actually in the scene.
//   4. Captures pixel histograms in a few canvas regions to confirm where the
//      "missing" pixels are.
//   5. Saves screenshots to /tmp/titan-units-*.png.
//
// Run with: node scripts/titan-units-diag.mjs

import { chromium } from 'playwright'
import { writeFileSync } from 'node:fs'

// Direct-Titan URL so we can inspect the page without cross-origin sandboxing.
// Mirrors the params TitanGameClient.tsx passes to the iframe.
const TITAN = 'http://127.0.0.1:3344'
const CASC = 'http://127.0.0.1:8080'
const RUNTIME = 'http://127.0.0.1:8090/'
const PLUGINS = 'http://127.0.0.1:8091/'
const REPLAY = `${TITAN}/bundled/demo.rep`
// Default URL flips nominimap OFF so we can inspect/fix the minimap alignment,
// turns ON the classic minimap layout (flat bottom-left rectangle), and turns
// ON edge-of-screen camera pan. Override with env vars NOMINIMAP=1 / EDGEPAN=0
// / CLASSIC_MM=0 if you need to bypass any of these.
const NOMM = process.env.NOMINIMAP === '1' ? '&nominimap=1' : ''
const CMM = process.env.CLASSIC_MM === '0' ? '&classicMinimap=0' : '&classicMinimap=1'
const EP = process.env.EDGEPAN === '0' ? '&edgePan=0' : '&edgePan=1'
const URL =
  process.env.URL ||
  `${TITAN}/?assetServerUrl=${CASC}&runtime=${RUNTIME}&plugins=${PLUGINS}` +
    `&hideWelcome=1&endless=1${NOMM}${CMM}${EP}&hideOsCursor=1&hud=1` +
    `&replays=${encodeURIComponent(REPLAY)}&autoplay=1`

const browser = await chromium.launch({
  headless: true,
  args: [
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
    '--disable-gpu-sandbox',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-features=Vulkan',
    '--autoplay-policy=no-user-gesture-required',
  ],
})
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
await ctx.addInitScript(() => {
  try {
    localStorage.setItem('hideWelcome', 'true')
  } catch {}
})
const page = await ctx.newPage()

const startTs = Date.now()
const logs = []
const reqs = new Map()
const errs = []

page.on('pageerror', (e) =>
  errs.push(`[err] ${((Date.now() - startTs) / 1000).toFixed(1)}s ${e.message}`)
)
page.on('console', (m) => {
  const t = m.text()
  logs.push(`[${((Date.now() - startTs) / 1000).toFixed(1)}s][${m.type()}] ${t.slice(0, 400)}`)
})
page.on('requestfailed', (r) => {
  errs.push(
    `[reqfail] ${((Date.now() - startTs) / 1000).toFixed(1)}s ${r.method()} ${r.url()} ${
      r.failure()?.errorText
    }`
  )
})
page.on('response', (resp) => {
  const u = resp.url()
  // Only track Titan asset bridge calls
  if (
    u.includes(':8080/') &&
    (u.includes('/anim/') ||
      u.includes('/HD2/') ||
      u.includes('/tileset/') ||
      u.includes('/sound/') ||
      u.includes('/music/'))
  ) {
    const key = u.split('?')[0]
    const cur = reqs.get(key) || { count: 0, status: 0, ct: '', cl: 0 }
    cur.count += 1
    cur.status = resp.status()
    cur.ct = resp.headers()['content-type'] || ''
    cur.cl = Number(resp.headers()['content-length'] || 0)
    reqs.set(key, cur)
  }
})

console.log(`Loading ${URL}`)
await page.goto(URL, { waitUntil: 'domcontentloaded' })

const GAME_MOUNT_LOG = /\[GameScene\] resolveHideWelcome:/
const LOADING_SIG = /Preparing Your Journey|map \d+%|openbw \d+%|terrain-quartiles|chkToTerrainMesh/i

let mounted = false
for (let i = 0; i < 90 && !mounted; i++) {
  await page.waitForTimeout(2000)
  const dt = ((Date.now() - startTs) / 1000).toFixed(1)
  const info = await page.evaluate(() => {
    const c = document.querySelector('canvas')
    return {
      hasCanvas: !!c,
      cw: c ? c.width : 0,
      ch: c ? c.height : 0,
      text: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 180),
    }
  })
  const seen = logs.some((l) => GAME_MOUNT_LOG.test(l))
  if (i % 5 === 0 || seen) {
    console.log(`[t=${dt}s] canvas=${info.hasCanvas} ${info.cw}x${info.ch} mounted=${seen} text=${info.text.slice(0, 90)}`)
  }
  if (seen) {
    mounted = true
    break
  }
}

if (!mounted) {
  console.log('=== TIMED OUT waiting for GameScene to mount ===')
  await page.screenshot({ path: '/tmp/titan-units-timeout.png' })
  writeFileSync('/tmp/titan-units-pagelogs.log', logs.join('\n'))
  writeFileSync('/tmp/titan-units-errs.log', errs.join('\n'))
  await browser.close()
  process.exit(2)
}

const dt = ((Date.now() - startTs) / 1000).toFixed(1)
console.log(`=== GameScene mounted at t=${dt}s — instrumenting ===`)

await page.waitForTimeout(6000)

// Walk Titan's Three.js scene to count what's actually being rendered.
const sceneStats = await page.evaluate(() => {
  const w = window
  const T = w.THREE
  if (!T) {
    return {
      err: 'no THREE on window',
      keys: Object.keys(w).filter((k) => k.startsWith('__') || k === 'openBW' || k === 'gameStore').slice(0, 40),
    }
  }
  const candidates = [
    w.__hermesScene,
    w.gameStore?.()?.world?.scene,
    w.useGameStore?.getState?.()?.world?.scene,
  ]
  let scene = null
  for (const c of candidates) {
    if (c instanceof T.Scene) {
      scene = c
      break
    }
  }
  if (!scene) {
    return {
      err: 'could not find scene; available __/global keys:',
      keys: Object.keys(w).filter((k) => k.startsWith('__') || k === 'openBW' || k === 'gameStore').slice(0, 40),
    }
  }

  const bins = {
    total: 0,
    meshes: 0,
    sprites: 0,
    points: 0,
    groups: 0,
    instancedMeshes: 0,
    visible: 0,
    invisible: 0,
    byName: {},
    byType: {},
  }
  const visit = (o) => {
    bins.total += 1
    if (o.visible) bins.visible += 1
    else bins.invisible += 1
    bins.byType[o.type] = (bins.byType[o.type] || 0) + 1
    if (o.name) bins.byName[o.name] = (bins.byName[o.name] || 0) + 1
    if (o.isMesh) bins.meshes += 1
    if (o.isSprite) bins.sprites += 1
    if (o.isPoints) bins.points += 1
    if (o.isInstancedMesh) bins.instancedMeshes += 1
    if (o.isGroup) bins.groups += 1
    for (const c of o.children || []) visit(c)
  }
  visit(scene)
  return bins
})
console.log('=== Three.js scene stats ===')
console.log(JSON.stringify(sceneStats, null, 2).slice(0, 4000))

// Enumerate every alive unit with type id + position so we can confirm
// "buildings rendering" vs "only mineral fields rendering". Also probe the
// minimap mesh's world bbox vs the canvas, which tells us if click hit-tests
// will line up with the rendered minimap.
const entityReport = await page.evaluate(() => {
  const w = window
  const T = w.THREE
  const units = w.__hermesUnits
  const composer = w.__hermesSceneComposer
  const sprites = w.__hermesSprites
  const images = w.__hermesImages
  const scene = w.__hermesScene
  const ren = w.renderer || (w.gameStore && w.gameStore()?.renderer)

  const out = { ok: true }
  // Unit entities
  if (units) {
    let count = 0
    const byType = {}
    const buildings = []
    const sample = []
    for (const u of units) {
      count += 1
      const tid = u.typeId
      byType[tid] = (byType[tid] || 0) + 1
      const isBuilding = u.extras?.dat?.isBuilding
      if (isBuilding) buildings.push({ id: u.id, typeId: tid, x: u.x, y: u.y, name: u.extras?.dat?.name || null })
      if (sample.length < 25) {
        sample.push({
          id: u.id,
          typeId: tid,
          owner: u.owner,
          x: u.x,
          y: u.y,
          hp: u.hp,
          name: u.extras?.dat?.name || null,
          isBuilding,
          isResource: u.extras?.dat?.isResourceContainer,
        })
      }
    }
    out.units = { count, byType, buildings, sample }
  } else {
    out.units = { err: 'no __hermesUnits' }
  }

  // Sprite entities (visual objects in scene)
  if (sprites && sprites.group) {
    let visible = 0
    let total = 0
    for (const child of sprites.group.children || []) {
      total += 1
      if (child.visible !== false) visible += 1
    }
    out.spriteGroup = { total, visible }
  }

  // Image entities (anim atlases in flight)
  if (images && typeof images.get === 'function') {
    out.images = { has: true }
  }

  // Minimap geometry probe
  if (scene) {
    const mm = scene.getObjectByName ? scene.getObjectByName('minimap') : null
    if (mm) {
      const box = new T.Box3().setFromObject(mm)
      out.minimap = {
        visible: mm.visible,
        materialVisible: mm.material?.visible ?? null,
        position: mm.position.toArray(),
        scale: mm.scale.toArray(),
        rotation: [mm.rotation.x, mm.rotation.y, mm.rotation.z],
        bboxMin: box.min.toArray(),
        bboxMax: box.max.toArray(),
        renderOrder: mm.renderOrder,
      }
    } else {
      // The minimap is on overlayScene, not the main scene.
      out.minimap = { note: 'minimap not in main scene (likely on overlayScene)' }
    }
  }

  // Overlay composer minimap probe (overlayScene)
  if (composer && composer.scene) {
    // composer.scene IS the main scene; overlay is elsewhere.
  }
  if (w.__hermesPostProcessing) {
    const post = w.__hermesPostProcessing
    if (post.overlayScene) {
      const mm = post.overlayScene.getObjectByName('minimap')
      const cur = post.overlayScene.getObjectByName('cursor')
      if (mm) {
        const box = new T.Box3().setFromObject(mm)
        out.minimapOverlay = {
          visible: mm.visible,
          materialVisible: mm.material?.visible ?? null,
          position: mm.position.toArray(),
          scale: mm.scale.toArray(),
          rotation: [mm.rotation.x, mm.rotation.y, mm.rotation.z],
          bboxMin: box.min.toArray(),
          bboxMax: box.max.toArray(),
        }
      }
      if (cur) {
        out.cursorOverlay = { visible: cur.visible }
      }
    }
  }

  // Players + map size
  const players = w.__hermesPlayers
  if (players) {
    out.players = []
    for (const p of players) {
      out.players.push({
        id: p.id,
        name: p.name,
        race: p.race,
        startLocation: p.startLocation?.toArray?.() || null,
      })
    }
  }
  if (composer && composer.scene && composer.scene.userData) {
    out.sceneUserData = Object.keys(composer.scene.userData)
  }

  return out
})
console.log('=== Entity / minimap report ===')
console.log(JSON.stringify(entityReport, null, 2).slice(0, 6000))

// Probe OpenBW for sprite/unit counts, frame, and player resources.
const openbwState = await page.evaluate(() => {
  const w = window
  const obw = w.openBW || w.__hermesOpenBW
  if (!obw) return { err: 'no openBW exposed' }
  try {
    return {
      frame: typeof obw.getCurrentFrame === 'function' ? obw.getCurrentFrame() : null,
      gameSpeed: typeof obw.getGameSpeed === 'function' ? obw.getGameSpeed() : null,
      paused: typeof obw.isPaused === 'function' ? obw.isPaused() : null,
      sandbox: typeof obw.isSandboxMode === 'function' ? obw.isSandboxMode() : null,
      hasNextFrame: typeof obw.nextFrame === 'function',
      keys: Object.keys(obw).filter((k) => !k.startsWith('_')).slice(0, 60),
    }
  } catch (e) {
    return { err: String(e?.message || e) }
  }
})
console.log('=== OpenBW state ===')
console.log(JSON.stringify(openbwState, null, 2))

const cameraState = await page.evaluate(() => {
  const w = window
  const o = w.__hermesInitOrbit
  if (!o) return { err: 'no init-orbit', has: Object.keys(w).filter((k) => k.startsWith('__')) }
  const T = w.THREE
  return {
    azimuth: o.azimuthAngle,
    polar: o.polarAngle,
    distance: o.distance,
    target: o.getTarget(new T.Vector3()).toArray(),
    pos: o.getPosition(new T.Vector3()).toArray(),
  }
})
console.log('=== Camera state ===')
console.log(JSON.stringify(cameraState, null, 2))

// Take a few screenshots
await page.screenshot({ path: '/tmp/titan-units-full.png' })

const rect = await page.evaluate(() => {
  const c = document.querySelector('canvas')
  return c?.getBoundingClientRect() || null
})
console.log('canvas rect:', JSON.stringify(rect))

// === Minimap geometry probe (post-mount) ===
const minimapProbe = await page.evaluate(() => {
  const w = window
  const T = w.THREE
  const post = w.__hermesPostProcessing
  if (!post || !post.overlayScene || !post.overlayCamera) return { err: 'no post' }
  const mm = post.overlayScene.getObjectByName('minimap')
  if (!mm) return { err: 'no minimap mesh in overlayScene' }
  mm.updateWorldMatrix(true, true)
  // Compute the screen-space bounds of the minimap by projecting its 4 corners.
  const corners = [
    new T.Vector3(-0.5, -0.5, 0),
    new T.Vector3(0.5, -0.5, 0),
    new T.Vector3(0.5, 0.5, 0),
    new T.Vector3(-0.5, 0.5, 0),
  ].map((v) => v.applyMatrix4(mm.matrixWorld).project(post.overlayCamera))
  const cw = w.innerWidth || 1280
  const ch = w.innerHeight || 800
  const screenCorners = corners.map((p) => ({
    x: (p.x * 0.5 + 0.5) * cw,
    y: (1 - (p.y * 0.5 + 0.5)) * ch,
  }))
  return {
    visible: mm.visible,
    classicMinimap: w.__hermesClassicMinimap,
    rotation: [mm.rotation.x, mm.rotation.y, mm.rotation.z],
    position: mm.position.toArray(),
    scale: mm.scale.toArray(),
    screenCorners,
    canvas: { w: cw, h: ch },
  }
})
console.log('=== Minimap probe ===')
console.log(JSON.stringify(minimapProbe, null, 2))

// === Edge-pan exposure probe ===
const edgePanProbe = await page.evaluate(() => ({
  enabled: window.__hermesEdgePanEnabled,
  hasUpdater: typeof window.__hermesUpdateEdgePan === 'function',
  initOrbitMouseButtons: window.__hermesInitOrbit
    ? {
        left: window.__hermesInitOrbit.mouseButtons.left,
        right: window.__hermesInitOrbit.mouseButtons.right,
        middle: window.__hermesInitOrbit.mouseButtons.middle,
        wheel: window.__hermesInitOrbit.mouseButtons.wheel,
      }
    : null,
}))
console.log('=== Edge-pan probe ===')
console.log(JSON.stringify(edgePanProbe, null, 2))

// === Behavioural test: edge-pan to the right ===
const cameraTargetBefore = await page.evaluate(() => {
  const w = window
  const T = w.THREE
  const o = w.__hermesInitOrbit
  return o ? o.getTarget(new T.Vector3()).toArray() : null
})
console.log('camera target before edge-pan:', JSON.stringify(cameraTargetBefore))
await page.mouse.move(640, 400)
await page.mouse.move(1278, 400)
await page.waitForTimeout(2000)
const cameraTargetAfter = await page.evaluate(() => {
  const w = window
  const T = w.THREE
  const o = w.__hermesInitOrbit
  return o ? o.getTarget(new T.Vector3()).toArray() : null
})
console.log('camera target after right-edge:', JSON.stringify(cameraTargetAfter))
const dx = (cameraTargetAfter?.[0] ?? 0) - (cameraTargetBefore?.[0] ?? 0)
console.log(`edge-pan delta-x = ${dx.toFixed(3)} (positive = camera moved right)`)
await page.mouse.move(640, 400)
await page.waitForTimeout(500)

// === Behavioural test: minimap click ===
if (minimapProbe && !minimapProbe.err) {
  const cx = minimapProbe.screenCorners.reduce((a, c) => a + c.x, 0) / 4
  const cy = minimapProbe.screenCorners.reduce((a, c) => a + c.y, 0) / 4
  const beforeClick = await page.evaluate(() => {
    const w = window
    const T = w.THREE
    const o = w.__hermesInitOrbit
    return o ? o.getTarget(new T.Vector3()).toArray() : null
  })
  console.log(`minimap click probe: clicking centre at (${cx.toFixed(0)},${cy.toFixed(0)})`)
  await page.mouse.move(cx, cy)
  await page.waitForTimeout(200)
  await page.mouse.down({ button: 'left' })
  await page.waitForTimeout(50)
  await page.mouse.up({ button: 'left' })
  await page.waitForTimeout(2000)
  const afterClick = await page.evaluate(() => {
    const w = window
    const T = w.THREE
    const o = w.__hermesInitOrbit
    return o ? o.getTarget(new T.Vector3()).toArray() : null
  })
  console.log('camera target before minimap-click:', JSON.stringify(beforeClick))
  console.log('camera target after  minimap-click:', JSON.stringify(afterClick))
}

// === Final render screenshot showing aligned minimap ===
await page.screenshot({ path: '/tmp/titan-units-final.png' })

writeFileSync('/tmp/titan-units-pagelogs.log', logs.join('\n'))
writeFileSync('/tmp/titan-units-errs.log', errs.join('\n'))
writeFileSync(
  '/tmp/titan-units-reqs.log',
  Array.from(reqs.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([u, v]) => `${v.status} ${v.ct.padEnd(28)} ${String(v.cl).padStart(10)} x${v.count} ${u}`)
    .join('\n')
)

console.log(
  `=== HTTP asset summary: ${reqs.size} unique URLs, ${errs.length} errors. /tmp/titan-units-*.log ===`
)

console.log('=== last 30 console lines ===')
for (const l of logs.slice(-30)) console.log(l)

console.log('=== first 20 errors ===')
for (const l of errs.slice(0, 20)) console.log(l)

await browser.close()
console.log('done')
