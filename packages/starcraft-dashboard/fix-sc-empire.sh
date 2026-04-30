#!/bin/bash
set -e

echo "╔══════════════════════════════════════════════════════╗"
echo "║  🔧 StarCraft Empire — Authenticity Fix Applied      ║"
echo "╚══════════════════════════════════════════════════════╝"

cd "$(dirname "${BASH_SOURCE[0]}")"

echo ""
echo "[1/5] Installing/updating dependencies..."
PATH="$HOME/.nvm/versions/node/v24.15.0/bin:$PATH" npm install --legacy-peer-deps 2>&1 | tail -3

echo ""
echo "[2/5] Fixing React version (v19 → v18 for R3F compatibility)..."
PATH="$HOME/.nvm/versions/node/v24.15.0/bin:$PATH" npm install react@18.3.1 react-dom@18.3.1 --legacy-peer-deps 2>&1 | tail -3

echo ""
echo "[3/5] Terrain component created (SCTerrain with heightmap)..."
ls -la src/viewer/components/Terrain.tsx

echo ""
echo "[4/5] Scene.tsx updated with:"
echo "  • SC terrain + heightmap"
echo "  • Live SCV mining animations (orbit + bob)"
echo "  • Marine patrol animations (formation movement)"
echo "  • Zealot charge animations"
echo "  • SupplyDepot fill-level indicator"
echo "  • Command Center rotation + antenna spin"
echo "  • Gateway energy beam animation"
echo "  • Barracks door animation"
echo "  • VespeneGeyser crystal orbit"
ls -la src/viewer/components/Scene.tsx

echo ""
echo "[5/5] Layout worker updated for SC base clustering..."
ls -la src/viewer/workers/layout.worker.ts

echo ""
echo "✅ All authenticity fixes applied!"
echo ""
echo "Restart the empire:"
echo "  ./start-empire.sh"
echo ""
echo "What you'll see:"
echo "  • Varied terrain with hills + central plateau"
echo "  • SCVs mining Vespene Geysers (orbiting + bobbing)"
echo "  • Marines patrolling in squad formations"
echo "  • Zealots with energy blades pulsing"
echo "  • Tech buildings with rotating domes"
echo "  • Supply Depots with fill-level display"
echo "  • Gateway warp energy beams"
echo "  • 8 mineral fields scattered at map edges"
echo "  • Authentic SC color palette + fog"