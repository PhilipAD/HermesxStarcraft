#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

case "$ROOT_DIR" in
  *"("*|*")"*)
    cat >&2 <<'EOF'
[HermesxStarcraft] This checkout path contains parentheses.

The StarCraft CASC native dependency (bw-casclib) currently has an upstream
node-gyp recipe that breaks when the project path contains shell metacharacters
such as '(' or ')'. Move or clone the repo to a plain path, for example:

  ~/.hermes/HermesxStarcraft
  ~/src/HermesxStarcraft

Then rerun:

  npm run install:all
EOF
    exit 1
    ;;
esac

export CXXFLAGS="${CXXFLAGS:-} -Wno-narrowing"

echo "[HermesxStarcraft] Installing dashboard dependencies..."
npm --prefix "$ROOT_DIR/packages/starcraft-dashboard" install --legacy-peer-deps

echo "[HermesxStarcraft] Installing Titan/OpenBW renderer dependencies..."
npm --prefix "$ROOT_DIR/packages/titan-reactor" install --legacy-peer-deps

echo "[HermesxStarcraft] Install complete."
