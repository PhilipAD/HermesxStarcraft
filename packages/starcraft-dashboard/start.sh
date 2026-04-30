#!/usr/bin/env bash
# Hermes StarCraft Dashboard — Start Script
# Starts both Bridge service (port 9121) and Viewer (port 9120)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Detect node
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ -s "$NVM_DIR/nvm.sh" ]; then
    . "$NVM_DIR/nvm.sh"
    nvm use 24 || nvm use 22 || nvm use 20 || true
fi

echo "╔══════════════════════════════════════════════╗"
echo "║  Hermes StarCraft Dashboard — Starting...  ║"
echo "╚══════════════════════════════════════════════╝"

# Check Hermes home
HERMES_HOME="${HERMES_HOME:-$HOME/.hermes}"
echo "[start] HERMES_HOME=$HERMES_HOME"

if [ ! -d "$HERMES_HOME" ]; then
    echo "[ERROR] Hermes home not found: $HERMES_HOME"
    exit 1
fi

if [ ! -f "$HERMES_HOME/state.db" ]; then
    echo "[WARN] Hermes state.db not found at $HERMES_HOME/state.db"
fi

# Install deps if needed
if [ ! -d "node_modules" ]; then
    echo "[start] Installing dependencies..."
    npm install --legacy-peer-deps
fi

# Start bridge service in background
echo "[start] Starting Bridge service on port 9121..."
node --import tsx server/index.ts &
BRIDGE_PID=$!
echo "[start] Bridge PID: $BRIDGE_PID"

# Wait for bridge to be ready
echo "[start] Waiting for bridge to be ready..."
for i in $(seq 1 10); do
    if curl -s http://127.0.0.1:9121/api/health > /dev/null 2>&1; then
        echo "[start] Bridge is ready!"
        break
    fi
    if [ $i -eq 10 ]; then
        echo "[ERROR] Bridge failed to start"
        exit 1
    fi
    sleep 1
done

# Start viewer
echo "[start] Starting Viewer on port 9120..."
npm run dev -- --host 127.0.0.1 &
VIEWER_PID=$!
echo "[start] Viewer PID: $VIEWER_PID"

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║  Hermes StarCraft Dashboard — Running!      ║"
echo "╠══════════════════════════════════════════════╣"
echo "║  Bridge API:  http://127.0.0.1:9121        ║"
echo "║  Viewer:      http://127.0.0.1:9120        ║"
echo "║  WebSocket:   ws://127.0.0.1:9121/ws       ║"
echo "╚══════════════════════════════════════════════╝"
echo ""
echo "Press Ctrl+C to stop"

# Wait for any process to exit
wait $BRIDGE_PID $VIEWER_PID
