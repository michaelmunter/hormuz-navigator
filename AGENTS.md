# Hormuz Navigator

A multi-phase game set in the Strait of Hormuz. Phase 1 is Minesweeper on the ocean grid. Phase 2 is a ship transit where you dodge missiles and destroy shaheds. See `GAME.md` for full game design.

## Tech Stack

Zero dependencies, no build step. Separate JS files under `js/` loaded via `<script>` tags with a shared `window.Game` namespace. Hosted on GitHub Pages at https://michaelmunter.github.io/hormuz-navigator/

## File Structure

```
index.html          — HTML shell, CSS, canvas setup, modal overlays
js/
  map.js            — Image loading, ocean mask building, pathfinding (BFS)
  ships.js          — Ship tier definitions (Rustbucket → Whale)
  roles.js          — Role definitions (Captain, Swimmer, etc.), phase filtering, lookup helpers
  crew.js           — Character pool, portraits, hire/dismiss, role assignment
  worldmap.js       — World map with port dots, destination selection, GO button
  dock.js           — Dock screen UI (ship panel, crew bar, voyage summary, news)
  renderer.js       — Canvas drawing: cells, mines, flags, ship, missiles, shaheds, HP bar
  minesweeper.js    — Mine placement, reveal, flood fill, numbers, win check
  transit.js        — Ship movement, missile/shahed spawning, collision, difficulty config
  input.js          — Mouse, touch, keyboard handlers
  game.js           — State machine, init, scoring, phase transitions, tactical crew bar
hormuz.png          — Satellite image with transparent ocean, opaque land
hormuzfilled.png    — Same satellite with visible blue ocean (no transparency), used for ocean tint
GAME.md             — Full game design document
test.js             — Lightweight tests (node:test)
sw.js               — Service worker (cache-first)
manifest.json       — PWA manifest
```

## Architecture

Game state machine: `MENU → MINESWEEPER → TRANSIT_FORWARD → TRANSIT_RETURN → SCORE`

All modules use IIFE pattern writing to `window.Game` namespace. Load order matters:

1. map.js (defines `Game` namespace, CELL constant, image loading, ocean mask, pathfinding)
2. ships.js (ship tier data)
3. roles.js (role definitions — MUST load before crew.js)
4. crew.js (character pool, hire/dismiss, role cycling)
5. worldmap.js (destination selection, port dots on map image)
6. dock.js (dock screen rendering, ship panel, voyage summary)
7. renderer.js (canvas setup, cell/ship/missile drawing)
8. minesweeper.js (mine logic, reveal, win check)
9. transit.js (ship transit, missiles, shaheds, difficulty tables)
10. input.js (event handlers)
11. game.js (state machine, init, scoring, tactical crew bar — triggers on image load)

## Key Algorithms

- **Dynamic grid**: Grid grows with turn count — 35×21 at turn 0, scaling linearly to 45×27 by turn 10 (`getGridSize(turn)` in map.js). CELL pixel size scales to fill viewport, clamped [16, 38]px. Same board on every screen at a given turn.
- **Ocean mask**: Sample PNG transparency per CELL-sized tile, threshold >30% transparent = ocean
- **Mine placement**: Random placement, then BFS to verify path exists. If blocked, carve path by removing mines.
- **Transit path**: BFS through revealed cells to find shortest left→right route for ship
- **Difficulty scaling**: Barrel count (10/25/50/100) controls mine ratio, ship speed, HP, missile/shahed rates, and score multiplier

## Canvas Layers (z-index order)

1. `oceanBgCanvas` (z:0) — hormuzfilled.png at 100% opacity (base ocean color)
2. `gameCanvas` (z:1) — minesweeper cells / ship / projectiles
3. `oceanOverlayCanvas` (z:2) — hormuzfilled.png at 50% opacity (tints game cells)
4. `mapCanvas` (z:3) — hormuz.png at 100% (land covers everything, transparent ocean shows through)

## Platform Support

Desktop only (keyboard + mouse). Mobile/touch is explicitly out of scope — the UI, tile sizes, and control scheme all assume a desktop viewport. Do not add mobile layouts, touch controls, or responsive breakpoints. If mobile support is ever added it will be a dedicated effort with its own maps and UI.

## Dev Server

`python3 -m http.server 8080` — configured in `.Codex/launch.json` as "dev".

## Testing

`node test.js` — uses node:test, tests core algorithms (hasPath, findCarvePath, computeNumbers, placeMinesWithPath).

## Deployment

Push to `main` triggers GitHub Actions workflow that deploys to GitHub Pages.

## Distribution

- **GitHub Pages** — demo/portfolio link: https://michaelmunter.github.io/hormuz-navigator/
- **itch.io** — primary home base. Free, good SEO, game jam traffic. Zip and upload.
- **CrazyGames / Poki** — ad revenue portals (pay per play). Requires their SDK for ad breaks between rounds.
- **Newgrounds** — active community with built-in ad revenue sharing.
- **GameJolt** — discovery platform, similar to itch.
