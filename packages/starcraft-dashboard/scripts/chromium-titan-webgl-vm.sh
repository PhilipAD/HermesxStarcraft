#!/usr/bin/env bash
# Chrome/Chromium launcher for Hermes/Titan inside VMs and RDP.
# Prefer ANGLE+SwiftShader over Mesa llvmpipe, which often fails with
# "BindToCurrentSequence failed" while creating the Three.js WebGL context.
set -e
CASC_PORT="${CASC_PORT:-8080}"
RUNTIME="${TITAN_STUB_RUNTIME_PORT:-8090}"
PLUGINS="${TITAN_STUB_PLUGINS_PORT:-8091}"
PROFILE="${HERMES_CHROME_PROFILE:-/tmp/hermes-vm-chrome}"
URL="${1:-http://127.0.0.1:9120/?titan=1&map=(4)Blood%20Bath.scm}"
for b in google-chrome-stable google-chrome chromium chromium-browser; do
  if command -v "$b" >/dev/null 2>&1; then
    rm -rf "$PROFILE"
    exec "$b" \
      --user-data-dir="$PROFILE" \
      --no-first-run \
      --disable-default-apps \
      --disable-background-networking \
      --enable-unsafe-swiftshader \
      --ignore-gpu-blocklist \
      --disable-gpu-sandbox \
      --use-gl=angle \
      --use-angle=swiftshader \
      --window-size=1600,1000 \
      --new-window \
      "$URL"
  fi
done
echo "No google-chrome or chromium found in PATH." >&2
exit 1
