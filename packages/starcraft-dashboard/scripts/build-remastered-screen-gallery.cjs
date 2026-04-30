#!/usr/bin/env node
'use strict'

const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const casclib = require('bw-casclib')

const ROOT = path.join(__dirname, '..')
const GAME_ROOT = process.env.SCR_ROOT || '/home/rdpuser/Games/battlenet/drive_c/Program Files (x86)/StarCraft'
const OUT = path.join(ROOT, 'analysis', 'remastered-screen-gallery')
const ASSETS = path.join(OUT, 'assets')
const PREVIEWS = path.join(OUT, 'previews')

const IMAGE_EXTS = new Set(['.dds', '.pcx', '.png', '.jpg', '.jpeg', '.webp'])
const MEDIA_EXTS = new Set([...IMAGE_EXTS, '.webm'])
const MAX_IMAGE_BYTES = 30 * 1024 * 1024

let assetIndex = null

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

function safePath(logicalPath) {
  return path.join(ASSETS, ...logicalPath.replace(/\\/g, '/').split('/').filter((part) => part && part !== '..'))
}

function rel(file) {
  return path.relative(OUT, file).split(path.sep).join('/')
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function readUiJson(buf) {
  const end = buf.indexOf(0)
  let text = buf.subarray(0, end === -1 ? buf.length : end).toString('utf8').replace(/^\uFEFF/, '')
  text = firstJsonObject(text)
  return JSON.parse(text)
}

function firstJsonObject(text) {
  let depth = 0
  let inString = false
  let escaped = false
  let started = false

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    if (!started) {
      if (ch === '{') {
        started = true
        depth = 1
      }
      continue
    }

    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }

    if (ch === '"') inString = true
    else if (ch === '{') depth += 1
    else if (ch === '}') {
      depth -= 1
      if (depth === 0) return text.slice(text.indexOf('{'), i + 1)
    }
  }

  return text.slice(0, text.lastIndexOf('}') + 1)
}

function walk(node, visit, offset = [0, 0]) {
  visit(node, offset)
  if (!Array.isArray(node.children)) return
  const nextOffset = node.rect ? [offset[0] + node.rect[0], offset[1] + node.rect[1]] : offset
  for (const child of node.children) walk(child, visit, nextOffset)
}

function extractFile(handle, logicalPath, extracted) {
  const dest = safePath(logicalPath)
  if (fs.existsSync(dest)) return dest
  const buf = Buffer.from(casclib.readFileSync(handle, logicalPath))
  ensureDir(path.dirname(dest))
  fs.writeFileSync(dest, buf)
  extracted.push({ logicalPath, outPath: rel(dest), size: buf.length })
  return dest
}

function buildAssetIndex() {
  assetIndex = new Map()
  const stack = [ASSETS]
  while (stack.length > 0) {
    const dir = stack.pop()
    if (!fs.existsSync(dir)) continue
    for (const name of fs.readdirSync(dir)) {
      const file = path.join(dir, name)
      const stat = fs.statSync(file)
      if (stat.isDirectory()) stack.push(file)
      else assetIndex.set(file.toLowerCase(), file)
    }
  }
}

function candidateLogicalPaths(logicalPath) {
  const normalized = logicalPath.replace(/\\/g, '/')
  const ext = path.extname(normalized)
  const base = normalized.slice(0, normalized.length - ext.length)
  const variants = [normalized]
  if (ext.toLowerCase() === '.pcx') variants.push(`${base}.DDS`, `${base}.dds`)
  return [
    ...variants.map((p) => `SD/${p}`),
    ...variants,
    ...variants.map((p) => `HD2/${p}`),
  ].map((p) => p.replace(/\//g, '\\'))
}

function findLocalAsset(logicalPath) {
  if (!assetIndex) buildAssetIndex()
  for (const candidate of candidateLogicalPaths(logicalPath)) {
    const file = safePath(candidate)
    const exact = assetIndex.get(file.toLowerCase())
    if (exact) return exact
  }
  return null
}

function extractBestAsset(handle, logicalPath, extracted, missing) {
  for (const candidate of candidateLogicalPaths(logicalPath)) {
    try {
      return extractFile(handle, candidate, extracted)
    } catch {
      // Try the next SD/top-level/HD spelling.
    }
  }
  missing.add(logicalPath)
  return null
}

function previewName(file) {
  return path.relative(ASSETS, file).replace(/[\\/]/g, '__').replace(/\.[^.]+$/, '.png')
}

function makePreview(file) {
  const ext = path.extname(file).toLowerCase()
  if (!IMAGE_EXTS.has(ext)) return null
  if (['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) return rel(file)
  if (fs.statSync(file).size > MAX_IMAGE_BYTES) return null
  const dest = path.join(PREVIEWS, previewName(file))
  ensureDir(path.dirname(dest))
  if (!fs.existsSync(dest)) execFileSync('convert', [file, dest], { stdio: ['ignore', 'pipe', 'pipe'] })
  return rel(dest)
}

function styleRect(rect, offset) {
  const [x, y, w, h] = rect || [0, 0, 0, 0]
  const size = w > 0 && h > 0 ? `width:${w}px;height:${h}px;` : ''
  return `left:${offset[0] + x}px;top:${offset[1] + y}px;${size}`
}

function renderNode(node, offset) {
  if (!node.content || !node.rect) return ''
  const ext = path.extname(node.content).toLowerCase()
  if (!MEDIA_EXTS.has(ext)) return ''
  const file = findLocalAsset(node.content)
  if (!file) return ''
  if (ext === '.webm') {
    return `<video style="${styleRect(node.rect, offset)}" src="${escapeHtml(rel(file))}" autoplay muted loop playsinline></video>`
  }
  try {
    const preview = makePreview(file)
    if (!preview) return ''
    return `<img style="${styleRect(node.rect, offset)}" src="${escapeHtml(preview)}" alt="${escapeHtml(node.content)}">`
  } catch {
    return ''
  }
}

function screenCard(screen) {
  const rootRect = screen.layout.rect || [0, 0, 640, 480]
  const width = rootRect[2] || 640
  const height = rootRect[3] || 480
  const pieces = []
  walk(screen.layout, (node, offset) => {
    if (node === screen.layout) return
    const rendered = renderNode(node, offset)
    if (rendered) pieces.push(rendered)
  })

  return `<article class="screen-card" id="${escapeHtml(screen.id)}">
  <h3>${escapeHtml(screen.layout.name || screen.id)}</h3>
  <p><code>${escapeHtml(screen.logicalPath)}</code></p>
  <div class="stage-wrap"><div class="stage" style="width:${width}px;height:${height}px">
${pieces.join('\n')}
  </div></div>
</article>`
}

function imageCard(entry) {
  return `<article class="image-card">
  ${entry.preview ? `<img src="${escapeHtml(entry.preview)}" alt="${escapeHtml(entry.logicalPath)}" loading="lazy">` : '<div class="no-preview">no preview</div>'}
  <p><code>${escapeHtml(entry.logicalPath)}</code></p>
</article>`
}

function main() {
  ensureDir(ASSETS)
  ensureDir(PREVIEWS)
  const handle = casclib.openStorageSync(GAME_ROOT)
  const extracted = []
  const missing = new Set()
  const screens = []
  const assetRefs = new Set()
  const errors = []

  try {
    const uiFiles = casclib.findFilesSync(handle, 'SD\\rez\\*.ui.json').map((item) => item.fullName || String(item)).sort()
    for (const logicalPath of uiFiles) {
      try {
        const file = extractFile(handle, logicalPath, extracted)
        const layout = readUiJson(fs.readFileSync(file))
        walk(layout, (node) => {
          if (!node.content || typeof node.content !== 'string') return
          const ext = path.extname(node.content).toLowerCase()
          if (MEDIA_EXTS.has(ext)) assetRefs.add(node.content)
        })
        screens.push({ id: path.basename(logicalPath).replace(/[^a-z0-9_-]+/gi, '-'), logicalPath, layout })
      } catch (e) {
        errors.push({ logicalPath, error: e.message })
      }
    }

    const glueMedia = casclib
      .findFilesSync(handle, 'SD\\glue\\*')
      .map((item) => item.fullName || String(item))
      .filter((logicalPath) => IMAGE_EXTS.has(path.extname(logicalPath).toLowerCase()))
      .sort()
    for (const logicalPath of glueMedia) assetRefs.add(logicalPath)

    for (const logicalPath of [...assetRefs].sort()) {
      extractBestAsset(handle, logicalPath, extracted, missing)
    }
  } finally {
    casclib.closeStorage(handle)
  }

  buildAssetIndex()

  const images = [...assetIndex.values()]
    .filter((file) => IMAGE_EXTS.has(path.extname(file).toLowerCase()))
    .map((file) => {
      let preview = null
      try {
        preview = makePreview(file)
      } catch (e) {
        errors.push({ logicalPath: rel(file), error: e.message })
      }
      return {
        logicalPath: path.relative(ASSETS, file).split(path.sep).join('\\'),
        file,
        preview,
      }
    })
    .sort((a, b) => a.logicalPath.localeCompare(b.logicalPath))

  const report = {
    generatedAt: new Date().toISOString(),
    gameRoot: GAME_ROOT,
    screenCount: screens.length,
    imageCount: images.length,
    extractedCount: extracted.length,
    missing: [...missing].sort(),
    errors,
  }
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify({ ...report, extracted }, null, 2))

  fs.writeFileSync(
    path.join(OUT, 'index.html'),
    `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>StarCraft Remastered Screen Gallery</title>
  <style>
    :root { color-scheme: dark; font-family: Arial, sans-serif; background:#05070a; color:#dff6ff; }
    body { margin:0; padding:24px; background:radial-gradient(circle at top, #17273a, #05070a 520px); }
    header { max-width:1280px; margin:0 auto 24px; }
    h1 { margin:0 0 8px; }
    p { color:#a9bfca; line-height:1.45; }
    code { color:#8de7ff; }
    .summary { display:flex; gap:12px; flex-wrap:wrap; margin-top:12px; }
    .pill { border:1px solid rgba(141,231,255,.25); border-radius:999px; padding:6px 10px; background:rgba(0,0,0,.35); }
    .screens { display:grid; grid-template-columns:repeat(auto-fit, minmax(360px, 1fr)); gap:18px; max-width:1600px; margin:0 auto 32px; }
    .screen-card, .image-card { background:rgba(0,0,0,.45); border-radius:10px; padding:12px; box-shadow:0 12px 35px rgba(0,0,0,.35); }
    .screen-card h3 { margin:0 0 4px; font-size:16px; }
    .screen-card p, .image-card p { margin:6px 0 0; font-size:11px; overflow-wrap:anywhere; }
    .stage-wrap { display:flex; justify-content:center; overflow:auto; background:#000; border-radius:8px; padding:8px; }
    .stage { position:relative; flex:0 0 auto; overflow:hidden; background:#000; transform:scale(.52); transform-origin:top left; margin-right:-307px; margin-bottom:-230px; }
    .stage img, .stage video { position:absolute; display:block; max-width:none; }
    .images { display:grid; grid-template-columns:repeat(auto-fill, minmax(160px, 1fr)); gap:12px; max-width:1600px; margin:0 auto; }
    .image-card img { width:100%; max-height:140px; object-fit:contain; background:#000; border-radius:6px; }
    .no-preview { display:grid; place-items:center; height:120px; background:#111; color:#789; border-radius:6px; }
  </style>
</head>
<body>
  <header>
    <h1>StarCraft Remastered Screen Gallery</h1>
    <p>Generated from the SD UI layout layer. Each screen card overlays extracted image/video controls using the UI JSON rectangles, followed by a catalog of discovered SD glue images.</p>
    <div class="summary">
      <span class="pill">${screens.length} screens</span>
      <span class="pill">${images.length} images</span>
      <span class="pill">${errors.length} conversion/parse notes</span>
      <span class="pill">${missing.size} missing refs</span>
    </div>
  </header>
  <section class="screens">
${screens.map(screenCard).join('\n')}
  </section>
  <header><h2>Image Catalog</h2></header>
  <section class="images">
${images.map(imageCard).join('\n')}
  </section>
</body>
</html>
`
  )

  console.log(JSON.stringify(report, null, 2))
}

main()
