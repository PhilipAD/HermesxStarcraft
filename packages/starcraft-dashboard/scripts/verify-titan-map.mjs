// End-to-end verification of the Titan iframe map-load path.
// Boots a headless Chromium with swiftshader flags so WebGL works in this VM,
// loads the Hermes dashboard root (default route = Titan), and captures:
//   - iframe src (should include ?map=http://127.0.0.1:8080/maps/...)
//   - titan console logs (should show "loading chk", not just "createWraithScene")
//   - resulting scene id / page title
// Prints a summary; screenshot written to /tmp/titan-map-verify.png.
import { chromium } from 'playwright'

const OUTER = process.env.HERMES_URL || 'http://127.0.0.1:9120/'

const browser = await chromium.launch({
  headless: true,
  args: [
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
    '--disable-gpu-sandbox',
    '--use-gl=angle',
    '--use-angle=swiftshader',
  ],
})
const context = await browser.newContext({ viewport: { width: 1400, height: 900 } })
const page = await context.newPage()

const outerLogs = []
page.on('console', (msg) => {
  outerLogs.push(`[outer:${msg.type()}] ${msg.text()}`)
})

// Hook frame log collection. Playwright's Frame doesn't emit console on its own;
// BrowserContext.on('console') surfaces events from any page/frame in the context,
// BUT it only fires for top-level pages. For subframes we have to use CDP directly.
const frameLogs = []
const client = await context.newCDPSession(page)
await client.send('Runtime.enable')
await client.send('Target.setAutoAttach', {
  autoAttach: true,
  waitForDebuggerOnStart: false,
  flatten: true,
})
client.on('Runtime.consoleAPICalled', (ev) => {
  const text = (ev.args || [])
    .map((a) => (a.value !== undefined ? String(a.value) : a.description || a.type))
    .join(' ')
  frameLogs.push(`[cdp:${ev.type}] ${text}`)
})
client.on('Runtime.exceptionThrown', (ev) => {
  frameLogs.push(`[cdp:exception] ${ev.exceptionDetails && ev.exceptionDetails.text}`)
})

await page.goto(OUTER, { waitUntil: 'domcontentloaded', timeout: 30000 })

// Wait for the outer app to pick a map and pass it to the iframe.
await page.waitForFunction(
  () => {
    const f = document.querySelector('iframe[title*="Titan Reactor"]')
    return !!(f && f.getAttribute('src') && f.getAttribute('src').includes('map='))
  },
  { timeout: 20000 },
)

const iframeEl = await page.$('iframe[title*="Titan Reactor"]')
const src = await iframeEl.getAttribute('src')
console.log('iframe src:', src)

// Also attach to the current frame explicitly in case it attached before goto.
const frame = await iframeEl.contentFrame()
if (frame) {
  frame.on('console', (msg) => {
    frameLogs.push(`[titan:${msg.type()}] ${msg.text()}`)
  })
}

// Give Titan time to fetch the map, extract .chk, and boot MapScene.
await page.waitForTimeout(25000)

await page.screenshot({ path: '/tmp/titan-map-verify.png', fullPage: false })

const titanTitle = frame ? await frame.title().catch(() => null) : null
console.log('titan title:', titanTitle)

console.log('\n=== Outer logs (last 30) ===')
for (const l of outerLogs.slice(-30)) console.log(l)

console.log('\n=== Titan iframe logs (last 60) ===')
for (const l of frameLogs.slice(-60)) console.log(l)

const ok =
  !!src &&
  src.includes('map=') &&
  frameLogs.some((l) => l.includes('loading chk') || l.includes('map-ready') || (titanTitle && titanTitle !== 'Titan Reactor'))

console.log('\nPASS?', ok)
await browser.close()
process.exit(ok ? 0 : 1)
