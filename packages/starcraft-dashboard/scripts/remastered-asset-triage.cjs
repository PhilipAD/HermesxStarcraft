#!/usr/bin/env node
'use strict'

const fs = require('fs')
const path = require('path')
const os = require('os')

const TARGET_TERMS = [
  'race',
  'raceselect',
  'raceselection',
  'selectrace',
  'terran',
  'protoss',
  'zerg',
  'glue',
  'frontend',
  'login',
  'lobby',
  'versus',
  'loading',
  'loadscreen',
  'loadingscreen',
  'splash',
  'startup',
  'boot',
  'title',
  'menu',
  'background',
  'bnet',
]

const TARGET_EXTS = new Set([
  '.anim',
  '.dds',
  '.grp',
  '.pcx',
  '.tbl',
  '.dat',
  '.bin',
  '.lof',
  '.lob',
  '.lod',
  '.log',
  '.loo',
  '.los',
  '.lou',
  '.lox',
  '.wav',
  '.ogg',
  '.json',
  '.txt',
])

const MARKER_EXTS = new Set(['.idx', '.manifest', '.dat', '.grp', '.anim', '.dds', '.pcx', '.tbl', '.bin', '.casc', '.mpq'])

function exists(p) {
  try {
    return fs.existsSync(p)
  } catch (_) {
    return false
  }
}

function statSafe(p) {
  try {
    return fs.statSync(p)
  } catch (_) {
    return null
  }
}

function readJsonSafe(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'))
  } catch (_) {
    return null
  }
}

function winePathToUnix(winePath, prefix) {
  if (!winePath || !prefix) return null
  const normalized = String(winePath).replace(/\//g, '\\')
  const driveMatch = /^([a-zA-Z]):\\?(.*)$/.exec(normalized)
  if (!driveMatch) return null
  const drive = driveMatch[1].toLowerCase()
  const rest = driveMatch[2].split('\\').filter(Boolean)
  if (drive === 'c') return path.join(prefix, 'drive_c', ...rest)
  const dosDevice = path.join(prefix, 'dosdevices', `${drive}:`)
  if (!exists(dosDevice)) return null
  try {
    return path.join(fs.realpathSync(dosDevice), ...rest)
  } catch (_) {
    return null
  }
}

function pushUnique(list, candidate) {
  if (!candidate) return
  const resolved = path.resolve(candidate)
  if (!list.includes(resolved)) list.push(resolved)
}

function discoverPrefixes(home = os.homedir()) {
  const prefixes = []
  for (const p of [
    path.join(home, 'Games', 'battlenet'),
    path.join(home, 'Games', 'BattleNet'),
    path.join(home, '.wine'),
  ]) {
    if (exists(path.join(p, 'drive_c'))) pushUnique(prefixes, p)
  }
  return prefixes
}

function discoverBattleNetInstalls(prefix) {
  const installs = []
  const aggregate = path.join(prefix, 'drive_c', 'ProgramData', 'Battle.net', 'Agent', 'aggregate.json')
  const agg = readJsonSafe(aggregate)
  if (agg && Array.isArray(agg.installed)) {
    for (const item of agg.installed) {
      const exeUnix = winePathToUnix(item.icon_path, prefix)
      installs.push({
        source: aggregate,
        productId: item.product_id || null,
        name: item.name || null,
        executable: exeUnix,
        inferredRoot: exeUnix ? path.dirname(path.dirname(exeUnix)) : null,
      })
    }
  }
  return installs
}

function candidateRemasteredRoots(prefixes, explicitRoot) {
  const roots = []
  pushUnique(roots, explicitRoot)
  for (const prefix of prefixes) {
    for (const install of discoverBattleNetInstalls(prefix)) {
      if (install.productId === 's1' || /^starcraft$/i.test(install.name || '')) {
        pushUnique(roots, install.inferredRoot)
      }
    }
    for (const p of [
      path.join(prefix, 'drive_c', 'Program Files (x86)', 'StarCraft'),
      path.join(prefix, 'drive_c', 'Program Files', 'StarCraft'),
    ]) {
      pushUnique(roots, p)
    }
  }
  return roots
}

function walkLimited(root, options = {}) {
  const maxFiles = options.maxFiles || 20000
  const maxDepth = options.maxDepth || 8
  const out = []
  const stack = [{ dir: root, depth: 0 }]
  while (stack.length && out.length < maxFiles) {
    const { dir, depth } = stack.pop()
    let entries = []
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch (_) {
      continue
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (depth < maxDepth && !entry.name.startsWith('.')) stack.push({ dir: full, depth: depth + 1 })
      } else if (entry.isFile()) {
        out.push(full)
        if (out.length >= maxFiles) break
      }
    }
  }
  return out
}

function magicOf(file) {
  try {
    const fd = fs.openSync(file, 'r')
    const buf = Buffer.alloc(16)
    const n = fs.readSync(fd, buf, 0, buf.length, 0)
    fs.closeSync(fd)
    return buf.subarray(0, n).toString('hex')
  } catch (_) {
    return null
  }
}

function classifyRoot(root) {
  const markers = {
    root,
    exists: exists(root),
    likelyRemastered: false,
    executablePaths: [],
    manifests: [],
    casc: [],
    archives: [],
    otherContainers: [],
  }
  if (!markers.exists) return markers
  for (const rel of [path.join('x86', 'StarCraft.exe'), path.join('x86_64', 'StarCraft.exe'), 'StarCraft.exe']) {
    const p = path.join(root, rel)
    if (exists(p)) markers.executablePaths.push(p)
  }
  for (const rel of ['.build.info', '.product.db']) {
    const p = path.join(root, rel)
    if (exists(p)) markers.manifests.push({ path: p, size: statSafe(p)?.size || 0, magic: magicOf(p) })
  }
  for (const rel of [path.join('Data', 'data'), path.join('Data', 'indices'), 'Data']) {
    const p = path.join(root, rel)
    if (exists(p)) markers.casc.push({ path: p, type: statSafe(p)?.isDirectory() ? 'directory' : 'file' })
  }
  for (const file of walkLimited(root, { maxFiles: 30000, maxDepth: 9 })) {
    const ext = path.extname(file).toLowerCase()
    if (!MARKER_EXTS.has(ext)) continue
    const rec = { path: file, rel: path.relative(root, file).split(path.sep).join('/'), ext, size: statSafe(file)?.size || 0, magic: magicOf(file) }
    if (ext === '.idx' || ext === '.casc') markers.casc.push(rec)
    else if (ext === '.mpq') markers.archives.push(rec)
    else markers.otherContainers.push(rec)
  }
  markers.likelyRemastered =
    markers.executablePaths.some((p) => /starcraft\.exe$/i.test(p)) ||
    (markers.manifests.length > 0 && markers.casc.length > 0)
  return markers
}

function loadNamespaceFile(p) {
  if (!p || !exists(p)) return []
  return fs.readFileSync(p, 'utf8').split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#'))
}

function scoreNamespacePath(assetPath) {
  const lower = assetPath.toLowerCase().replace(/\\/g, '/')
  const ext = path.extname(lower)
  if (TARGET_EXTS.size && ext && !TARGET_EXTS.has(ext)) return 0
  let score = 0
  for (const term of TARGET_TERMS) {
    if (lower.includes(term)) score += term.length >= 7 ? 3 : 1
  }
  if (lower.includes('glue') || lower.includes('game')) score += 2
  if (lower.includes('ui') || lower.includes('anim')) score += 2
  if (lower.includes('loading') || lower.includes('race') || lower.includes('title')) score += 4
  return score
}

function searchNamespace(paths) {
  return paths
    .map((p) => ({ path: p, score: scoreNamespacePath(p) }))
    .filter((hit) => hit.score > 0)
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
    .slice(0, 200)
}

function buildReport(options = {}) {
  const home = options.home || os.homedir()
  const prefixes = discoverPrefixes(home)
  const roots = candidateRemasteredRoots(prefixes, options.root)
  const classifiedRoots = roots.map(classifyRoot)
  const namespace = loadNamespaceFile(options.namespace)
  const supportedRoots = classifiedRoots.filter((r) => r.exists && r.likelyRemastered && (r.casc.length > 0 || r.manifests.length > 0))
  return {
    generatedAt: new Date().toISOString(),
    mode: 'read-only local StarCraft Remastered discovery',
    prefixes,
    installedProducts: prefixes.flatMap((prefix) => discoverBattleNetInstalls(prefix).map((install) => ({ prefix, ...install }))),
    candidateRoots: classifiedRoots,
    assessment: {
      remasteredInstallFound: supportedRoots.length > 0,
      canMountLogically: supportedRoots.length > 0 ? 'yes with CASCBridge/bw-casclib-compatible reader' : 'no local Remastered storage found',
      canStreamOnDemand: supportedRoots.length > 0 ? 'yes after CASC path->bytes resolver is open' : 'not applicable',
      blocker:
        supportedRoots.length > 0
          ? 'stop if local CASC open requires missing encrypted keys, auth, or protected runtime access'
          : 'StarCraft Remastered install root missing from discovered Lutris/Battle.net paths',
    },
    namespaceSearch: {
      source: options.namespace || null,
      searched: namespace.length,
      hits: searchNamespace(namespace),
      targetTerms: TARGET_TERMS,
      targetExtensions: Array.from(TARGET_EXTS),
    },
  }
}

function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--root') out.root = argv[++i]
    else if (a === '--namespace') out.namespace = argv[++i]
    else if (a === '--home') out.home = argv[++i]
    else if (a === '--pretty') out.pretty = true
    else if (a === '--strict') out.strict = true
  }
  out.root = out.root || process.env.STARCRAFT_REMASTERED_ROOT || null
  out.namespace = out.namespace || process.env.STARCRAFT_REMASTERED_NAMESPACE_FILE || null
  return out
}

if (require.main === module) {
  const options = parseArgs(process.argv.slice(2))
  const report = buildReport(options)
  process.stdout.write(JSON.stringify(report, null, options.pretty ? 2 : 0))
  process.stdout.write('\n')
  if (options.strict && !report.assessment.remasteredInstallFound) process.exitCode = 2
}

module.exports = {
  TARGET_TERMS,
  TARGET_EXTS,
  winePathToUnix,
  discoverPrefixes,
  candidateRemasteredRoots,
  classifyRoot,
  scoreNamespacePath,
  searchNamespace,
  buildReport,
}
