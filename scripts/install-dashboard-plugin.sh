#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET_DIR="${HERMES_HOME:-$HOME/.hermes}/plugins/hermesxstarcraft"

mkdir -p "$(dirname "$TARGET_DIR")"
rm -rf "$TARGET_DIR"
ln -s "$ROOT_DIR/plugins/hermesxstarcraft" "$TARGET_DIR"

echo "[HermesxStarcraft] Linked dashboard plugin to $TARGET_DIR"
echo "[HermesxStarcraft] Restart Hermes dashboard or use the Plugins page rescan action."
