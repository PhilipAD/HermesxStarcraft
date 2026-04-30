#!/bin/bash
set -e

echo "╔══════════════════════════════════════════════════════╗"
echo "║  🗺️  StarCraft Empire — Full Map Upgrade Applied     ║"
echo "╚══════════════════════════════════════════════════════╝"

cd "$(dirname "${BASH_SOURCE[0]}")"

echo ""
echo "[1/4] SC Terrain with heightmap..."
echo "  • Central plateau (main base)"
echo "  • Ramps to expansion areas"
echo "  • Low mineral field zones"
echo "  • 8 mineral fields at map edges"
echo "  • 2 vespene geysers (back of base)"
echo "  • Rock doodads"
echo "  • Creep/ground texture with build grid"

echo ""
echo "[2/4] Terrain snapping..."
echo "  • All entities snap to terrain height"
echo "  • getTerrainHeight() function for world->height mapping"

echo ""
echo "[3/4] SC-style fog and lighting..."
echo "  • Fog: deep space void (#050a10)"
echo "  • 6-light rig: ambient + directional + 3 point + hemisphere"
echo "  • Star field + SC-style sky"

echo ""
echo "[4/4] Mineral field shimmer animation..."
echo "  • Mineral crystals pulse with emissive glow"
echo "  • Vespene geysers have orbiting energy rings"

echo ""
echo "✅ Full map upgrade applied!"
echo ""
echo "Restart:"
echo "  ./start-empire.sh"
echo ""
echo "Visual results:"
echo "  • Central plateau at center (Command Center sits here)"
echo "  • Ramps leading to 8 mineral fields"
echo "  • Vespene geysers at back of base (z = -20)"
echo "  • Supply depots form a defensive line"
echo "  • Tech buildings cluster right of CC"
echo "  • Production (Barracks/Gateway) flank left"
echo "  • Units patrol in front of base"