# Hormuz Navigator — Backlog

Ordered by priority. Earlier items unblock later ones.

## PR 5: Ship Destruction & Consequences

- Mine hit + no swimmer (or swimmer already used) = ship destroyed
- Swimmer "used up" after saving once per run (permadeath for interns, cooldown for others)
- Transit HP → 0 = ship sunk, equipment + cargo lost
- Shipwreck survivor mechanic: random chance crew survive, short narrative event ("Olaf tamed a shark and rode it back to port")
- Forced retirement when bank < any possible recovery
- Gives the game real stakes before adding equipment

## PR 6: Reusable Modal Component

Extract hire modal into a generic card-list modal. Reuse for:
- Crew hiring (existing)
- Ship purchase/upgrade
- Equipment purchase
- Future: any pick-from-list interaction

## PR 7: Equipment Slots

Purchasable modules with crew synergy. Now meaningful because equipment is lost on ship destruction (PR 5).

| Module | Paired Role | Without Crew | With Crew |
|--------|------------|-------------|-----------|
| Auto-Fire | Gunner | Reduced fire rate | Full auto-fire |
| Mine Sensor | Swimmer | One auto safe reveal | Extra reveals + glow hint |
| CIWS | Engineer | Low intercept | Higher intercept |
| Market Terminal | Broker | Small flat bonus | Full variance (0.8x–1.5x) |
| Armor Plating | Engineer | Base HP bonus | Larger HP bonus |
| Radar Array | Navigator | Basic trajectory | Full early-warning |

## PR 8: Reputation & Economy Polish

- Reputation system: `reputationMultiplier = 1 + 0.1 × totalCrewDeaths`. Crew deaths raise all hire costs.
- Broker cargo variance mechanic: actual 0.8x–1.5x dice roll on delivery
- Insurance: pay massive premium per voyage to protect cargo value. Not available for shadow fleet.
- Turn-based difficulty is already partially implemented (`getDifficulty()`, news escalation phases) — polish and tune.

## PR 9: Bar Events & Story System

- Random narrative events between runs (AI-generated or from a pool)
- Crew drama, port gossip, market rumors
- Bar events can unlock special options (shadow fleet, rare crew, tips)
- Display in left panel or as modal between runs

## PR 10: Shadow Fleet

- Unlocked via crew perk or bar event (PR 9)
- Shadow fleet = unregistered tanker running sanctioned oil
  - Higher profit multiplier, no insurance
  - Additional threat types (coast guard interdiction?)
  - Purchase dedicated shadow ship OR retrofit current ship
- Shadow fleet routes unlock new destinations (North Korea, Venezuela)
- Naturally introduces a second ship concept without full fleet management

## PR 11: Peace Date & Endgame

Game ends at a fixed "peace date" (finite horizon). Creates time pressure — how much can you earn before the window closes? Final score = bank balance at peace. Displayed in crew bar as countdown.

## PR 12: Timed Mode

Optional real-time pressure during minesweeper phase. Difficulty increases by wall clock instead of per-run. Clearing mines becomes a race.

## Dock & Tactical — Remaining Polish

- High-res world map image + recalibrate port dot coordinates
- Map unlocking: bigger map region visible with higher-tier ships (progression feel)
- Port availability gating: ship tier, crew traits, news escalation phase
- First-voyage tutorial modal: explain minesweeper + transit controls before first run
- Pillarbox ultrawide verification at various aspect ratios

## Cleanup (non-blocking)

- Remove `G.cumulativeScore` once all display code reads `G.player.bank` directly
- Leaderboard rework (show player name, tanker reached, turns survived)
- Sound design pass (crew voice lines, market terminal sounds)
- Background music: AI-generated .ogg ambient loops per port/phase, crossfade music manager on Web Audio API. Lazy-load port tracks on dock to stay under Poki 8MB initial load. ~3–5MB total budget.

## Distribution

- **itch.io** — zip and upload, primary home base
- **CrazyGames / Poki** — requires their SDK for ad breaks between rounds (needs tile scaling first)
- **Newgrounds** — built-in ad revenue sharing
- **GameJolt** — discovery platform
