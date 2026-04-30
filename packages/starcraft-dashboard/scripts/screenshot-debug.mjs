import { chromium } from 'playwright'
const TITAN = 'http://127.0.0.1:3344'
const MAP = encodeURI('http://127.0.0.1:8080/maps/(4)Blood Bath.scm')
const URL = `${TITAN}/?assetServerUrl=http://127.0.0.1:8080&runtime=http://127.0.0.1:8090/&plugins=http://127.0.0.1:8091/&map=${MAP}`
const browser = await chromium.launch({
  headless: true,
  args: ['--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--disable-gpu-sandbox','--use-gl=angle','--use-angle=swiftshader'],
})
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } })
const p = await ctx.newPage()
await p.goto(URL, { waitUntil: 'domcontentloaded' })
await p.waitForTimeout(35000)
console.log('=== URL ===\n', p.url())
console.log('=== title ===\n', await p.title())
const htmlSize = await p.evaluate(() => document.documentElement.outerHTML.length)
console.log('=== html size ===', htmlSize)
const headPreview = await p.evaluate(() => document.head.outerHTML.slice(0, 600))
console.log('=== head preview ===\n', headPreview)
const bodyTopHtml = await p.evaluate(() => {
  const divs = Array.from(document.body.children).map(c => ({ tag: c.tagName, id: c.id, cls: c.className }))
  return divs
})
console.log('=== body children ===\n', JSON.stringify(bodyTopHtml, null, 2))
const hermesMatch = await p.evaluate(() => document.body.innerHTML.includes('HERMES × TITAN'))
console.log('=== contains "HERMES × TITAN"? ===', hermesMatch)
await browser.close()
