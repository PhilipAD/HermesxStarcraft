#!/usr/bin/env node
'use strict'

const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const ROOT = path.join(__dirname, '..')
const OUT = path.join(ROOT, 'analysis', 'campaign-race-screen')
const ASSETS = path.join(OUT, 'assets')
const PREVIEWS = path.join(OUT, 'previews')
let assetIndex = null

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

function readLayout(name) {
  const file = path.join(ASSETS, 'SD', 'rez', `${name}.ui.json`)
  const raw = fs.readFileSync(file)
  let text = raw.subarray(0, raw.indexOf(0) === -1 ? raw.length : raw.indexOf(0)).toString('utf8').replace(/^\uFEFF/, '')
  text = text.slice(0, text.lastIndexOf('}') + 1)
  return JSON.parse(text)
}

function walk(node, visit, parent = null) {
  visit(node, parent)
  if (Array.isArray(node.children)) {
    for (const child of node.children) walk(child, visit, node)
  }
}

function assetCandidates(logicalPath) {
  const normalized = logicalPath.replace(/\\/g, '/')
  const ext = path.extname(normalized)
  const base = normalized.slice(0, normalized.length - ext.length)
  const variants = [normalized]
  if (ext.toLowerCase() === '.pcx') variants.push(`${base}.DDS`, `${base}.dds`)

  // This reconstruction is driven by SD/rez/gluCmpgn.ui.json, so resolve the
  // matching SD art before the top-level HD/remastered assets.
  return [
    ...variants.map((p) => path.join(ASSETS, 'SD', p)),
    ...variants.map((p) => path.join(ASSETS, p)),
    ...variants.map((p) => path.join(ASSETS, 'HD2', p)),
  ]
}

function findAsset(logicalPath) {
  const exact = assetCandidates(logicalPath).find((file) => fs.existsSync(file))
  if (exact) return exact

  if (!assetIndex) {
    assetIndex = new Map()
    const stack = [ASSETS]
    while (stack.length > 0) {
      const dir = stack.pop()
      for (const name of fs.readdirSync(dir)) {
        const file = path.join(dir, name)
        const stat = fs.statSync(file)
        if (stat.isDirectory()) stack.push(file)
        else assetIndex.set(file.toLowerCase(), file)
      }
    }
  }

  for (const candidate of assetCandidates(logicalPath)) {
    const matched = assetIndex.get(candidate.toLowerCase())
    if (matched) return matched
  }
  return null
}

function previewName(file) {
  return path.relative(ASSETS, file).replace(/[\\/]/g, '__').replace(/\.[^.]+$/, '.png')
}

function rel(file) {
  return path.relative(OUT, file).split(path.sep).join('/')
}

function makePreview(file) {
  const ext = path.extname(file).toLowerCase()
  if (!['.dds', '.pcx'].includes(ext)) return rel(file)
  const dest = path.join(PREVIEWS, previewName(file))
  ensureDir(path.dirname(dest))
  if (!fs.existsSync(dest)) execFileSync('convert', [file, dest], { stdio: ['ignore', 'pipe', 'pipe'] })
  return rel(dest)
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function styleRect(rect) {
  const [x, y, w, h] = rect
  const size = w > 0 && h > 0 ? `width:${w}px;height:${h}px;` : ''
  return `left:${x}px;top:${y}px;${size}`
}

function raceFromFlcs(flcs) {
  const raceFlc = flcs.find((item) => /\\(Prot|Terr|Zerg)\.webm$/i.test(item.content))
  return raceFlc ? raceFlc.content.match(/\\(Prot|Terr|Zerg)\.webm$/i)[1].toLowerCase() : null
}

function renderMedia(tag, logicalPath, rect, extraClass = '') {
  const asset = findAsset(logicalPath)
  if (!asset) return `<div class="missing" style="${styleRect(rect)}">missing ${escapeHtml(logicalPath)}</div>`
  const ext = path.extname(asset).toLowerCase()
  const src = ext === '.webm' ? rel(asset) : makePreview(asset)
  if (ext === '.webm') {
    return `<video class="${extraClass}" style="${styleRect(rect)}" src="${escapeHtml(src)}" autoplay muted loop playsinline></video>`
  }
  return `<img class="${extraClass}" style="${styleRect(rect)}" src="${escapeHtml(src)}" alt="${escapeHtml(logicalPath)}">`
}

function findRaceButtons(layout) {
  const races = {}
  for (const child of layout.children) {
    if (child.type !== 'FLCBTN' || !Array.isArray(child.children)) continue
    const flcs = child.children.filter((item) => item.type === 'FLC')
    const race = raceFromFlcs(flcs)
    if (!race) continue
    races[race] = { button: child, flcs }
  }
  return races
}

function renderRaceSlot(race, rect, flcs) {
  const videos = flcs
    .filter((item) => !(item.flags && item.flags.includes('RC_FLC_HD')))
    .map((flc) => {
      const isHover = /On\.webm$/i.test(flc.content)
      const isModel = new RegExp(`\\\\${race === 'prot' ? 'Prot' : race === 'terr' ? 'Terr' : 'Zerg'}\\.webm$`, 'i').test(flc.content)
      return renderMedia('video', flc.content, flc.rect, `${isHover ? 'hover-video' : 'race-video'}${isModel ? ' model-video' : ''}`)
    })
    .join('\n')
  return `<div class="race-slot race-${race}" data-race="${race}" style="${styleRect(rect)}">
${videos}
</div>`
}

function renderStaticRects(layout) {
  return layout.children
    .filter((child) => child.type === 'RECT')
    .map((child) => renderMedia('img', child.content, child.rect, 'static-panel'))
    .join('\n')
}

function renderCanonical(layout) {
  const pieces = [renderStaticRects(layout)]
  for (const child of layout.children) {
    if (child.type === 'FLCBTN' && Array.isArray(child.children)) {
      const flcs = child.children.filter((item) => item.type === 'FLC')
      const race = raceFromFlcs(flcs)
      if (race) pieces.push(renderRaceSlot(race, child.rect, flcs))
    }
  }
  return pieces.join('\n')
}

function renderRequested(layout) {
  const races = findRaceButtons(layout)
  const targetRects = {
    prot: [5, 7, 238, 364],
    terr: [162, 4, 356, 278],
    zerg: [391, 41, 220, 330],
  }

  const racePieces = Object.entries(targetRects)
    .map(([race, target]) => {
      const original = races[race]
      if (!original) return ''
      const [x, y, w, h] = target
      const label = race === 'prot' ? 'PROTOSS' : race === 'terr' ? 'TERRAN' : 'ZERG'
      const centerX = x + w / 2
      const top = Math.min(y + h - 30, 444)
      const labelOffset = race === 'terr' ? 36 : 0
      return `${renderRaceSlot(race, target, original.flcs)}<div class="race-label" data-label-for="${race}" data-label-x-offset="${labelOffset}" style="left:${centerX + labelOffset}px;top:${top}px">${label}</div>`
    })
    .join('\n')

  return racePieces
}

function summarize(layout) {
  const races = findRaceButtons(layout)
  return Object.entries(races).map(([race, entry]) => ({
    race,
    buttonRect: entry.button.rect,
    videos: entry.flcs.map((flc) => ({
      content: flc.content,
      rect: flc.rect,
      flags: flc.flags || [],
      extracted: Boolean(findAsset(flc.content)),
    })),
  }))
}

function main() {
  ensureDir(PREVIEWS)
  const layout = readLayout('gluCmpgn')
  const expansionLayout = readLayout('gluExpCmpgn')
  const rects = layout.children.filter((child) => child.type === 'RECT')
  for (const rect of rects) {
    const asset = findAsset(rect.content)
    if (asset) makePreview(asset)
  }

  const report = {
    generatedAt: new Date().toISOString(),
    sourceLayout: 'SD\\rez\\gluCmpgn.ui.json',
    note: 'Canonical StarCraft Remastered campaign layout is Zerg left, Terran center, Protoss right. The second stage reorders extracted assets to Protoss left, Terran center, Zerg right for the requested iframe concept.',
    canonicalRaceButtons: summarize(layout),
    expansionRaceButtons: summarize(expansionLayout),
  }

  fs.writeFileSync(path.join(OUT, 'campaign-race-report.json'), JSON.stringify(report, null, 2))
  fs.writeFileSync(
    path.join(OUT, 'README.md'),
    `# Campaign Race Screen Extraction\n\nThe extracted layout is \`SD\\\\rez\\\\gluCmpgn.ui.json\`.\n\n- Canonical base campaign positions: Zerg left, Terran center, Protoss right.\n- Requested iframe concept positions: Protoss left, Terran center, Zerg right.\n- Animated race panels are WebM assets in \`glue\\\\campaign\`.\n- Static UI/background panels are DDS/PCX assets under \`glue\\\\palcs\` and \`glue\\\\campaign\`.\n\nOpen \`index.html\` to view the reconstruction.\n`
  )

  fs.writeFileSync(
    path.join(OUT, 'index.html'),
    `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>StarCraft Remastered Campaign Race Screen Reconstruction</title>
  <style>
    :root { color-scheme: dark; font-family: Arial, sans-serif; background:#050505; color:#d9f2ff; }
    body { margin:0; min-height:100vh; padding:24px; box-sizing:border-box; background:radial-gradient(circle at 50% 0%, #172333, #050505 55%); }
    h1 { margin:0 0 8px; font-size:24px; }
    p { max-width:980px; margin-left:auto; margin-right:auto; color:#a8bfca; line-height:1.45; }
    h1 { text-align:center; }
    .grid { display:grid; gap:24px; grid-template-columns:repeat(auto-fit, minmax(680px, 1fr)); align-items:start; max-width:1440px; margin:0 auto; }
    .card { border:0; border-radius:12px; background:rgba(0,0,0,.55); padding:16px; box-shadow:0 10px 40px rgba(0,0,0,.45); }
    .stage-wrap { overflow:auto; padding:12px; background:#020407; border-radius:8px; border:0; display:flex; justify-content:center; }
    .stage { position:relative; flex:0 0 auto; width:640px; height:480px; overflow:hidden; background:#000; transform-origin:top left; margin:0 auto; }
    .stage img, .stage video { position:absolute; display:block; max-width:none; }
    .static-panel { object-fit:fill; }
    .race-slot { position:absolute; z-index:10; overflow:visible; cursor:pointer; }
    .race-slot::after { content:attr(data-race); position:absolute; inset:0; border:1px solid transparent; pointer-events:none; color:transparent; }
    .race-slot:hover::after { border-color:rgba(135,226,255,.35); box-shadow:0 0 24px rgba(0,172,255,.24) inset; }
    .race-slot video { left:0; top:0; pointer-events:none; }
    .race-video { z-index:10; }
    .hover-video { z-index:11; opacity:0; transition:opacity .18s ease; }
    .race-slot:hover .hover-video { opacity:.86; }
    .race-label { position:absolute; z-index:30; width:180px; height:28px; margin-left:-90px; line-height:28px; text-align:center; color:#d9f2ff; text-shadow:0 0 8px #00aaff, 0 2px 6px #000; font-weight:bold; letter-spacing:.08em; pointer-events:none; white-space:nowrap; overflow:visible; }
    .missing { position:absolute; color:#ff958f; border:1px dashed #ff958f; font-size:11px; padding:4px; box-sizing:border-box; z-index:50; }
    code { color:#8de7ff; }
  </style>
</head>
<body>
  <h1>Campaign Race Screen Reconstruction</h1>
  <p>
    Extracted from <code>SD\\rez\\gluCmpgn.ui.json</code> and <code>glue\\campaign</code>.
    The canonical game layout is shown first. The second view uses the same extracted assets but reorders them to the requested
    <b>Protoss left, Terran middle, Zerg right</b> iframe concept.
  </p>
  <div class="grid">
    <section class="card">
      <h2>Canonical Extracted Layout</h2>
      <div class="stage-wrap"><div class="stage" data-stage="canonical">
${renderCanonical(layout)}
      </div></div>
    </section>
    <section class="card">
      <h2>Requested Iframe Concept Layout</h2>
      <div class="stage-wrap"><div class="stage" data-stage="concept">
${renderRequested(layout)}
      </div></div>
    </section>
  </div>
  <script>
    function centerConceptLabels() {
      const concept = document.querySelector('[data-stage="concept"]');
      if (!concept) return;
      for (const label of concept.querySelectorAll('.race-label')) {
        const race = label.dataset.labelFor;
        const slot = concept.querySelector('.race-slot[data-race="' + race + '"]');
        const model = slot && slot.querySelector('.model-video');
        if (!slot || !model) continue;
        const modelWidth = model.videoWidth || model.offsetWidth;
        const modelHeight = model.videoHeight || model.offsetHeight;
        if (!modelWidth || !modelHeight) continue;
        const offset = Number(label.dataset.labelXOffset || 0);
        const centerX = slot.offsetLeft + model.offsetLeft + modelWidth / 2 + offset;
        const top = Math.min(slot.offsetTop + model.offsetTop + modelHeight + 8, 444);
        label.style.left = centerX + 'px';
        label.style.top = top + 'px';
      }
    }
    window.addEventListener('load', centerConceptLabels);
    window.addEventListener('resize', centerConceptLabels);
    for (const video of document.querySelectorAll('.model-video')) {
      video.addEventListener('loadedmetadata', centerConceptLabels);
    }
  </script>
</body>
</html>
`
  )

  console.log(JSON.stringify({ out: OUT, html: path.join(OUT, 'index.html'), races: report.canonicalRaceButtons }, null, 2))
}

main()
