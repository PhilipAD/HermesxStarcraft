'use strict'

/**
 * Minimal HTTP endpoints so Titan Reactor passes loading checks:
 *   - runtimeUrl HEAD/GET 200
 *   - pluginsUrl + "index.json" returns Titan IndexJson shape (see titan-reactor/src/stores/plugin-repository.ts)
 */

const http = require('http')

const EMPTY_INDEX = JSON.stringify({
  indexVersion: 1,
  buildVersion: 1,
  packages: [],
})

function server(name, port, handler) {
  const s = http.createServer(handler)
  s.listen(port, '127.0.0.1', () => {
    console.log(`[titan-stub] ${name} http://127.0.0.1:${port}/`)
  })
  return s
}

const RUNTIME = Number(process.env.TITAN_STUB_RUNTIME_PORT || 8090)
const PLUGINS = Number(process.env.TITAN_STUB_PLUGINS_PORT || 8091)

// Minimal HTML that immediately posts UI_SYSTEM_RUNTIME_READY so that
// Titan's PluginSystemUI.isRunning() promise resolves. Without this, Titan
// hangs in apiSession.activate() forever waiting for the runtime iframe.
// The constant UI_SYSTEM_RUNTIME_READY = "system:runtime-ready".
const RUNTIME_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><title>titan-stub-runtime</title></head>
<body style="margin:0;background:transparent;">
<script>
  (function () {
    try {
      parent.postMessage({ type: 'system:runtime-ready' }, '*');
    } catch (e) {}
    // Echo back a no-op response for any subsequent messages so Titan's
    // queued sendMessage() calls don't accumulate unhandled listeners.
    window.addEventListener('message', function () {});
  })();
</script>
</body></html>`

server('runtime', RUNTIME, (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method === 'HEAD') {
    res.writeHead(200, { 'Content-Type': 'text/html' })
    res.end()
    return
  }
  if (req.method === 'GET') {
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Length': Buffer.byteLength(RUNTIME_HTML),
    })
    res.end(RUNTIME_HTML)
    return
  }
  res.writeHead(405)
  res.end()
})

server('plugins', PLUGINS, (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  const u = req.url.split('?')[0]
  if (u === '/index.json' && (req.method === 'HEAD' || req.method === 'GET')) {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(EMPTY_INDEX),
    })
    res.end(req.method === 'GET' ? EMPTY_INDEX : '')
    return
  }
  res.writeHead(404)
  res.end()
})
