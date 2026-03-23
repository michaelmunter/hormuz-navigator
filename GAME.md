# Hormuz Navigator

Hormuz Navigator is a multi-phase game about forcing oil shipments through an increasingly dangerous Strait of Hormuz.

The player manages a tanker, hires crew, clears a safe passage through mined waters, then sails that route while surviving drones and missiles. The campaign expands over time as the mined area spreads outward from the strait into the wider Gulf.

## Core Loop

1. Prepare at port.
2. Clear a route through one or more minefield sectors.
3. Sail the full stitched route to the destination port.
4. Sell cargo on arrival.
5. Sail home through a return route.
6. Repair, replace crew, upgrade, and repeat under rising regional tension.

## Campaign Structure

The early game uses a single tactical minefield. Later weeks expand the theater into multiple linked sectors.

The fiction is that Iranian mining operations are spreading outward. The game expression of that is:

- more sectors to clear before a run is safe
- wider visible geography over time
- higher transit threat once the route is being sailed

This is intended to feel like escalation, not arbitrary level scaling.

## Phase 1: Route Clearing

Phase 1 is no longer framed as classic Minesweeper. It is route expansion.

Each voyage consists of one or more minefield sectors. A sector is complete when the player has opened a connected safe route from that sector's entry edge to its exit edge.

### Sector Rules

- Each sector has an entry side and an exit side.
- The player starts with a small revealed safe foothold on the entry side.
- The player may reveal any hidden tile adjacent to any previously cleared safe tile.
- The player is not restricted to only the most recently cleared tile.
- Flags may still be used to mark suspected mines.
- Number clues appear on revealed safe tiles as usual.
- A sector is won when the connected safe network reaches the exit edge.

This keeps the swimmer fiction intact without forcing the system into a one-frontier puzzle. The swimmer is understood to be able to swim back through already secured water and continue clearing from any previously safe point.

### Mine Placement

- Mines are generated per sector.
- Each sector must always contain at least one valid safe route from entry to exit.
- The intended challenge is deduction and route choice, not soft-locking the player into impossible geometry.

### Entry And Opener

- The route should begin where the ship actually enters the sector, not from an arbitrary point on the edge.
- The starting foothold may vary along the entry side so runs do not always open from the same place.
- The opener should usually provide enough information to support deduction rather than forcing a blind guess on the first move.
- Early ambiguity is acceptable, but the first impression of a sector should be "read the water and choose a line," not "flip a coin."

### Information And Risk

The route-clearing phase should usually reward deduction, but it does not need to be perfectly information-complete.

- Most progress should come from reading the board and making defensible decisions.
- Some positions may still force an ambiguous choice where the player cannot know the answer with certainty.
- Those moments are intentional and should create operational tension, not just puzzle frustration.

When information runs out, the player should have meaningful ways to absorb risk:

- risk the Swimmer
- retreat and lose time to hire a replacement
- later rely on support tools such as sonar
- in desperate cases, let the ship take over and accept that a wrong guess can sink it

The game is not trying to be pure deterministic Minesweeper. It is a logistics-and-risk game that uses Minesweeper logic.

### Multi-Sector Progression

- Early runs may use one sector.
- Mid and late runs can chain two or three sectors.
- Completing one sector advances the clearing operation to the next.
- When all sectors are cleared, the route is considered ready for transit.

### Map Direction

- Early game can stay focused tightly on the strait.
- As the campaign escalates, the visible theater can widen into more of the Gulf.
- Expansion can come from either wider framing, more sectors, or both.
- The goal is to make Iranian mine expansion feel geographic and strategic, not just like a larger abstract puzzle grid.
- The board should keep a stable on-screen footprint. Escalation should change map framing and cell scale within that frame, not make the HTML play area jump in size.
- Escalation should be authored as timeline tiers or campaign beats, not applied as tiny visual resizes every week.
- If the framing changes, it should transition smoothly when moving from one tier to the next.

The player should feel like they are establishing a corridor through contested waters, not solving isolated boards with no continuity.

## Swimmer Role

The Swimmer is the dedicated mine-clearing specialist.

### With a Swimmer

- Revealing a mined tile kills the swimmer.
- The sector remains in its current state.
- If another Swimmer is available later, the player can resume clearing from the existing revealed safe network.

### Without a Swimmer

The player is still allowed to continue the voyage, but mine-clearing becomes ship-led rather than swimmer-led.

- The ship may take over the swimmer's role.
- This means the route is effectively being checked by sailing through it.
- If the player guesses wrong and the ship enters a mined tile, the ship is destroyed.

This creates a real decision:

- retreat to port, spend time, and hire a new swimmer
- or press on and gamble the ship on incomplete route knowledge

That tradeoff is intentional and should remain sharp.

### Future Recovery Tools

Later progression may soften total dependence on the Swimmer with support systems such as:

- sonar equipment
- specialist support slots
- reconnaissance or mine-detection upgrades

These should reduce risk, not erase it.

## Phase 2: Transit

Once a full route has been prepared, the ship sails it in real time.

Transit is continuous across all cleared sectors. The game should not stop between sectors once the ship begins the run.

The player must survive:

- FPV drones
- Shaheds
- missiles

Crew roles matter during transit:

- Captain controls movement
- Shotgunner handles close anti-drone defense
- Gunner engages heavier aerial threats
- Navigator and Engineer support survivability and clarity

The route the player carved in Phase 1 is the route the ship now has to trust.

## Port Play

Ports are the economic and roster-management layer.

### Home Port

- buy and load cargo
- repair ship
- hire replacement crew
- upgrade to larger ships
- later: wait for better prices or accept worse margins for speed

### Destination Port

- cargo is sold automatically on arrival
- the sale animates so the player can review the result
- the player then chooses when to sail home

## Crew Philosophy

Crew are hired with an upfront cost, not ongoing salaries.

Why:

- the loop is already driven by cargo risk, ship damage, and permadeath
- recurring wages add bookkeeping more than decision depth
- replacement cost after death already makes crew loss meaningful

Crew should feel like scarce specialists, not payroll entries.

## Market Direction

A future `Wait 1 week` action is expected to become the main market-timing mechanic.

That creates a better strategic layer than salaries:

- wait for better cargo prices
- risk worsening regional danger while doing so
- later manipulate markets through special crew or port interactions

Week advancement should be separated from visual map scaling. Time passing can affect prices, headlines, and strategic tension without automatically resizing the tactical board every single week.

## Design Goals

- Keep the fiction legible: the player is forcing a corridor through a war zone.
- Keep the UI legible: one screen should show one tactical problem clearly.
- Avoid camera-management complexity unless the game truly needs it.
- Prefer sector chaining over large scrollable maps.
- Let escalation feel geographic and political, not just numerical.

## Current Direction Summary

The game is moving toward this structure:

- route-expansion mine clearing instead of pure Minesweeper abstraction
- multi-sector voyages instead of one endlessly rescaled board
- continuous transit across all cleared sectors
- meaningful retreat-or-risk decisions when the Swimmer is lost
- stronger economic timing at port between runs
