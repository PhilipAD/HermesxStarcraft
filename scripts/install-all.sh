#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

export CXXFLAGS="${CXXFLAGS:-} -Wno-narrowing"

install_in_place() {
  echo "[HermesxStarcraft] Installing dashboard dependencies..."
  npm --prefix "$ROOT_DIR/packages/starcraft-dashboard" install --legacy-peer-deps

  echo "[HermesxStarcraft] Installing Titan/OpenBW renderer dependencies..."
  npm --prefix "$ROOT_DIR/packages/titan-reactor" install --legacy-peer-deps
}

install_via_safe_path() {
  local temp_root
  temp_root="$(mktemp -d "${TMPDIR:-/tmp}/hermesxstarcraft-install.XXXXXX")"
  INSTALL_TEMP_ROOT="$temp_root"
  cleanup() {
    if [[ -n "${INSTALL_TEMP_ROOT:-}" ]]; then
      rm -rf "$INSTALL_TEMP_ROOT"
    fi
  }
  trap cleanup EXIT

  cat <<EOF
[HermesxStarcraft] Checkout path contains shell metacharacters:
  $ROOT_DIR

[HermesxStarcraft] The bw-casclib native dependency cannot compile directly
from that path, so dependencies will be installed through a temporary safe
build path and copied back.
EOF

  tar \
    --exclude="./.git" \
    --exclude="./packages/titan-reactor/.git" \
    --exclude="./packages/starcraft-dashboard/node_modules" \
    --exclude="./packages/titan-reactor/node_modules" \
    --exclude="./packages/starcraft-dashboard/dist" \
    --exclude="./packages/titan-reactor/dist" \
    -C "$ROOT_DIR" -cf - . | tar -C "$temp_root" -xf -

  echo "[HermesxStarcraft] Installing dashboard dependencies in temporary path..."
  npm --prefix "$temp_root/packages/starcraft-dashboard" install --legacy-peer-deps

  echo "[HermesxStarcraft] Installing Titan/OpenBW renderer dependencies in temporary path..."
  npm --prefix "$temp_root/packages/titan-reactor" install --legacy-peer-deps

  echo "[HermesxStarcraft] Copying installed dependencies back to checkout..."
  rm -rf \
    "$ROOT_DIR/packages/starcraft-dashboard/node_modules" \
    "$ROOT_DIR/packages/titan-reactor/node_modules"
  mv "$temp_root/packages/starcraft-dashboard/node_modules" "$ROOT_DIR/packages/starcraft-dashboard/node_modules"
  mv "$temp_root/packages/titan-reactor/node_modules" "$ROOT_DIR/packages/titan-reactor/node_modules"
}

case "$ROOT_DIR" in
  *"("*|*")"*|*"["*|*"]"*|*"{"*|*"}"*|*";"*|*"&"*)
    install_via_safe_path
    ;;
  *)
    install_in_place
    ;;
esac

echo "[HermesxStarcraft] Install complete."
