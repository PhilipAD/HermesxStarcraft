// Bypass the Hermes outer app and hit Titan Reactor directly on port 3344
// with ?map=<url>. Lets us see titan's own console without iframe confusion.
import { chromium } from 'playwright'

const TITAN = 'http://127.0.0.1:3344'
const MAP = encodeURI('http://127.0.0.1:8080/maps/(4)Blood Bath.scm')
const URL =
  `${TITAN}/?assetServerUrl=http://127.0.0.1:8080` +
  `&runtime=http://127.0.0.1:8090/&plugins=http://127.0.0.1:8091/` +
  `&map=${MAP}`

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

const logs = []
page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`))
page.on('pageerror', (err) => logs.push(`[pageerror] ${err.stack || err.message}`))
page.on('requestfailed', (req) =>
  logs.push(`[reqfail] ${req.method()} ${req.url()} ${req.failure()?.errorText}`),
)

console.log('URL:', URL)
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 })

// Give Titan enough time to boot, fetch, downgrade, and start MapScene / OpenBW.
await page.waitForTimeout(30000)

await page.screenshot({ path: '/tmp/titan-direct.png', fullPage: false })
const title = await page.title()
console.log('title:', title)

console.log('\n=== logs (last 120) ===')
for (const l of logs.slice(-120)) console.log(l)

console.log(
  '\nmap-related hits:',
  logs.filter(
    (l) => /loading chk|map-ready|MapScene|loadMap|scm-extractor|openbw|queue-files|bootup/i.test(l),
  ).length,
)
await browser.close()
