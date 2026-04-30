#!/usr/bin/env bash
TITAN_ROOT="${TITAN_ROOT:-$HOME/.hermes/titan-reactor}"
RUNTIME="${TITAN_STUB_RUNTIME_PORT:-8090}"
PLUGINS="${TITAN_STUB_PLUGINS_PORT:-8091}"
if test ! -d "$TITAN_ROOT"; then
  echo "Titan repo not found at $TITAN_ROOT (clone dev branch first)." >&2
  exit 1
fi
OUT="$TITAN_ROOT/.env.development.local"
{
  printf '%s\n%s\n' "VITE_PLUGINS_RUNTIME_ENTRY_URL=http://127.0.0.1:${RUNTIME}/" "VITE_OFFICIAL_PLUGINS_SERVER_URL=http://127.0.0.1:${PLUGINS}/"
  if [[ "${TITAN_WEBGL_COMPAT:-}" == "1" ]]; then
    printf '%s\n' "VITE_TITAN_WEBGL_COMPAT=1"
  fi
} > "$OUT"
echo "Wrote $OUT"
if [[ "${TITAN_WEBGL_COMPAT:-}" != "1" ]]; then
  echo "If WebGL fails (llvmpipe/VM): TITAN_WEBGL_COMPAT=1 $0 then restart Titan." >&2
fi
