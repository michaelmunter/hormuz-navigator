# Hormuz Navigator — Backlog

- **Transition polish**
  - Keep the mines-to-transit handoff smooth and readable.
  - Route should draw, hold, fade, then ship movement should begin.
  - Check for edge cases on both outbound and return legs.

- **Multi-sector route clearing**
  - Expand from one tactical sector to two or three linked sectors.
  - Preserve whole-board readability rather than introducing camera movement.
  - Transit should run continuously across all cleared sectors.

- **Opener quality**
  - Keep reducing first-move guess states in the minefield opener.
  - Prefer real mine placement shaping over fake reveal restrictions.
  - Make the first frontier feel readable without making the opener trivial.

- **Swimmer dependency softening**
  - Add future support systems that reduce total dependence on the Swimmer without removing risk.
  - Likely candidates:
    - sonar
    - specialist support slot
    - recon / mine-detection upgrade

- **Destination port identity**
  - Decide whether destination ports are:
    - pure flavor labels, or
    - mechanically distinct ports with different prices / risk / travel time
  - If they stay mostly cosmetic, simplify the presentation accordingly.

## Later

- **Port-side story/events**
  - Add between-run events, rumors, and crew drama.
  - Use them to support market flavor, crew flavor, and special opportunities.

- **Market manipulation**
  - If market play grows, prefer event- or crew-driven interaction over a generic wait button.
  - Good candidates:
    - hacker / broker-type crew
    - port bar rumor system
    - one-shot market nudges rather than passive camping

- **Equipment / support systems**
  - Add purchasable modules only when ship loss, crew roles, and economy make them meaningful.
  - Equipment should reinforce role identity, not replace it.

- **Shadow fleet / alternate routes**
  - Only pursue this once the main Hormuz loop is stable.
  - Treat it as a second campaign layer, not a premature content branch.

## UI / UX Polish

- Tune map/modal composition on large desktop screens.
- Keep top bar, board, and news ticker feeling like one layout.
- Improve hover cards and tactical readability where needed.
- Continue tightening route-clearing and transit feedback without adding clutter.

## Cleanup

- Remove stale comments and terminology that still imply the old scaling model.
- Audit `GAME.md` and code comments whenever major systems change direction.
- Remove dead compatibility code once the new flow is stable.

## Distribution

- **GitHub Pages** — demo / portfolio build
- **itch.io** — primary home base
- **Newgrounds / GameJolt** — community discovery
- **CrazyGames / Poki** — only after the core loop and integration requirements are mature
