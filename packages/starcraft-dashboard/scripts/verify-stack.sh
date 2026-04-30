#!/usr/bin/env bash
# Stage-by-stage HTTP checks for Hermes + Titan + CASC. Logs to stdout and /tmp/hermes-stack-verify.log
set -u
LOG=/tmp/hermes-stack-verify.log
exec > >(tee "$LOG") 2>&1

echo "=== Hermes / Titan stack verify $(date -Iseconds) ==="

pass() { echo "OK  $*"; }
fail() { echo "FAIL $*"; exit 1; }

echo "--- Stage 1: CASC server (casc-http) ---"
curl -sf "http://127.0.0.1:8080/?open=true" -o /dev/null || fail "8080 GET ?open=true"
pass "8080 CASC open handshake"

curl -sfI "http://127.0.0.1:8080/HD2/game/consoles/terran/conover.DDS" | grep -q "200 OK" || fail "8080 sample DDS HEAD"
pass "8080 sample asset path"

echo "--- Stage 2: Titan stub (runtime + plugins index.json) ---"
curl -sfI "http://127.0.0.1:8090/" | grep -q "200 OK" || fail "8090 runtime HEAD"
pass "8090 runtime stub"

BODY=$(curl -sf "http://127.0.0.1:8091/index.json")
echo "8091 index.json: $BODY"
echo "$BODY" | grep -q '"packages"' || fail "8091 index.json must include packages array (Titan plugin-repository)"
pass "8091 plugins index shape"

echo "--- Stage 3: Titan web (Vite) ---"
curl -sf "http://127.0.0.1:3344/" | grep -q 'id="app"' || fail "3344 Titan index"
pass "3344 Titan HTML"

echo "--- Stage 4: Hermes viewer ---"
curl -sf "http://127.0.0.1:9120/" | grep -q "Hermes StarCraft" || fail "9120 Hermes index"
pass "9120 Hermes HTML"

echo "--- Stage 5: Optional bridge ---"
if curl -sfI "http://127.0.0.1:9121/" 2>/dev/null | grep -q "HTTP"; then
  pass "9121 bridge responded (HEAD)"
else
  echo "SKIP 9121 bridge (no HTTP HEAD or not running — WS only is normal)"
fi

echo "=== All required stages passed. Full log: $LOG ==="
