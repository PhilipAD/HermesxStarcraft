# Hermes x StarCraft

Hermes x StarCraft adds a StarCraft Remastered operations view to the Hermes dashboard. It renders a live Hermes installation as a StarCraft base after a Remastered-style boot flow: title splash, campaign race selection, loading screen, then the Titan/OpenBW iframe.

This package vendors the Hermes StarCraft dashboard integration and a modified Titan Reactor/OpenBW renderer so the Hermes dashboard can embed the view as another tab.

## What It Does

The dashboard reads a local Hermes home directory and turns operational state into StarCraft entities. Terran remains the baseline mapping:

- `CommandCenter`: the user's Hermes agent identity core. The label is pulled from Hermes config when available, with a generic `Hermes Agent` fallback.
- `SCV`: 4 base workers plus 1 per enabled cron job.
- `Marine`: active sessions from the Sessions page, live in the last 5 minutes.
- `Firebat`: heavier/high-tool-use active sessions.
- `Ghost`: running summoned external-agent providers, capped at 6.
- `Factory`: enabled skill categories from the Skills page.
- `Refinery`: configured API key groups: LLM providers, Tool APIs, and Platform tokens.
- `Barracks`: chat/session operating layer.
- `Academy`, `EngineeringBay`, `ScienceFacility`: config, skill, analytics, token, and cost intelligence.
- `MissileTurret`, `Bunker`, `ComsatStation`: logs, monitoring, health, and defensive controls.
- `Starport`, `ControlTower`, `Dropship`, `ScienceVessel`: gateway/platform/network and analytics reach.

The boot flow loads all art dynamically from the user's local StarCraft Remastered install through the CASC HTTP server:

- Splash: `SD\glue\title\title.DDS` via `?png=1`.
- Race selection: `SD\glue\campaign\prot.webm`, `terr.webm`, and `zerg.webm`.
- Loading screen: `SD\glue\palnl\backgnd.DDS` via `?png=1`, with a bottom-centered loading indicator.

Selecting a race changes the entity scTypes streamed into Titan while preserving the same Hermes semantic roles:

- Terran uses the original Command Center model: `CommandCenter`, `SCV`, `Refinery`, `Barracks`, `Factory`, `Starport`, `Marine`, `Firebat`, `Ghost`, `ScienceVessel`, and related Terran structures.
- Zerg uses a biological Hermes model: `Hatchery -> Lair -> Hive` for the evolving identity core, `Drone` workers, `Extractor` providers, `Zergling` short sessions, `Hydralisk` heavier sessions, `Defiler` deep analysis, `Overlord` capacity/observability, `EvolutionChamber` skills, `DefilerMound` analytics, `UltraliskCavern` apex operations, `NydusCanal` routing, and `SporeColony` / `SunkenColony` monitoring and defense.
- Protoss uses a precision-depth Hermes model: `Nexus` as the identity core, `Probe` cron workers, `Assimilator` providers, `Pylon` capacity, `Zealot` standard sessions, `Dragoon` heavy/API sessions, `DarkTemplar` background agents, `RoboticsFacility` toolsets, `Observer` analytics/monitoring, `Forge` skill upgrades, `Stargate -> FleetBeacon -> Carrier` platform reach, and `ArbiterTribunal -> Arbiter` apex coordination.

## How It Works

Titan Reactor originally works as a StarCraft map and replay viewer: it loads StarCraft data, lets OpenBW simulate a map or replay, and renders the units that already exist in that game state.

Hermes x StarCraft keeps Titan as the renderer, but changes who drives the world. Instead of waiting for a replay to provide units, the Hermes dashboard sends a live list of Hermes-derived entities into the Titan iframe. Titan then spawns, updates, and removes real OpenBW units so the loaded map becomes a live visualization of the user's Hermes agent.

Simple flow:

```text
Hermes files + state.db
  -> HermesStateReader
  -> EntityMapper
  -> bridge WebSocket
  -> dashboard entity store
  -> Titan iframe postMessage
  -> Hermes entity bridge inside Titan
  -> OpenBW units/buildings on the map
```

The main pieces are:

- `packages/starcraft-dashboard/server/hermesState.ts` reads Hermes state from SQLite, config, skills, cron jobs, memories, logs, and environment-derived integrations.
- `packages/starcraft-dashboard/server/entityMapper.ts` converts Hermes state into StarCraft concepts such as `CommandCenter`, `SCV`, `Marine`, `Factory`, `Refinery`, `Ghost`, and observability buildings.
- `packages/starcraft-dashboard/server/index.ts` polls Hermes every few seconds and streams snapshots or deltas to the viewer over WebSocket.
- `packages/starcraft-dashboard/src/viewer/TitanGameClient.tsx` embeds Titan, chooses a map from the user's StarCraft install, receives Hermes entities, applies race/edit-mode overrides, and posts `hermes:entities` into the iframe.
- `packages/titan-reactor/src/core/world/world-composer.ts` installs the Hermes bridge after Titan creates the OpenBW world, making the map controllable by Hermes messages.
- `packages/titan-reactor/src/core/world/hermes-entity-bridge.ts` receives `hermes:entities` and creates the matching OpenBW unit or building.
- `packages/titan-reactor/src/core/world/hermes-base-layout.ts` lays the base out around the player start location, near real mineral patches and geysers.
- `packages/titan-reactor/src/core/world/hermes-unit-behavior.ts` makes the scene feel alive by issuing low-frequency orders such as SCV gathering and patrol movement.

Building support required a small OpenBW/Titan adaptation. Mobile units use OpenBW's normal unit creation path. Buildings use a completed-building creation path so real structures can appear reliably without being blocked by normal melee placement checks during dashboard rendering. Placement validation is still used where possible so edited positions do not crash or overlap obvious invalid terrain.

Edit mode is stored locally in the browser under `hermes.titan.editLayout.v1`. It lets a user select buildings, change their StarCraft type, nudge positions, and reload with those positions preserved. Some building type changes are intentionally applied on reload because live-mutating OpenBW buildings is less stable than recreating the scene cleanly.

## Repository Layout

```text
HermesxStarcraft/
  packages/starcraft-dashboard/   # Hermes state bridge, viewer, CASC HTTP server, dashboard integration
  packages/titan-reactor/         # Titan Reactor/OpenBW renderer with Hermes world bridge
  plugins/hermesxstarcraft/       # Hermes dashboard plugin tab
  scripts/                        # local install/start helpers
  .env.sample                     # copy/edit for local config
  .env                            # local non-secret defaults for this checkout
```

## Requirements

- A working Hermes installation on the same machine.
- A legally owned local installation of StarCraft Remastered.
- Node.js 20 or newer.
- npm.
- Git LFS content resolved for `packages/titan-reactor/src/openbw/titan.wasm.js`.
- Native build tools for `bw-casclib` if your platform needs to rebuild the CASC reader.
- A browser with WebGL support. Use `TITAN_WEBGL_COMPAT=1` on VM/llvmpipe systems if needed.

## Legal And Distribution Notes

This package must not include Blizzard game assets. It does not need to ship StarCraft sprites, sounds, maps, MPQ/CASC archives, or copied game installation files. At runtime, the CASC HTTP server reads assets from the user's own StarCraft Remastered installation pointed to by `SC_ROOT`.

Users must own a valid copy of StarCraft Remastered. This project is not affiliated with, endorsed by, sponsored by, or approved by Blizzard Entertainment. StarCraft and Blizzard Entertainment are trademarks or registered trademarks of Blizzard Entertainment, Inc.

This package includes a modified/pinned Titan Reactor tree. Titan Reactor is an OpenBW 2.5D StarCraft map and replay viewer; the upstream README also states that it requires a purchased copy of StarCraft Remastered and uses an asset server that reads from the local StarCraft install. See the upstream project: <https://github.com/alexpineda/titan-reactor>.

Before creating a public repository, verify the redistribution license for the Titan Reactor snapshot and the OpenBW/WASM files in `packages/titan-reactor`. If an explicit compatible license is not present, publish this as a patch/integration wrapper that asks users to clone Titan Reactor themselves, or obtain permission before redistributing the vendored renderer. See `THIRD_PARTY_NOTICES.md`.

Titan/OpenBW runtime binaries are intentionally not committed here. If a checkout needs refreshed `bundled/titan.wasm`, `bundled/titan.wasm.*`, or other generated renderer artifacts, rebuild them locally from `packages/titan-reactor` instead of copying binaries or StarCraft install files into Git.

## Configure

Copy the sample and set your local StarCraft path:

```bash
cp .env.sample .env
```

Edit `.env`:

```bash
HERMES_HOME=$HOME/.hermes
SC_ROOT="/path/to/your/StarCraft"
CASC_PORT=8080
TITAN_STUB_RUNTIME_PORT=8090
TITAN_STUB_PLUGINS_PORT=8091
```

Do not put API keys or secrets in this package's `.env`. Hermes credentials stay in the normal Hermes home.

## Install

```bash
cd HermesxStarcraft
npm run install:all
npm run install:plugin
```

`install:plugin` registers the Hermes dashboard tab by creating a symlink:

```text
~/.hermes/plugins/hermesxstarcraft -> ./plugins/hermesxstarcraft
```

Restart the Hermes dashboard or rescan dashboard plugins after installing.

## Run

```bash
cd HermesxStarcraft
npm run start
```

Then open the Hermes dashboard and choose the `Hermes x StarCraft` tab.

Direct view:

```text
http://127.0.0.1:9120/?titan=1
```

The direct view now starts at the dynamic StarCraft Remastered splash instead of Titan's default Wraith home scene. Game assets are requested at runtime from the local CASC server and are not vendored into this repository.

Default local ports:

- `9120`: Hermes x StarCraft dashboard viewer
- `9121`: Hermes bridge API/WebSocket
- `3344`: Titan/OpenBW renderer
- `8080`: StarCraft CASC asset HTTP server
- `8090`: Titan runtime stub
- `8091`: Titan plugin stub

## Environment Variables

- `HERMES_HOME`: Hermes data directory. Default: `~/.hermes`.
- `SC_ROOT`: required path to StarCraft Remastered.
- `TITAN_ROOT`: optional override for the Titan renderer. Default: `./packages/titan-reactor`.
- `CASC_PORT`: CASC asset HTTP port. Default: `8080`.
- `TITAN_STUB_RUNTIME_PORT`: runtime stub port. Default: `8090`.
- `TITAN_STUB_PLUGINS_PORT`: plugin stub port. Default: `8091`.
- `TITAN_WEBGL_COMPAT=1`: optional safer WebGL mode for VMs.

## What Not To Commit

The package is intended to exclude:

- `node_modules/`
- build outputs such as `dist/`
- local env/generated files, except `.env.sample`
- `packages/titan-reactor/.env.development.local`
- `packages/starcraft-dashboard/starcraft-install.path`
- StarCraft game assets or install files
- extracted analysis output from `packages/starcraft-dashboard/analysis/`
- exported CASC samples or Remastered target dumps
- binary game asset formats such as `.dds`, `.pcx`, `.grp`, `.smk`, `.mpq`, and `.casc`
- screenshots, local logs, caches, and Playwright output

## Smoke Check

After install:

```bash
npm run start
```

Expected behavior:

- bridge starts on `9121`
- viewer starts on `9120`
- Titan starts on `3344`
- CASC server starts on `8080`
- Hermes dashboard tab loads an iframe pointed at `http://127.0.0.1:9120/?titan=1`

If the iframe is blank, first confirm `SC_ROOT` points at a valid StarCraft Remastered install and that `packages/titan-reactor/src/openbw/titan.wasm.js` is not a Git LFS pointer.
