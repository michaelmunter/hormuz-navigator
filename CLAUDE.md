# Hormuz Navigator

A multi-phase game set in the Strait of Hormuz. Phase 1 is Minesweeper on the ocean grid. Phase 2 is a ship transit where you dodge missiles and destroy shaheds. See `GAME.md` for full game design.

## Tech Stack

Zero dependencies, no build step. Separate JS files under `js/` loaded via `<script>` tags with a shared `window.Game` namespace. Hosted on GitHub Pages at https://michaelmunter.github.io/hormuz-navigator/

## File Structure

```
index.html          — HTML shell, CSS, canvas setup, modal overlays
js/
  map.js            — Image loading, ocean mask building, pathfinding (BFS)
  renderer.js       — Canvas drawing: cells, mines, flags, ship, missiles, shaheds, HP bar
  minesweeper.js    — Mine placement, reveal, flood fill, numbers, win check
  transit.js        — Ship movement, missile/shahed spawning, collision, difficulty config
  input.js          — Mouse, touch, keyboard handlers
  game.js           — State machine, init, scoring, phase transitions, service worker
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
2. renderer.js (canvas setup, cell/ship/missile drawing)
3. minesweeper.js (mine logic, reveal, win check)
4. transit.js (ship transit, missiles, shaheds, difficulty tables)
5. input.js (event handlers)
6. game.js (state machine, init, scoring — triggers on image load)

## Key Algorithms

- **Ocean mask**: Sample PNG transparency per 20px cell, threshold >30% transparent = ocean
- **Mine placement**: Random placement, then BFS to verify path exists. If blocked, carve path by removing mines.
- **Transit path**: BFS through revealed cells to find shortest left→right route for ship
- **Difficulty scaling**: Barrel count (10/25/50/100) controls mine ratio, ship speed, HP, missile/shahed rates, and score multiplier

## Canvas Layers (z-index order)

1. `oceanBgCanvas` (z:0) — hormuzfilled.png at 100% opacity (base ocean color)
2. `gameCanvas` (z:1) — minesweeper cells / ship / projectiles
3. `oceanOverlayCanvas` (z:2) — hormuzfilled.png at 50% opacity (tints game cells)
4. `mapCanvas` (z:3) — hormuz.png at 100% (land covers everything, transparent ocean shows through)

## Dev Server

`python3 -m http.server 8080` — configured in `.claude/launch.json` as "dev".

## Testing

`node test.js` — uses node:test, tests core algorithms (hasPath, findCarvePath, computeNumbers, placeMinesWithPath).

## Deployment

Push to `main` triggers GitHub Actions workflow that deploys to GitHub Pages.
