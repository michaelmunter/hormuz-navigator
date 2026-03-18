# Hormuz Navigator — Backlog

Upcoming PRs in rough dependency order. Each builds on the previous.

## PR 2: Dockside Menu
Replace barrel-selection overlay with dockside screen. Ship purchase, crew hire, equipment buy, role assignment. First game auto-buys Rustbucket + Captain + Trainee from starting funds.

## PR 3: Tanker Tiers
Implement ship tiers (Rustbucket → VLCC). Ship grid width affects required corridor in minesweeper. Cargo value replaces score multiplier. Deduct ship cost from bank on purchase. Lose ship + equipment on destruction.

## PR 4: Crew System
Persistent crew with portraits from sprite pool. Roles: Captain, Trainee, Gunner, Navigator, Engineer, Broker. Permadeath for Trainee on mine hit. Shipwreck survivor events with random narrative. Character quirks (minor stat modifiers).

## PR 5: Equipment Slots
Purchasable modules: Auto-Fire, Mine Sensor, CIWS, Market Terminal, Armor Plating, Radar Array. Crew + equipment synergy (paired role boosts effect). Lost on ship destruction.

## PR 6: Turn-Based Difficulty Scaling
`G.player.turn` drives mine density and transit threat intensity. Early runs forgiving, later runs demand precision. Remove barrel-based difficulty entirely.

## PR 7: Timed Mode
Optional real-time pressure during minesweeper phase. Turn-based difficulty increase happens by wall clock instead of per-run. Clearing mines becomes a race.

## Cleanup & Polish (non-blocking)
- Remove `G.cumulativeScore` once all display code reads `G.player.bank` directly
- Forced retirement when bank < cheapest ship + crew cost
- Leaderboard rework (show player name, tanker reached, turns survived)
- Sound design pass (crew voice lines, market terminal sounds)
