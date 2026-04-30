# Third-Party Notices

## Titan Reactor

This package includes a modified/pinned copy of Titan Reactor under:

`packages/titan-reactor`

Titan Reactor is an OpenBW 2.5D StarCraft map and replay viewer. Upstream project:

<https://github.com/alexpineda/titan-reactor>

The upstream README describes Titan Reactor as a WebGL renderer and plugin system that depends on a purchased copy of StarCraft Remastered and an asset server that reads from the local StarCraft install.

Before publishing a public repository, confirm the exact upstream license for the Titan Reactor snapshot you are distributing. If no explicit license is present in the copied snapshot, do not assume permissive redistribution rights; either obtain permission, preserve the fork privately, or replace the vendored copy with installer instructions that clone the upstream repository and then apply this package's Hermes integration patches.

## OpenBW / WASM

The Titan Reactor copy includes OpenBW JavaScript/WASM runtime files under:

`packages/titan-reactor/src/openbw`

Before publishing, confirm the license and redistribution terms for the OpenBW fork and the generated WASM artifacts in this snapshot. Keep the source notice and license files required by that project.

## StarCraft Remastered Assets

This repository must not include Blizzard/StarCraft game assets, CASC data, maps, MPQ/CASC archives, sprites, sounds, or copied installation files.

At runtime, the local CASC server reads assets from the user's own StarCraft Remastered installation via `SC_ROOT`. Users must own a valid copy of StarCraft Remastered and point the package at that local install.

StarCraft and Blizzard Entertainment are trademarks or registered trademarks of Blizzard Entertainment, Inc. This project is not affiliated with, endorsed by, sponsored by, or approved by Blizzard Entertainment.
