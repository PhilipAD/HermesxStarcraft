#!/bin/bash
# ─── Hermes StarCraft Empire — Full Auto-Setup ─────────────────────────────
# This script handles EVERYTHING automatically.
# After StarCraft is installed via Battle.net, run this to wire it all up.
# Usage: ./start-empire.sh [--force]

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CASCBRIDGE_DIR="$SCRIPT_DIR/public/cascbridge"
CASCBRIDGE_EXE="$CASCBRIDGE_DIR/cascbridge.exe"
CASC_PORT=8080
BRIDGE_PORT=9121
VIEWER_PORT=9120

# Lutris Battle.net default prefix is often ~/Games/battlenet (lowercase); legacy path was ~/Games/BattleNet/wine64
if [ -d "$HOME/Games/battlenet/drive_c" ]; then
  WINEPREFIX="$HOME/Games/battlenet"
elif [ -d "$HOME/Games/BattleNet/wine64/drive_c" ]; then
  WINEPREFIX="$HOME/Games/BattleNet/wine64"
else
  WINEPREFIX="${WINEPREFIX:-$HOME/Games/battlenet}"
fi

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

log()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; }
info() { echo -e "${CYAN}[i]${NC} $1"; }

cleanup() {
  info "Cleaning up..."
  pkill -f "cascbridge.exe" 2>/dev/null || true
  pkill -f "server/casc-http.cjs" 2>/dev/null || true
  pkill -f "hermes-starcraft-bridge" 2>/dev/null || true
  pkill -f "vite.*9120" 2>/dev/null || true
}
trap cleanup EXIT

cd "$SCRIPT_DIR"

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║   Hermes StarCraft Empire — Self-Organizing Base    ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# ─── Step 1: Find StarCraft Installation ───────────────────────────────────
info "Using WINEPREFIX: $WINEPREFIX"
info "Looking for StarCraft installation..."
SC_PATHS=(
  "$WINEPREFIX/drive_c/Program Files (x86)/StarCraft"
  "$WINEPREFIX/drive_c/Program Files/StarCraft"
)
SC_FOUND=""

for p in "${SC_PATHS[@]}"; do
  if [ -f "$p/x86_64/StarCraft.exe" ] || [ -f "$p/x86/StarCraft.exe" ] || [ -f "$p/StarCraft.exe" ] || [ -f "$p/star.exe" ]; then
    SC_FOUND="$p"
    log "Found StarCraft at: $p"
    break
  fi
done

# Broader search if not found (Remastered: .../StarCraft/x86_64/StarCraft.exe)
if [ -z "$SC_FOUND" ] && [ -d "$WINEPREFIX/drive_c" ]; then
  info "Searching wider for StarCraft.exe under drive_c..."
  SC_EXE=$(find "$WINEPREFIX/drive_c" -name "StarCraft.exe" -type f 2>/dev/null | head -1 || true)
  if [ -n "$SC_EXE" ]; then
    d=$(dirname "$SC_EXE")
    case "$d" in
      */x86_64|*/x86) SC_FOUND=$(dirname "$d") ;;
      *) SC_FOUND="$d" ;;
    esac
    log "Found StarCraft at: $SC_FOUND"
  fi
fi

if [ -n "$SC_FOUND" ]; then
  INSTALL_INFO="$SCRIPT_DIR/starcraft-install.path"
  {
    echo "WINEPREFIX=$WINEPREFIX"
    echo "SC_ROOT=$SC_FOUND"
    echo "SC_EXE64=$SC_FOUND/x86_64/StarCraft.exe"
    echo "SC_EXE32=$SC_FOUND/x86/StarCraft.exe"
  } > "$INSTALL_INFO"
  log "Wrote paths to $INSTALL_INFO"
fi

if [ -z "$SC_FOUND" ]; then
  warn "StarCraft not installed yet!"
  echo "   Install StarCraft (Classic or Remastered) from Battle.net in Lutris, then run this script again."
  echo ""
fi

# ─── Step 2: Native CASC HTTP server (bw-casclib, same stack as alexpineda/cascbridge) ──
# Wine/Electron cascbridge.exe often fails GPU under Wine; this serves real game files on Linux.
CASCLIB_NODE="${CASCLIB_NODE:-/usr/bin/node}"
if [ -n "$SC_FOUND" ]; then
  if ! command -v convert >/dev/null 2>&1; then
    warn "ImageMagick 'convert' not found — install imagemagick so DDS files can be shown as PNG in the viewer (SwiftShader cannot decode DX10 DDS in the browser)."
  fi
  if ! lsof -Pi :$CASC_PORT -sTCP:LISTEN >/dev/null 2>&1; then
    if [ -x "$CASCLIB_NODE" ]; then
      info "Starting native CASC asset server on port $CASC_PORT ($CASCLIB_NODE)..."
      SC_ROOT="$SC_FOUND" CASC_PORT="$CASC_PORT" "$CASCLIB_NODE" "$SCRIPT_DIR/server/casc-http.cjs" &>/tmp/hermes-casc-http.log &
      sleep 1
      if lsof -Pi :$CASC_PORT -sTCP:LISTEN >/dev/null 2>&1; then
        log "CASC HTTP server listening (see /tmp/hermes-casc-http.log if issues)"
      else
        warn "CASC server did not bind to $CASC_PORT — check /tmp/hermes-casc-http.log (try: npm run rebuild:casclib)"
      fi
    else
      warn "Node not found at CASCLIB_NODE=$CASCLIB_NODE — set CASCLIB_NODE to a Node where bw-casclib loads (often /usr/bin/node)."
    fi
  else
    log "Port $CASC_PORT already in use (asset server may already be running)"
  fi
  export VITE_CASCBRIDGE=1
elif [ -f "$CASCBRIDGE_EXE" ] && [ -z "$SC_FOUND" ]; then
  warn "cascbridge.exe is present but no StarCraft install was found yet."
fi

# ─── Step 3: Start Bridge Service ──────────────────────────────────────────
info "Starting Bridge service on port $BRIDGE_PORT..."
cd "$SCRIPT_DIR"
if [ -f "server/index.ts" ]; then
  npx tsx server/index.ts &
else
  node server/index.js &
fi
sleep 2
log "Bridge service running"

# ─── Step 4: Start Viewer ──────────────────────────────────────────────────
info "Starting Viewer on port $VIEWER_PORT..."
cd "$SCRIPT_DIR"
VITE_CASCBRIDGE="${VITE_CASCBRIDGE:-0}" \
  npx vite --port $VIEWER_PORT --host 127.0.0.1 2>&1 &
sleep 3

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║             ✅ ALL SERVICES RUNNING                  ║"
echo "╠══════════════════════════════════════════════════════╣"
echo "║                                                      ║"
echo "║  Viewer:   http://localhost:${VIEWER_PORT}              ║"
echo "║  Game client (Titan): npm run titan:web then http://localhost:${VIEWER_PORT}/?titan=1 ║"
echo "║  Bridge:   ws://localhost:${BRIDGE_PORT}/ws            ║"
echo "║  Assets:   http://localhost:${CASC_PORT}/ (if SC installed) ║"
echo "║                                                      ║"
if [ -n "$SC_FOUND" ]; then
echo "║  ✅ Real StarCraft assets loaded!                     ║"
else
echo "║  ⏳ Waiting for StarCraft install...                  ║"
fi
echo "║                                                      ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# Wait
wait