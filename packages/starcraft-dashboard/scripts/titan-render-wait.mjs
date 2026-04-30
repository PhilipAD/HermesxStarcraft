import { chromium } from 'playwright'
import { writeFileSync } from 'node:fs'

const TITAN = 'http://127.0.0.1:3344'
// Default to the bundled Brood War demo replay so we render an actual base
// (Command Center, SCVs, units in motion) — not just a blank ladder map.
// Override with MAP_PATH=... env var to load a specific .scm/.scx file instead.
const REPLAY_URL = process.env.REPLAY_URL || `${TITAN}/bundled/demo.rep`
const USE_REPLAY = !process.env.MAP_PATH
const MAP_PATH = process.env.MAP_PATH || 'ladder/2018Season2/(2)Benzene 1.1_iCCup.scx'
const MAP = `http://127.0.0.1:8080/maps/${encodeURI(MAP_PATH)}`
const sceneParam = USE_REPLAY
  ? `replays=${encodeURIComponent(REPLAY_URL)}`
  : `map=${encodeURIComponent(MAP)}`
// hideWelcome=1 tells Titan to skip the first-run modal so our screenshots
// show the actual base, not the overlay.
// loop=1: never end the replay — keep the simulation alive for inspection.
// nominimap=1: hide the (mostly fog-of-war black) built-in minimap.
const URL = `${TITAN}/?assetServerUrl=http://127.0.0.1:8080&runtime=http://127.0.0.1:8090/&plugins=http://127.0.0.1:8091/&hideWelcome=1&loop=1&nominimap=1&${sceneParam}`

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
const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 } })
// Belt-and-braces: also pre-seed localStorage before any page script runs so
// the Welcome modal never paints even on first visit.
await ctx.addInitScript(() => {
  try { localStorage.setItem('hideWelcome', 'true') } catch {}
})
const page = await ctx.newPage()

const startTs = Date.now()
const logs = []
page.on('pageerror', (e) => logs.push(`[err] ${((Date.now() - startTs)/1000).toFixed(1)}s ${e.message}`))
page.on('console', (m) => {
  const t = m.text()
  logs.push(`[${((Date.now() - startTs)/1000).toFixed(1)}s][${m.type()}] ${t.slice(0, 300)}`)
})

console.log(`Loading ${URL}`)
await page.goto(URL, { waitUntil: 'domcontentloaded' })

// GameScene's "resolveHideWelcome" logs as soon as it mounts. That is the
// tightest signal that the game scene has rendered (much better than string-
// matching title bar changes or waiting for the home splash to clear).
const GAME_MOUNT_LOG = /\[GameScene\] resolveHideWelcome:/
const WELCOME_SIG = /Welcome!|Press ESC for the menu/i
const LOADING_SIG = /Preparing Your Journey|map \d+%|openbw \d+%|terrain-quartiles|chkToTerrainMesh/i

let done = false
let lastText = ''
let sceneReady = false
const milestones = []
let shotIndex = 0

async function dismissWelcomeIfPresent() {
  // Click any element whose text matches the close affordance in welcome.tsx
  const closed = await page.evaluate(() => {
    const needle = 'Click here to close this message'
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT)
    let node
    while ((node = walker.nextNode())) {
      if (node instanceof HTMLElement && node.innerText && node.innerText.includes(needle)) {
        node.click()
        return true
      }
    }
    try { localStorage.setItem('hideWelcome', 'true') } catch {}
    return false
  })
  return closed
}

async function capture(name, waitMs = 0) {
  if (waitMs > 0) await page.waitForTimeout(waitMs)
  const p = `/tmp/${name}.png`
  await page.screenshot({ path: p, fullPage: false })
  shotIndex += 1
  const dt = ((Date.now() - startTs) / 1000).toFixed(1)
  console.log(`    [t=${dt}s] -> ${p}`)
  return p
}

for (let i = 0; i < 100 && !done; i++) {
  await page.waitForTimeout(2000)
  const info = await page.evaluate(() => {
    const body = document.body.innerText.replace(/\s+/g, ' ').slice(0, 260)
    const c = document.querySelector('canvas')
    return {
      text: body,
      hasCanvas: !!c,
      canvasSize: c ? [c.width, c.height] : null,
      title: document.title,
    }
  })
  const dt = ((Date.now() - startTs) / 1000).toFixed(1)
  if (info.text !== lastText) {
    console.log(`[t=${dt}s] canvas=${info.hasCanvas} ${info.canvasSize?.join('x') || '-'}  title="${info.title}"  text=${info.text.slice(0, 160)}`)
    lastText = info.text
  }

  // Use the log-based signal instead of DOM text — it fires exactly at mount.
  const gameMounted = logs.some((l) => GAME_MOUNT_LOG.test(l))
  const isGameScene = gameMounted && !LOADING_SIG.test(info.text)
  const welcomeUp = WELCOME_SIG.test(info.text)
  const isCommanderError = /Commander\.\s*We have a problem/i.test(info.text)

  if (welcomeUp) {
    const clicked = await dismissWelcomeIfPresent()
    console.log(`    [t=${dt}s] welcome modal seen, dismiss attempted (clicked=${clicked})`)
    await page.waitForTimeout(1000)
    continue
  }

  if (isGameScene && !sceneReady) {
    sceneReady = true
    milestones.push({ event: 'game-scene-ready', t: dt })
    console.log(`=== GAME SCENE READY at t=${dt}s — capturing sequence ===`)

    // Make sure keypresses go to the Titan window, not Playwright's harness.
    try { await page.locator('canvas').first().click({ force: true }) } catch {}

    // Immediately switch to Standard camera which actually shows the base with
    // units; the default "Auto Observer" drifts through the skybox. Press
    // multiple times with waits so the scene controller has time to swap.
    await page.keyboard.press('1')
    await page.waitForTimeout(3000)
    await page.keyboard.press('1')
    await page.waitForTimeout(3000)

    await capture('titan-base-01-first', 1500)

    // Cycle through all four camera modes to prove animations/map work.
    for (const [key, label] of [
      ['2', '360'],
      ['3', 'overview'],
      ['4', 'auto'],
      ['1', 'standard'],
    ]) {
      await page.keyboard.press(key)
      await capture(`titan-base-cam${key}-${label}`, 3000)
    }

    // Standard camera is last; grab 5 consecutive frames to prove live animation.
    await page.waitForTimeout(1500)
    for (let f = 0; f < 5; f++) {
      await capture(`titan-base-anim-f${f}`, 800)
    }

    // ------------------------------------------------------------
    // Mouse-driven camera navigation test.
    // The init viewport now binds left=ROTATE / right=TRUCK / wheel=DOLLY,
    // so dragging the canvas should change what's visible. We capture before
    // and after each gesture and emit a "moved" signal log line.
    // ------------------------------------------------------------
    const canvasBox = await page.locator('canvas').first().boundingBox()
    if (canvasBox) {
      const cx = canvasBox.x + canvasBox.width / 2
      const cy = canvasBox.y + canvasBox.height / 2

      // Dump initial camera state for the diagnosis log so we can see in the
      // log if orbit is wired up. The init viewport exposes its orbit on
      // window.__hermesInitOrbit so tests can verify gesture -> camera motion.
      const probeOrbit = async (label) => {
        const r = await page.evaluate(() => {
          const o = window.__hermesInitOrbit
          if (!o) return { present: false }
          return {
            present: true,
            azimuth: o.azimuthAngle,
            polar: o.polarAngle,
            distance: o.distance,
            target: o.getTarget(new (window.THREE?.Vector3 || Object)())?.toArray
              ? o.getTarget(new window.THREE.Vector3()).toArray()
              : null,
          }
        })
        console.log(`[cursor] orbit ${label}: ${JSON.stringify(r)}`)
        return r
      }
      const before = await page.evaluate(() => {
        const c = document.querySelector('canvas')
        return {
          rect: c?.getBoundingClientRect(),
          parent: c?.parentElement?.tagName,
          z: c ? getComputedStyle(c).zIndex : null,
          poEvents: c ? getComputedStyle(c).pointerEvents : null,
        }
      })
      console.log(`[cursor] canvas state before drag: ${JSON.stringify(before)}`)
      const o0 = await probeOrbit('initial')

      await capture('titan-cursor-before', 500)

      // Left-drag => orbital rotate. Use a longer drag with bigger steps to
      // make rotation visible against the swiftshader render. CameraControls
      // wires via pointerdown — we explicitly dispatch pointer events too.
      await page.mouse.move(cx, cy)
      await page.mouse.down({ button: 'left' })
      for (let i = 1; i <= 12; i++) {
        await page.mouse.move(cx + i * 24, cy + i * 6, { steps: 2 })
        await page.waitForTimeout(50)
      }
      await page.mouse.up({ button: 'left' })
      await capture('titan-cursor-after-rotate', 800)
      const oRot = await probeOrbit('after-rotate')
      console.log('[cursor] rotate gesture sent')

      // Wheel => dolly zoom (zoom in to make it obvious).
      // CameraControls wheel needs the pointer to be over the canvas.
      await page.mouse.move(cx, cy)
      await page.mouse.wheel(0, -800)
      await page.waitForTimeout(800)
      await capture('titan-cursor-after-zoom', 600)
      const oZoom = await probeOrbit('after-zoom')
      console.log('[cursor] wheel zoom sent')

      // Right-drag => truck pan
      await page.mouse.move(cx, cy)
      await page.mouse.down({ button: 'right' })
      for (let i = 1; i <= 10; i++) {
        await page.mouse.move(cx - i * 22, cy, { steps: 2 })
        await page.waitForTimeout(50)
      }
      await page.mouse.up({ button: 'right' })
      await capture('titan-cursor-after-pan', 800)
      const oPan = await probeOrbit('after-pan')
      console.log('[cursor] pan gesture sent')

      // Diagnose movement deltas
      const dAz = (oRot.azimuth ?? 0) - (o0.azimuth ?? 0)
      const dDist = (oZoom.distance ?? 0) - (oRot.distance ?? 0)
      const dPan = (oPan.target?.[0] ?? 0) - (o0.target?.[0] ?? 0)
      console.log(`[cursor] dAzimuth=${dAz.toFixed(3)} rad, dDistance=${dDist.toFixed(2)}, dPanX=${dPan.toFixed(2)}`)
    } else {
      console.log('[cursor] WARNING: could not locate canvas bounding box')
    }

    // ------------------------------------------------------------
    // Click-to-describe test: click near the centre of the canvas a few
    // times and listen for the postMessage that world-composer emits when
    // the unit selection changes. We can't intercept postMessage from the
    // page, so we watch for the "selected-units-changed" emission via
    // window.__titanSelections that we install below.
    // ------------------------------------------------------------
    await page.evaluate(() => {
      // @ts-ignore — debug instrumentation only
      window.__titanSelections = []
      window.addEventListener('message', (ev) => {
        // @ts-ignore
        if (ev.data && ev.data.type === 'titan:selected-units') {
          // @ts-ignore
          window.__titanSelections.push(ev.data.units)
        }
      })
    })

    if (canvasBox) {
      const cx = canvasBox.x + canvasBox.width / 2
      const cy = canvasBox.y + canvasBox.height / 2
      // Try clicking in a small spiral so we hit a unit/building.
      for (const [dx, dy] of [
        [0, 0], [40, 0], [-40, 0], [0, 40], [0, -40],
        [80, 0], [-80, 40], [40, -40], [60, 60], [-60, -60],
      ]) {
        await page.mouse.click(cx + dx, cy + dy, { delay: 40 })
        await page.waitForTimeout(300)
      }
    }

    const selections = await page.evaluate(() => {
      // @ts-ignore
      return Array.isArray(window.__titanSelections) ? window.__titanSelections : []
    })
    console.log(`[click] received ${selections.length} selection messages from Titan`)
    if (selections.length > 0) {
      console.log(`[click] first non-empty selection: ${JSON.stringify(selections.find((s) => s.length))}`)
    }

    // Final canonical "base" shot stays on Standard.
    await capture('titan-render-wait-final', 2000)

    // Pixel histogram diagnosis (just to cross-check vs the screenshot).
    const pixelStats = await page.evaluate(() => {
      const canvases = Array.from(document.querySelectorAll('canvas'))
      // The last canvas in the DOM is typically the compositor display canvas
      const c = canvases[canvases.length - 1]
      if (!c) return null
      const ctx2d = c.getContext('2d')
      if (!ctx2d) return { note: 'canvas has no 2d ctx (WebGL-only)', count: canvases.length }
      const w = Math.min(256, c.width)
      const h = Math.min(256, c.height)
      const x = Math.max(0, Math.floor((c.width - w) / 2))
      const y = Math.max(0, Math.floor((c.height - h) / 2))
      const img = ctx2d.getImageData(x, y, w, h)
      const px = img.data
      let sum = 0, nonBlack = 0
      const uniq = new Set()
      for (let i = 0; i < px.length; i += 4) {
        const v = px[i] + px[i + 1] + px[i + 2]
        sum += v
        if (v > 30) nonBlack++
        uniq.add(((px[i] >> 4) << 8) | ((px[i + 1] >> 4) << 4) | (px[i + 2] >> 4))
      }
      return {
        numCanvases: canvases.length,
        avg: (sum / (px.length / 4)).toFixed(1),
        nonBlackPx: nonBlack,
        totalPx: px.length / 4,
        uniqueColors: uniq.size,
      }
    })
    console.log(`=== canvas pixel stats (center) === ${JSON.stringify(pixelStats)}`)

    done = true
    break
  }

  if (isCommanderError) {
    console.log(`=== ERROR SCENE at t=${dt}s — capturing and aborting ===`)
    await capture('titan-render-error')
    done = true
    break
  }
}

if (!sceneReady) {
  console.log('=== TIMED OUT waiting for game scene ===')
  await capture('titan-render-timeout')
}

writeFileSync('/tmp/titan-render-wait-pagelogs.log', logs.join('\n'))
console.log('\n=== log tail (last 40 lines) ===')
for (const e of logs.slice(-40)) console.log(e)
console.log('\n=== milestones ===')
for (const m of milestones) console.log(m)
console.log(`total screenshots: ${shotIndex}`)

await browser.close()
process.exit(done ? 0 : 2)
