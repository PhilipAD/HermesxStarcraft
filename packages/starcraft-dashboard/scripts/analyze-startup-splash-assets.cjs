#!/usr/bin/env node
'use strict'

const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const ROOT = path.join(__dirname, '..')
const ASSET_ROOT = path.join(ROOT, 'analysis', 'remastered-target-assets')
const OUT = path.join(ROOT, 'analysis', 'startup-splash-viewer')
const PREVIEWS = path.join(OUT, 'previews')

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

function readU32(buf, off) {
  return buf.readUInt32LE(off)
}

function fourCC(n) {
  return String.fromCharCode(n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >> 24) & 0xff).replace(/\0+$/, '')
}

function parseDds(file) {
  const fd = fs.openSync(file, 'r')
  const buf = Buffer.alloc(160)
  fs.readSync(fd, buf, 0, buf.length, 0)
  fs.closeSync(fd)
  if (buf.toString('ascii', 0, 4) !== 'DDS ') return null

  const height = readU32(buf, 12)
  const width = readU32(buf, 16)
  const mipMapCount = readU32(buf, 28)
  const pfFlags = readU32(buf, 80)
  const four = fourCC(readU32(buf, 84))
  let format = four || 'uncompressed'
  let dxgiFormat = null
  let resourceDimension = null
  if (four === 'DX10') {
    dxgiFormat = readU32(buf, 128)
    resourceDimension = readU32(buf, 132)
    format = `DX10/DXGI_${dxgiFormat}`
  }

  return { container: 'DDS', width, height, mipMapCount, pfFlags, fourCC: four || null, format, dxgiFormat, resourceDimension }
}

function parsePcx(file) {
  const fd = fs.openSync(file, 'r')
  const buf = Buffer.alloc(128)
  fs.readSync(fd, buf, 0, buf.length, 0)
  fs.closeSync(fd)
  if (buf[0] !== 0x0a) return null
  const xMin = buf.readUInt16LE(4)
  const yMin = buf.readUInt16LE(6)
  const xMax = buf.readUInt16LE(8)
  const yMax = buf.readUInt16LE(10)
  return {
    container: 'PCX',
    version: buf[1],
    encoding: buf[2] === 1 ? 'RLE' : `unknown-${buf[2]}`,
    bitsPerPixel: buf[3],
    width: xMax - xMin + 1,
    height: yMax - yMin + 1,
    planes: buf[65],
    bytesPerLine: buf.readUInt16LE(66),
  }
}

function classify(logicalPath) {
  const p = logicalPath.replace(/\\/g, '/').toLowerCase()
  if (p.includes('/title/title')) return 'startup title splash/background'
  if (p.includes('/title/')) return 'startup title legal/rating/font overlay'
  if (p.includes('/mainmenu/titleframe_bg')) return 'main menu frame background'
  if (p.includes('/mainmenu/titleframe_overlay')) return 'main menu frame overlay'
  if (p.includes('/mainmenu/pintro')) return 'main menu intro button'
  if (p.includes('/mainmenu/pcredit')) return 'main menu credits button'
  if (p.includes('/mainmenu/etail')) return 'main menu decorative tail/detail'
  if (p.includes('/mainmenu/lock')) return 'main menu locked/disabled icon'
  return 'startup/main-menu UI component'
}

function previewName(outPath) {
  return outPath.replace(/[\\/]/g, '__').replace(/\.[^.]+$/, '.png')
}

function makePreview(src, dest) {
  ensureDir(path.dirname(dest))
  execFileSync('convert', [src, dest], { stdio: ['ignore', 'pipe', 'pipe'] })
}

function rel(p) {
  return path.relative(OUT, p).split(path.sep).join('/')
}

function main() {
  ensureDir(PREVIEWS)
  const manifest = JSON.parse(fs.readFileSync(path.join(ASSET_ROOT, 'manifest.json'), 'utf8'))
  const startup = manifest.extracted.filter((e) => e.group === 'startupSplash')
  const rows = []

  for (const entry of startup) {
    const src = path.join(ASSET_ROOT, entry.outPath)
    const ext = path.extname(src).toLowerCase()
    const meta = ext === '.dds' ? parseDds(src) : ext === '.pcx' ? parsePcx(src) : null
    const png = path.join(PREVIEWS, previewName(entry.outPath))
    let view = null
    let convertError = null
    try {
      makePreview(src, png)
      view = rel(png)
    } catch (e) {
      convertError = e.stderr ? String(e.stderr) : e.message
    }
    rows.push({
      logicalPath: entry.logicalPath,
      extractedPath: entry.outPath,
      size: entry.size,
      sha256: entry.sha256,
      role: classify(entry.logicalPath),
      metadata: meta,
      preview: view,
      viewCommand: view ? `xdg-open ${path.join(OUT, view)}` : null,
      convertError,
    })
  }

  fs.writeFileSync(path.join(OUT, 'startup-splash-analysis.json'), JSON.stringify({ generatedAt: new Date().toISOString(), count: rows.length, rows }, null, 2))
  fs.writeFileSync(path.join(OUT, 'startup-splash-summary.md'), renderMarkdown(rows))
  fs.writeFileSync(path.join(OUT, 'index.html'), renderHtml(rows))
  console.log(JSON.stringify({ outDir: OUT, count: rows.length, previews: rows.filter((r) => r.preview).length, failures: rows.filter((r) => r.convertError).length }, null, 2))
}

function renderMarkdown(rows) {
  return [
    '# Startup Splash Asset Analysis',
    '',
    `Generated ${new Date().toISOString()}.`,
    '',
    'Open `index.html` in this directory to view converted previews.',
    '',
    ...rows.map((r) => {
      const m = r.metadata || {}
      return [
        `## ${r.logicalPath}`,
        '',
        `- Role: ${r.role}`,
        `- Extracted: \`${r.extractedPath}\``,
        `- Format: ${m.container || 'unknown'} ${m.width ? `${m.width}x${m.height}` : ''} ${m.format || ''}`.trim(),
        `- Preview: ${r.preview ? `\`${r.preview}\`` : `conversion failed: ${r.convertError}`}`,
        '',
      ].join('\n')
    }),
  ].join('\n')
}

function renderHtml(rows) {
  const cards = rows.map((r) => {
    const m = r.metadata || {}
    return `<section class="card">
      <h2>${escapeHtml(r.logicalPath)}</h2>
      <p><b>Role:</b> ${escapeHtml(r.role)}</p>
      <p><b>Format:</b> ${escapeHtml(`${m.container || 'unknown'} ${m.width ? `${m.width}x${m.height}` : ''} ${m.format || ''}`)}</p>
      <p><b>Extracted:</b> <code>${escapeHtml(r.extractedPath)}</code></p>
      ${r.preview ? `<a href="${escapeHtml(r.preview)}"><img src="${escapeHtml(r.preview)}" loading="lazy"></a>` : `<pre>${escapeHtml(r.convertError || 'No preview')}</pre>`}
    </section>`
  }).join('\n')
  return `<!doctype html>
<meta charset="utf-8">
<title>StarCraft Remastered Startup Splash Assets</title>
<style>
body{font:14px system-ui,sans-serif;background:#111;color:#eee;margin:24px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:16px}
.card{background:#1b1b1b;border:1px solid #333;border-radius:10px;padding:14px}
img{max-width:100%;background:#000;border:1px solid #444}
code{word-break:break-all}
</style>
<h1>StarCraft Remastered Startup Splash Assets</h1>
<p>${rows.length} assets. Click previews for full PNGs.</p>
<div class="grid">${cards}</div>`
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

main()
