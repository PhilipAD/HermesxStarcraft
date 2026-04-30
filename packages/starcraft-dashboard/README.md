# Hermes StarCraft Dashboard

Real-time 3D StarCraft-style visualization of your Hermes Agent — every skill, session, cron job, and memory entry rendered as units and buildings on a living battle map.

**Architecture:** Zero Hermes core changes. Fully standalone. Reads from `~/.hermes/state.db` (SQLite) + filesystem.

```
┌─────────────────────────────────────────────────────┐
│  Hermes StarCraft Dashboard                         │
│                                                     │
│  ┌──────────────┐    ┌──────────────────────────┐  │
│  │ Hermes Agent │───→│ Bridge (port 9121)       │  │
│  │ ~/.hermes/   │    │  • Reads SQLite + fs     │  │
│  └──────────────┘    │  • Maps → SC entities    │  │
│                      │  • Pushes WS deltas      │  │
│                      └────────────┬─────────────┘  │
│                                   │                │
│                      ws://127.0.0.1:9121/ws        │
│                                   │                │
│                      ┌────────────▼─────────────┐  │
│                      │ Viewer (port 9120)       │  │
│                      │  • Three.js 3D scene      │  │
│                      │  • React + @react-three  │  │
│                      │  • Force-directed layout │  │
│                      └──────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

## Quick Start

```bash
cd ~/.hermes/starcraft-dashboard
./start.sh
```

Then open **http://127.0.0.1:9120** in your browser.

## Or Docker

```bash
docker compose up --build
```

## Entity Map

| Hermes Concept | SC Representation | Cluster |
|---|---|---|
| Core Agent | Command Center (upgrades with tier) | Command |
| Skills | Tech Buildings (Engineering Bay) | Tech |
| Sessions | Barracks + Marines | Combat |
| Memory | Supply Depots | Storage |
| Cron Jobs | SCVs (patroling) | Worker |
| Compute/Tokens | Vespene Gas Geysers | Resource |
| Errors | Bunkers (smoke effect) | Alerts |
| Sub-agents | Gateways + Zealots | Army |

## API Endpoints

- `GET /api/health` — Bridge health + stats
- `GET /api/state` — Current entity snapshot
- `GET /api/state/full` — Full Hermes state + mapped entities
- `WS /ws` — WebSocket for real-time deltas

## Project Structure

```
starcraft-dashboard/
├── server/
│   ├── index.ts        — Express + WebSocket bridge
│   ├── hermesState.ts  — Reads Hermes SQLite/fs
│   ├── entityMapper.ts  — Maps Hermes → SC entities
│   └── deltaEngine.ts   — Computes minimal deltas
├── src/viewer/
│   ├── App.tsx         — Main React app
│   ├── components/
│   │   ├── Scene.tsx    — Three.js 3D scene
│   │   ├── HUD.tsx      — Top bar overlay
│   │   ├── EntityPanel.tsx — Entity info panel
│   │   └── PerformanceMonitor.tsx
│   ├── hooks/
│   │   ├── useWebSocket.ts — WS client
│   │   └── useFPS.ts
│   ├── workers/
│   │   └── layout.worker.ts — Force-directed layout
│   └── store.ts        — Zustand state
├── config/
│   └── mapping.json    — Declarative entity mapping
└── tests/
    ├── unit.test.ts
    └── integration.test.ts
```

## Performance

- Max 60 FPS active, 10 FPS idle, 0 FPS hidden
- Delta-only WebSocket payloads (<1 KB per update)
- Web Worker for layout computation
- Instanced meshes for units
- Tested with 500+ simulated entities
