#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DASHBOARD_DIR="$ROOT_DIR/packages/starcraft-dashboard"
TITAN_DIR="$ROOT_DIR/packages/titan-reactor"

if [[ -f "$ROOT_DIR/.env" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "$ROOT_DIR/.env"
  set +a
fi

export HERMES_HOME="${HERMES_HOME:-$HOME/.hermes}"
export TITAN_ROOT="${TITAN_ROOT:-$TITAN_DIR}"

if [[ ! -d "$DASHBOARD_DIR/node_modules" || ! -d "$TITAN_DIR/node_modules" ]]; then
  echo "[HermesxStarcraft] Dependencies missing. Run: npm run install:all" >&2
  exit 1
fi

if [[ -z "${SC_ROOT:-}" && -f "$DASHBOARD_DIR/starcraft-install.path" ]]; then
  export SC_ROOT="$(grep '^SC_ROOT=' "$DASHBOARD_DIR/starcraft-install.path" | head -1 | cut -d= -f2- | tr -d '\r')"
fi

if [[ -z "${SC_ROOT:-}" || ! -d "$SC_ROOT" ]]; then
  echo "[HermesxStarcraft] Set SC_ROOT to your StarCraft Remastered install directory." >&2
  exit 1
fi

cleanup() {
  jobs -pr | xargs -r kill 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "[HermesxStarcraft] Starting bridge on 9121..."
(cd "$DASHBOARD_DIR" && HERMES_HOME="$HERMES_HOME" npm run server) &

echo "[HermesxStarcraft] Starting dashboard viewer on 9120..."
(cd "$DASHBOARD_DIR" && npm run dev -- --host 127.0.0.1 --port 9120) &

echo "[HermesxStarcraft] Starting Titan/OpenBW renderer..."
(cd "$DASHBOARD_DIR" && TITAN_ROOT="$TITAN_ROOT" SC_ROOT="$SC_ROOT" ./start-titan-client.sh) &

echo "[HermesxStarcraft] Open Hermes dashboard tab: Hermes x StarCraft"
echo "[HermesxStarcraft] Direct URL: http://127.0.0.1:9120/?titan=1"

wait
