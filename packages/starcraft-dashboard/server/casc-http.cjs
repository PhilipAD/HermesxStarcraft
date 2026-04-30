'use strict'

/**
 * Native CASC file server (Linux-friendly). Uses bw-casclib like alexpineda/cascbridge,
 * without Electron/Wine. Requires a Node build where bw-casclib native addon loads
 * (Ubuntu: often /usr/bin/node 18+). If `node` crashes with SIGSEGV, run:
 *   CASCLIB_NODE=/usr/bin/node node server/casc-http.cjs
 * Rebuild after npm install on Linux:
 *   npm run rebuild:casclib
 *
 * Disk overlays (optional): set CASC_OVERLAY_DIRS to a comma-separated list
 * of directories. Files under each path mirror CASC layout (e.g.
 * arr/unitname.tbl) and override archive reads — same idea as cascbridge
 * setStorageIsDisk, but composable.
 */

const fs = require('fs')
const path = require('path')
const os = require('os')
const { execFileSync } = require('child_process')
const express = require('express')
const casclib = require('bw-casclib')

function readScRootFromInstallFile(installPath) {
  if (!fs.existsSync(installPath)) return null
  const text = fs.readFileSync(installPath, 'utf8')
  for (const line of text.split('\n')) {
    const m = line.match(/^SC_ROOT=(.*)/)
    if (m) return m[1].trim()
  }
  return null
}

function resolveScRoot() {
  if (process.env.SC_ROOT) return process.env.SC_ROOT
  const here = __dirname
  const installPath = path.join(here, '..', 'starcraft-install.path')
  return readScRootFromInstallFile(installPath)
}

const PORT = Number(process.env.CASC_PORT || 8080)
const scRoot = resolveScRoot()

if (!scRoot || !fs.existsSync(scRoot)) {
  console.error('[casc-http] Missing StarCraft root. Set SC_ROOT or create starcraft-install.path with SC_ROOT=...')
  process.exit(1)
}

/**
 * Disk overlays (cascbridge-style setStorageIsDisk): comma-separated absolute
 * roots under which relative CASC paths are tried before the archive.
 * First match wins. Example:
 *   CASC_OVERLAY_DIRS=/home/me/.hermes/mods/hermes-brand,/home/me/.hermes/mods/hud-skin
 */
function parseOverlayDirs() {
  const raw = process.env.CASC_OVERLAY_DIRS || process.env.CASC_DISK_OVERLAY || ''
  const parts = raw
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean)
  const out = []
  for (const p of parts) {
    try {
      if (fs.existsSync(p) && fs.statSync(p).isDirectory()) out.push(path.resolve(p))
    } catch (_) {}
  }
  return out
}

const overlayRoots = parseOverlayDirs()
if (overlayRoots.length) {
  console.log('[casc-http] CASC disk overlay(s):', overlayRoots.join(' | '))
}

let storageHandle = null
function getStorage() {
  if (!storageHandle) {
    storageHandle = casclib.openStorageSync(scRoot)
    console.log('[casc-http] Opened CASC storage:', scRoot)
  }
  return storageHandle
}

function isSafeCascRel(rel) {
  if (!rel || rel.includes('..') || rel.startsWith('/') || rel.startsWith('\\')) return false
  return true
}

/**
 * Read a CASC-relative path: try each overlay root on disk, then CASC.
 * Returns raw bytes (Uint8Array or Buffer-like).
 */
function readCascWithOverlay(rel) {
  if (!isSafeCascRel(rel)) throw new Error('invalid path')
  const norm = rel.replace(/\\/g, '/')
  for (const root of overlayRoots) {
    const full = path.join(root, norm)
    if (!full.startsWith(root)) continue
    try {
      if (fs.existsSync(full) && fs.statSync(full).isFile()) {
        return fs.readFileSync(full)
      }
    } catch (_) {}
  }
  return casclib.readFileSync(getStorage(), rel)
}

const IMMUTABLE_CACHE = 'public, max-age=31536000, immutable'

const app = express()

app.use((_, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Content-Range, Range, Accept, Origin'
  )
  res.setHeader(
    'Access-Control-Expose-Headers',
    'Content-Length, Content-Range, Accept-Ranges, Content-Type, Content-Disposition, Cache-Control'
  )
  next()
})

app.options('*', (_req, res) => {
  res.sendStatus(204)
})

function cascPathFromUrl(reqPath) {
  let rel = reqPath.startsWith('/') ? reqPath.slice(1) : reqPath
  rel = decodeURIComponent(rel)
  return rel.replace(/\//g, '/')
}

function ddsBufferToPngBuffer(ddsBuffer) {
  const dir = os.tmpdir()
  const id = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`
  const infile = path.join(dir, `casc-in-${id}.dds`)
  const outfile = path.join(dir, `casc-out-${id}.png`)
  try {
    fs.writeFileSync(infile, ddsBuffer)
    execFileSync('convert', [infile, outfile], { stdio: ['ignore', 'pipe', 'pipe'] })
    return fs.readFileSync(outfile)
  } finally {
    try {
      fs.unlinkSync(infile)
    } catch (_) {}
    try {
      fs.unlinkSync(outfile)
    } catch (_) {}
  }
}

// ─── Map file endpoints (files live on disk in SC_ROOT/Maps, NOT inside CASC) ───
function listMapFilesRecursive(dir, baseLen, acc) {
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return acc
  }
  for (const e of entries) {
    if (e.name.startsWith('.')) continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) {
      listMapFilesRecursive(p, baseLen, acc)
    } else {
      const lower = e.name.toLowerCase()
      if (lower.endsWith('.scm') || lower.endsWith('.scx') || lower.endsWith('.rep')) {
        let size = 0
        try {
          size = fs.statSync(p).size
        } catch {}
        acc.push({
          path: p.slice(baseLen + 1).split(path.sep).join('/'),
          size,
          name: e.name,
        })
      }
    }
  }
  return acc
}

app.get('/maps-list', (_req, res) => {
  try {
    const mapsRoot = path.join(scRoot, 'Maps')
    if (!fs.existsSync(mapsRoot)) {
      res.status(404).json({ error: 'Maps dir not found', scRoot })
      return
    }
    const all = listMapFilesRecursive(mapsRoot, mapsRoot.length, [])
    all.sort((a, b) => a.path.localeCompare(b.path))
    res.json({
      scRoot,
      mapsRoot,
      count: all.length,
      files: all.slice(0, 2000),
    })
  } catch (e) {
    res.status(500).json({ error: String(e && e.message) })
  }
})

app.get(/^\/maps\/(.+)$/, (req, res) => {
  try {
    const rel = decodeURIComponent(req.params[0] || '')
    if (!rel || rel.includes('..') || rel.startsWith('/')) {
      res.sendStatus(400)
      return
    }
    const full = path.join(scRoot, 'Maps', rel)
    if (!fs.existsSync(full) || !fs.statSync(full).isFile()) {
      res.sendStatus(404)
      return
    }
    const lower = full.toLowerCase()
    if (lower.endsWith('.scm') || lower.endsWith('.scx')) {
      res.setHeader('Content-Type', 'application/x-starcraft-map')
    } else if (lower.endsWith('.rep')) {
      res.setHeader('Content-Type', 'application/x-starcraft-replay')
    } else {
      res.setHeader('Content-Type', 'application/octet-stream')
    }
    res.setHeader('Cache-Control', 'public, max-age=120')
    res.sendFile(full)
  } catch (e) {
    console.error('[casc-http] /maps error', e && e.message)
    res.sendStatus(500)
  }
})

// ─── Hermes 2026-04 deeper rebuild: command-icon atlas ─────────────────────────
// SC's cmdicons.grp is a 256-frame palette-encoded sprite sheet that drives
// every build/order icon in the command card. The React HUD needs them as a
// single PNG atlas + per-icon (x,y,w,h) JSON manifest. We decode server-side
// (Node has the raw GRP bytes plus a port of bw-chk's GRP RLE) so the
// dashboard never has to parse GRP in the browser.
//
// Endpoints:
//   GET /cmdicons/atlas.png        -> N-row x M-col PNG of all icons
//   GET /cmdicons/atlas.json       -> { tilesPerRow, tileW, tileH, count, frames: [{x,y,w,h}] }
//
// Palette source: tselect.pcx -> falls back to a synthesized BW UI palette
// derived from RGB ramp matching the original game's command card colour
// curve. We don't try to stay pixel-perfect with the official palette
// because SC:R itself ships its own; the React HUD is consistent enough.

let cmdIconsCache = null

function pcxParse(buf) {
  if (buf.length < 128) return null
  const bitsPerPixel = buf[3]
  const xMin = buf.readUInt16LE(4)
  const yMin = buf.readUInt16LE(6)
  const xMax = buf.readUInt16LE(8)
  const yMax = buf.readUInt16LE(10)
  const planes = buf[65]
  const bpr = buf.readUInt16LE(66)
  const w = xMax - xMin + 1
  const h = yMax - yMin + 1
  if (bitsPerPixel !== 8 || planes !== 1) return null
  const totalLineBytes = bpr
  const out = Buffer.alloc(w * h)
  let outPos = 0
  let pos = 128
  for (let y = 0; y < h; y++) {
    let lineBuf = Buffer.alloc(totalLineBytes)
    let lp = 0
    while (lp < totalLineBytes) {
      const b = buf[pos++]
      if ((b & 0xc0) === 0xc0) {
        const count = b & 0x3f
        const val = buf[pos++]
        for (let i = 0; i < count && lp < totalLineBytes; i++) lineBuf[lp++] = val
      } else {
        lineBuf[lp++] = b
      }
    }
    for (let x = 0; x < w; x++) out[outPos++] = lineBuf[x]
  }
  // Palette: VGA 256 * 3 bytes at end (preceded by a 0x0C marker). BW PCX
  // files usually have it at offset (filesize - 769) with marker 0x0C.
  let palette = null
  if (buf.length >= 769) {
    const marker = buf[buf.length - 769]
    if (marker === 0x0c) {
      palette = Buffer.alloc(256 * 4)
      for (let i = 0; i < 256; i++) {
        palette[i * 4 + 0] = buf[buf.length - 768 + i * 3 + 0]
        palette[i * 4 + 1] = buf[buf.length - 768 + i * 3 + 1]
        palette[i * 4 + 2] = buf[buf.length - 768 + i * 3 + 2]
        palette[i * 4 + 3] = 0xff
      }
      palette[0 * 4 + 3] = 0 // 0 = transparent
    }
  }
  return { w, h, indexed: out, palette }
}

function decodeGrpToFrames(buf, palette) {
  const frameCount = buf.readUInt16LE(0)
  const maxW = buf.readUInt16LE(2)
  const maxH = buf.readUInt16LE(4)
  const frames = []
  for (let i = 0; i < frameCount; i++) {
    const headerBase = 6 + i * 8
    const xOff = buf[headerBase + 0]
    const yOff = buf[headerBase + 1]
    let w = buf[headerBase + 2]
    const h = buf[headerBase + 3]
    const offset32 = buf.readUInt32LE(headerBase + 4)
    const frameOffset = offset32 & ~0x80000000
    if (offset32 & 0x80000000) w += 0x100
    const out = Buffer.alloc(w * h * 4)
    for (let y = 0; y < h; y++) {
      const lineOffset = buf.readUInt16LE(frameOffset + y * 2)
      let pos = frameOffset + lineOffset
      let outPos = y * w * 4
      const lineEnd = outPos + w * 4
      while (outPos < lineEnd) {
        const val = buf[pos++]
        if (val & 0x80) {
          const amount = val & ~0x80
          outPos += amount * 4
        } else if (val & 0x40) {
          const amount = val & ~0x40
          const color = buf[pos++]
          for (let k = 0; k < amount; k++) {
            out[outPos + 0] = palette[color * 4 + 0]
            out[outPos + 1] = palette[color * 4 + 1]
            out[outPos + 2] = palette[color * 4 + 2]
            out[outPos + 3] = color === 0 ? 0 : 0xff
            outPos += 4
          }
        } else {
          const amount = val
          for (let k = 0; k < amount; k++) {
            const color = buf[pos++]
            out[outPos + 0] = palette[color * 4 + 0]
            out[outPos + 1] = palette[color * 4 + 1]
            out[outPos + 2] = palette[color * 4 + 2]
            out[outPos + 3] = color === 0 ? 0 : 0xff
            outPos += 4
          }
        }
      }
    }
    frames.push({ xOff, yOff, w, h, rgba: out })
  }
  return { frameCount, maxW, maxH, frames }
}

function rgbaToPngViaImageMagick(rgba, w, h) {
  const dir = os.tmpdir()
  const id = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`
  const infile = path.join(dir, `cmdicons-${id}.rgba`)
  const outfile = path.join(dir, `cmdicons-${id}.png`)
  try {
    fs.writeFileSync(infile, rgba)
    execFileSync(
      'convert',
      [
        '-size',
        `${w}x${h}`,
        '-depth',
        '8',
        `rgba:${infile}`,
        outfile,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    )
    return fs.readFileSync(outfile)
  } finally {
    try { fs.unlinkSync(infile) } catch {}
    try { fs.unlinkSync(outfile) } catch {}
  }
}

function buildCmdIconsAtlas() {
  if (cmdIconsCache) return cmdIconsCache
  // 1. Get a palette: tselect.pcx is the command-card palette.
  let palette = null
  for (const candidate of ['tselect.pcx', 'tunit.pcx', 'tminimap.pcx']) {
    try {
      const pcxBuf = readCascWithOverlay(candidate)
      const parsed = pcxParse(Buffer.from(pcxBuf))
      if (parsed && parsed.palette) {
        palette = parsed.palette
        break
      }
    } catch {}
  }
  if (!palette) {
    // Fallback: a generic 256-step grayscale palette so icons at least render.
    palette = Buffer.alloc(256 * 4)
    for (let i = 0; i < 256; i++) {
      palette[i * 4 + 0] = i
      palette[i * 4 + 1] = i
      palette[i * 4 + 2] = i
      palette[i * 4 + 3] = i === 0 ? 0 : 0xff
    }
  }
  const grpBuf = readCascWithOverlay('unit/cmdbtns/cmdicons.grp')
  const { frameCount, maxW, maxH, frames } = decodeGrpToFrames(Buffer.from(grpBuf), palette)
  const tilesPerRow = 16
  const rows = Math.ceil(frameCount / tilesPerRow)
  const atlasW = tilesPerRow * maxW
  const atlasH = rows * maxH
  const atlas = Buffer.alloc(atlasW * atlasH * 4)
  const manifest = []
  for (let i = 0; i < frameCount; i++) {
    const f = frames[i]
    const cx = (i % tilesPerRow) * maxW
    const cy = Math.floor(i / tilesPerRow) * maxH
    const ox = cx + f.xOff
    const oy = cy + f.yOff
    for (let y = 0; y < f.h; y++) {
      for (let x = 0; x < f.w; x++) {
        const dstOff = ((oy + y) * atlasW + (ox + x)) * 4
        const srcOff = (y * f.w + x) * 4
        atlas[dstOff + 0] = f.rgba[srcOff + 0]
        atlas[dstOff + 1] = f.rgba[srcOff + 1]
        atlas[dstOff + 2] = f.rgba[srcOff + 2]
        atlas[dstOff + 3] = f.rgba[srcOff + 3]
      }
    }
    manifest.push({
      x: cx,
      y: cy,
      w: maxW,
      h: maxH,
      cw: f.w,
      ch: f.h,
      ox: f.xOff,
      oy: f.yOff,
    })
  }
  const png = rgbaToPngViaImageMagick(atlas, atlasW, atlasH)
  cmdIconsCache = {
    png,
    manifest: {
      tilesPerRow,
      tileW: maxW,
      tileH: maxH,
      count: frameCount,
      atlasW,
      atlasH,
      frames: manifest,
    },
  }
  return cmdIconsCache
}

app.get('/cmdicons/atlas.png', (_req, res) => {
  try {
    const { png } = buildCmdIconsAtlas()
    res.setHeader('Content-Type', 'image/png')
    res.setHeader('Cache-Control', IMMUTABLE_CACHE)
    res.send(png)
  } catch (e) {
    console.error('[casc-http] cmdicons.png error', e && e.message)
    res.status(500).json({ error: String(e && e.message) })
  }
})

app.get('/cmdicons/atlas.json', (_req, res) => {
  try {
    const { manifest } = buildCmdIconsAtlas()
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Cache-Control', IMMUTABLE_CACHE)
    res.json(manifest)
  } catch (e) {
    console.error('[casc-http] cmdicons.json error', e && e.message)
    res.status(500).json({ error: String(e && e.message) })
  }
})

app.head('*', (req, res) => {
  try {
    if (req.query.open === 'true' || req.query.open === '1' || req.query.open === '') {
      getStorage()
      res.sendStatus(200)
      res.end()
      return
    }
    if (req.query.close === 'true' || req.query.close === '1' || req.query.close === '') {
      if (storageHandle) {
        casclib.closeStorage(storageHandle)
        storageHandle = null
      }
      res.sendStatus(200)
      res.end()
      return
    }
    const rel = cascPathFromUrl(req.path)
    if (!rel) {
      res.sendStatus(400)
      return
    }
    const buf = readCascWithOverlay(rel)
    const lower = rel.toLowerCase()
    let ct = 'application/octet-stream'
    if (lower.endsWith('.dds')) ct = 'image/vnd-ms-dds'
    else if (lower.endsWith('.ogg')) ct = 'audio/ogg'
    else if (lower.endsWith('.wav')) ct = 'audio/wav'
    else if (lower.endsWith('.mp3')) ct = 'audio/mpeg'
    const full = Buffer.from(buf)
    const base = path.basename(rel)
    res.setHeader('Content-Type', ct)
    res.setHeader('Accept-Ranges', 'bytes')
    res.setHeader('Cache-Control', IMMUTABLE_CACHE)
    res.setHeader('Content-Disposition', `inline; filename="${base.replace(/"/g, '')}"`)
    const range = parseRange(req.headers.range, full.length)
    if (range) {
      const sliceLen = range.end - range.start + 1
      res.status(206)
      res.setHeader('Content-Range', `bytes ${range.start}-${range.end}/${full.length}`)
      res.setHeader('Content-Length', String(sliceLen))
    } else {
      res.setHeader('Content-Length', String(full.length))
      res.status(200)
    }
    res.end()
  } catch {
    res.sendStatus(404)
  }
})

// Titan's ResourceIncrementalLoader fetches audio/large assets in 512KB chunks
// using HTTP Range headers. If we don't honour Range, every chunked request
// returns the full file and the concatenation step in Titan blows up with
// "Array buffer allocation failed". Parse Range manually so .ogg music,
// .wav sound effects, and any large DDS stream correctly.
function parseRange(header, totalLen) {
  if (!header || typeof header !== 'string') return null
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!m) return null
  const s = m[1] === '' ? null : Number(m[1])
  const e = m[2] === '' ? null : Number(m[2])
  let start = 0
  let end = totalLen - 1
  if (s !== null && e !== null) {
    start = s
    end = e
  } else if (s !== null) {
    start = s
  } else if (e !== null) {
    start = Math.max(0, totalLen - e)
  }
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null
  start = Math.max(0, Math.min(start, totalLen - 1))
  end = Math.max(start, Math.min(end, totalLen - 1))
  return { start, end }
}

app.get('*', (req, res) => {
  try {
    // Cascbridge-compatible handshake (Titan Reactor openCascStorageRemote)
    if (req.query.open === 'true' || req.query.open === '1' || req.query.open === '') {
      try {
        getStorage()
        res.sendStatus(200)
        res.end()
      } catch (e) {
        console.error('[casc-http] open failed', e)
        res.sendStatus(500)
      }
      return
    }
    if (req.query.close === 'true' || req.query.close === '1' || req.query.close === '') {
      if (storageHandle) {
        casclib.closeStorage(storageHandle)
        storageHandle = null
      }
      res.sendStatus(200)
      res.end()
      return
    }

    let rel = cascPathFromUrl(req.path)
    if (!rel) {
      res.sendStatus(400)
      return
    }

    let wantPng = req.query.png === '1' || req.query.format === 'png'
    if (wantPng && rel.toLowerCase().endsWith('.png')) {
      rel = rel.slice(0, -4) + '.DDS'
    }

    const buf = readCascWithOverlay(rel)
    const lower = rel.toLowerCase()

    if (wantPng && lower.endsWith('.dds')) {
      const png = ddsBufferToPngBuffer(Buffer.from(buf))
      res.setHeader('Content-Type', 'image/png')
      res.setHeader('Cache-Control', 'public, max-age=300')
      res.send(png)
      return
    }

    let ct = 'application/octet-stream'
    if (lower.endsWith('.dds')) ct = 'image/vnd-ms-dds'
    else if (lower.endsWith('.ogg')) ct = 'audio/ogg'
    else if (lower.endsWith('.wav')) ct = 'audio/wav'
    else if (lower.endsWith('.mp3')) ct = 'audio/mpeg'
    res.setHeader('Content-Type', ct)
    res.setHeader('Cache-Control', IMMUTABLE_CACHE)
    res.setHeader('Accept-Ranges', 'bytes')
    const base = path.basename(rel)
    res.setHeader('Content-Disposition', `inline; filename="${base.replace(/"/g, '')}"`)

    const full = Buffer.from(buf)
    const range = parseRange(req.headers.range, full.length)
    if (range) {
      const slice = full.slice(range.start, range.end + 1)
      res.status(206)
      res.setHeader('Content-Range', `bytes ${range.start}-${range.end}/${full.length}`)
      res.setHeader('Content-Length', String(slice.length))
      res.end(slice)
      return
    }
    res.setHeader('Content-Length', String(full.length))
    res.send(full)
  } catch (e) {
    console.error('[casc-http] 404', req.path, e && e.message)
    res.sendStatus(404)
  }
})

app.listen(PORT, '127.0.0.1', () => {
  console.log('[casc-http] Listening on http://127.0.0.1:' + PORT)
})
