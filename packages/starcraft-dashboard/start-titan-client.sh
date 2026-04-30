#!/usr/bin/env bash
# Start Hermes CASC HTTP + stub plugin/runtime servers + Titan Reactor web (game-client renderer).
# Requires:
#   - Titan at ~/.hermes/titan-reactor: npm install --legacy-peer-deps
#   - git-lfs + git lfs pull (OpenBW wasm is LFS; without it Vite fails on titan.wasm.js)
#   - StarCraft: starcraft-install.path or SC_ROOT
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TITAN_ROOT="${TITAN_ROOT:-$HOME/.hermes/titan-reactor}"
CASCLIB_NODE="${CASCLIB_NODE:-/usr/bin/node}"
CASC_PORT="${CASC_PORT:-8080}"

pkill -f "scripts/titan-stub-servers.cjs" 2>/dev/null || true

"$SCRIPT_DIR/scripts/write-titan-env.sh"

echo "[titan-client] Starting stub servers (runtime + plugins HEAD checks)..."
"$CASCLIB_NODE" "$SCRIPT_DIR/scripts/titan-stub-servers.cjs" &
sleep 1

if ! lsof -Pi :"$CASC_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "[titan-client] Starting casc-http on $CASC_PORT..."
  if [[ -f "$SCRIPT_DIR/starcraft-install.path" ]]; then
    # shellcheck source=/dev/null
    export SC_ROOT="$(grep '^SC_ROOT=' "$SCRIPT_DIR/starcraft-install.path" | head -1 | cut -d= -f2- | tr -d '\r')"
  fi
  if [[ -z "$SC_ROOT" || ! -d "$SC_ROOT" ]]; then
    echo "Set SC_ROOT or run ./start-empire.sh once to create starcraft-install.path" >&2
    exit 1
  fi
  SC_ROOT="$SC_ROOT" CASC_PORT="$CASC_PORT" "$CASCLIB_NODE" "$SCRIPT_DIR/server/casc-http.cjs" &
  sleep 1
fi

if [[ ! -d "$TITAN_ROOT/node_modules" ]]; then
  echo "Run: cd $TITAN_ROOT && npm install --legacy-peer-deps" >&2
  exit 1
fi

if head -1 "$TITAN_ROOT/src/openbw/titan.wasm.js" 2>/dev/null | grep -q "git-lfs"; then
  echo "OpenBW wasm is still a Git LFS pointer. Install git-lfs (e.g. sudo apt install git-lfs), then:" >&2
  echo "  cd $TITAN_ROOT && git lfs install && git lfs pull" >&2
  exit 1
fi

echo "[titan-client] Open Titan (include stub URLs — required if .env is missing):"
echo "  http://127.0.0.1:3344/?assetServerUrl=http://127.0.0.1:${CASC_PORT}&runtime=http://127.0.0.1:8090/&plugins=http://127.0.0.1:8091/"
echo "Hermes embed: http://127.0.0.1:9120/?titan=1 (iframe passes the same query params)"
echo "WebGL VM/llvmpipe: TITAN_WEBGL_COMPAT=1 $0 (rewrites Titan .env) and use scripts/chromium-titan-webgl-vm.sh"
echo ""
cd "$TITAN_ROOT"
exec npx vite -c vite.config.web.ts
