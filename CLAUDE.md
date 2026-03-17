# Hormuz Navigator

A Minesweeper game set in the Strait of Hormuz. The playable grid covers only the ocean area, determined by transparent pixels in the satellite image. The win condition is clearing a connected path of ocean cells from the left edge to the right edge.

## Tech Stack

Single `index.html` with inline CSS and JS. No build step, no dependencies. Hosted on GitHub Pages at https://michaelmunter.github.io/hormuz-navigator/

## Key Files

- `index.html` — the entire game (HTML + CSS + JS)
- `hormuz.png` — satellite image with transparent ocean, opaque land
- `.github/workflows/pages.yml` — GitHub Pages deployment workflow

## How It Works

1. The PNG is drawn to a hidden canvas and sampled per grid cell. Cells where >50% of pixels are transparent are marked as ocean (playable).
2. Mines are placed randomly across ocean cells (25% density).
3. A BFS verifies a mine-free path exists from left to right. If not, mines are carved along a route to guarantee solvability.
4. The game canvas renders classic Windows Minesweeper-style raised/sunken cells over ocean areas. Land areas are transparent, showing the satellite map beneath.
5. First click is always safe. Chord-clicking (clicking a revealed number when adjacent flags match) is supported.

## Dev Server

`python3 -m http.server 8080` — configured in `.claude/launch.json` as "dev".

## Deployment

Push to `main` triggers GitHub Actions workflow that deploys to GitHub Pages.
