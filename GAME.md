# Hormuz Navigator — Game Design

## Overview

Navigate oil tankers through the Strait of Hormuz in a multi-phase game combining Minesweeper strategy with real-time action. Hire crew, equip your ship, haul oil, retire rich — or watch it all sink.

## Core Loop

```
HIRE CREW → BUY/EQUIP TANKER → MINESWEEPER → TRANSIT_FORWARD → TRANSIT_RETURN → SELL OIL
                                                    ↓ (ship destroyed)
                                                LOSE SHIP + EQUIPMENT + CARGO
                                                Surviving crew return (maybe)
                                                → BUY NEW TANKER (if funds remain)
```

## Difficulty Scaling

There is no difficulty selector. Difficulty scales naturally through three axes:

1. **Tanker tier** — Bigger ships carry more oil and are worth more, but are wider on the navigation grid (need a bigger cleared corridor) and attract heavier Iranian attacks (more missiles, more shaheds). Mine density is NOT affected by tanker tier.

2. **Turns played** — Each successive run increases mine density and transit threat intensity. Early runs are forgiving; later runs demand precision.

3. **Timed mode** (optional) — If enabled, the turn-based difficulty increase happens in real time instead, so the minesweeper phase has time pressure. Clear those mines fast or face a harder transit.

## Tanker Tiers

Ships are purchased with earnings. Each ship has a size, cargo capacity, base speed, crew capacity, and equipment slots. Bigger ships = bigger payoff but harder gameplay.

| Tier | Name | Class | DWT | Barrels | Ship Cost | Cargo Value | Grid Width | Crew | Slots | Notes |
|------|------|-------|-----|---------|-----------|-------------|------------|------|-------|-------|
| 1 | The Rustbucket | Coastal Tanker | ~10,000 | ~80K | $5M | ~$8M | 1 cell | 2 | 0 | Tutorial ship. Captain + Trainee only. Iran doesn't even bother with you. |
| 2 | The Workhorse | Handymax | ~40,000 | ~300K | $20M | ~$30M | 1-2 cells | 3 | 1 | Room for a Gunner. Shaheds start spawning. |
| 3 | The Canal Runner | Panamax | ~70,000 | ~500K | $40M | ~$50M | 2 cells | 4 | 2 | "Named for the Panama Canal, which is nowhere near here." |
| 4 | The Bread & Butter | Aframax | ~100,000 | ~750K | $55M | ~$75M | 2-3 cells | 5 | 3 | Iran is paying attention now. Full crew. |
| 5 | The Big Boy | Suezmax | ~160,000 | ~1M | $80M | ~$100M | 3 cells | 5 | 4 | Named for the Suez Canal, also not here. |
| 6 | The Whale | VLCC | ~300,000 | ~2M | $120M | ~$200M | 3-4 cells | 5 | 5 | The endgame. One trip doubles your money. One mistake sinks $320M. |

## Crew

Crew members are persistent characters that survive across runs (if they live). Each has a name, a portrait (randomly selected from the sprite pool on hire), and a role. Crew are hired at the dockside and assigned to roles on the ship.

### Roles

| Role | Required | Phase | Effect |
|------|----------|-------|--------|
| **Captain** | Yes (1 per ship) | Transit | Sails the ship. Every ship needs one. |
| **Trainee** | Yes (1 per ship) | Minesweeper | Swims ahead to check cells. Provides safe cell reveals. If the trainee hits a mine, they die and you lose the safe-reveal ability for the rest of the phase. In timed mode, you also lose the time spent. |
| **Gunner** | No | Transit | Shoots shaheds. Shaheds only spawn when a Gunner is aboard — no gunner means no shahed threat, but also no defense when you eventually need one. Fire rate varies by character quirk. |
| **Navigator** | No | Transit | Improves missile trajectory visibility. May reveal shahed spawn points early. |
| **Engineer** | No | Transit | Provides passive bonuses — extra HP, missile intercept chance, or both. |
| **Broker** | No | Delivery | Manipulates oil markets. Cargo value gets a multiplier with variance (e.g. 0.8x–1.5x, averaging above 1.0). The gamble role. |

### Crew Design Principles

- **Persistent**: Crew survive across runs if the ship makes it back. They're yours until they die.
- **Permadeath**: Trainee dies on mine hit. Other crew can potentially die during transit (gunner killed by shahed, etc.) — TBD based on playtesting.
- **Random recruitment**: When hiring, the game offers a selection of randomly generated crew from the sprite pool. Each has a portrait, a name, and a minor stat quirk (e.g. +15% fire rate, +1 HP, slightly better market odds).
- **Shipwreck survivors**: When a ship sinks, there's a random chance crew members survive. Shown as a short narrative event: *"Olaf survived, tamed a shark and rode it back to port."* Survived crew return to your roster for the next ship.
- **Crew capacity**: Ships have a max crew size. Tier 1 fits Captain + Trainee only. Bigger ships fit more specialized roles.

### Character Quirks

Each crew member has a small random stat modifier tied to their character. These are minor but memorable:

- The Baby: +15% fire rate as Gunner (don't ask how)
- The Pirate: +1 base HP as Captain (seen worse)
- The Astronaut: +10% missile intercept as Engineer
- The Grandma: +20% market manipulation range as Broker (insider trading)
- etc. — expanded through the sprite pool

## Equipment Slots

Separate from crew, each tanker has equipment slots for purchased hardware. Equipment is lost when the ship sinks. Crew operates the equipment — having both a Gunner AND Auto-Fire means the gunner uses the auto-fire system for a boosted rate. A Gunner without equipment shoots manually at a base rate. Equipment without a matching crew member provides a reduced or no effect.

### Equipment Modules

| Module | Paired Role | Effect Without Crew | Effect With Crew |
|--------|-------------|--------------------|--------------------|
| Auto-Fire System | Gunner | Reduced fire rate | Full auto-fire at boosted rate |
| Mine Sensor | Trainee | One safe reveal (auto) | Trainee gets extra safe reveals + sensor glow hint |
| CIWS (Missile Defense) | Engineer | Low intercept chance | Higher intercept chance |
| Market Terminal | Broker | Small cargo bonus (flat) | Full variance multiplier (0.8x–1.5x) |
| Armor Plating | Engineer | Base HP bonus | Larger HP bonus |
| Radar Array | Navigator | Basic trajectory extension | Full early-warning + spawn reveal |

### Equipment Design Principles

- Equipment is **not** tied to specific ships — any module fits any slot.
- Equipment is **lost when the ship sinks**.
- Crew + equipment synergy is the core optimization loop. Neither is useless alone, but together they multiply.
- Stacking and upgrade tiers are balance decisions for later.

## Economy

- **Income**: Oil sales only. Deliver cargo successfully (complete forward + return transit) to earn cargo value (modified by Broker if aboard).
- **Shaheds**: No reward for shooting them down. They're obstacles, not income.
- **Ship loss**: Ship, equipped modules, AND cargo are all lost. Surviving crew return to roster. Bank balance is kept.
- **Crew costs**: Hiring crew has a cost. Survived crew are free to re-assign.
- **Score**: Your score is your total bank balance when you retire (cash out). This is what goes on the leaderboard.
- **New ship**: After a ship is destroyed, you can buy any tanker and equipment you can afford. If you can't afford anything, game over.
- **Starting funds**: Enough to buy The Rustbucket + hire a Captain and Trainee.

## Phases

### 1. Dockside — Hire & Equip

Player manages their crew roster, purchases a tanker, assigns crew to roles, and fills equipment slots. First game starts with enough money for The Rustbucket, a Captain, and a Trainee.

### 2. Minesweeper — Clear the Path

Classic Minesweeper on ocean cells shaped by the Strait of Hormuz geography.

- **Win condition**: Revealed ocean cells form a connected path from the left edge to the right edge. Path must be wide enough for the tanker's grid width.
- **Lose condition**: Click a mine (if no trainee) or all trainees dead and player clicks a mine.
- Land cells are not playable (map texture).
- Numbers show adjacent mine count (8-directional).
- Right-click / long-press to flag.
- Chord click (click revealed number when adjacent flags match) to mass-reveal.
- First click is always safe (trainee checks it).
- A mine-free path is always guaranteed to exist.
- Mine density increases with turns played (not tanker tier).
- **Trainee**: provides safe reveals. Hitting a mine kills the trainee instead of ending the game — but you lose the safety net for the rest of the phase.
- **Mine Sensor** equipment: gives additional safe reveals, enhanced with trainee synergy.

### 3. Transit Forward — Run the Strait

After clearing the minesweeper, the tanker sails the strait.

- Ship follows the shortest revealed path from left to right.
- Ship auto-advances along the path at its base speed.
- Player controls: **Forward (speed up)**, **Pause**, **Reverse (back up)**.
- Keyboard: Arrow Up = forward, Arrow Down = reverse, Space = pause.

**Threats:**
- **Missiles**: Launch from Iranian land cells. Fly toward a fixed impact point (ship's position at launch). Player dodges by changing speed. Trajectory shown as red target circle + dotted line. Deal 1 HP damage on hit. **CIWS** + **Engineer** may intercept.
- **Shaheds (drones)**: Only spawn if a **Gunner** is aboard. Spawn from land edges. Move toward ship. Player clicks/taps to destroy, Gunner auto-shoots. Deal 2 HP damage on hit. **Auto-Fire** equipment boosts Gunner's rate.

**Threat intensity scales with tanker tier.**

**Lose condition**: Ship HP reaches 0 (ship, equipment, and cargo lost; crew may survive).
**Win condition**: Ship reaches the right edge.

### 4. Transit Return — Back Through the Strait

Same as Transit Forward but the ship travels right to left.

- Difficulty increased: missile rate x1.5, shahed rate x1.3.
- Same HP carries over from the forward trip (no healing between legs).

**Win condition**: Ship reaches the left edge. Cargo delivered. Cargo value (with Broker modifier) added to bank.

### 5. Between Runs

After a successful delivery or ship loss:
- **Shipwreck event** (on loss): narrative showing which crew survived and how.
- View bank balance, crew roster, available ships and equipment.
- Hire new crew, buy/equip ship, assign roles.
- **Run again**, or **Retire** — cash out and post bank balance to leaderboard.

After ship loss with insufficient funds for any tanker + crew: forced retirement.

## Visual Style

- Minesweeper cells: subtle semi-transparent overlay on real ocean imagery.
- 4-layer canvas stack: ocean background, game cells, land overlay, sprites.
- Ship: SVG tanker sprite scaled to tanker tier width.
- Crew: pixel-art character portraits (from sprite pool) shown in dockside UI and status panel.
- Missiles: SVG projectile with rotation, red target indicator + dotted trajectory line.
- Shaheds: SVG drone sprite, oriented toward ship.
- Effects: explosion, ocean splash, ship-struck sprites.
- HP bar in top panel during transit.
- Speed indicator in status bar.

## Controls

| Action | Mouse | Touch | Keyboard |
|----------------|----------------|----------------|--------------|
| Reveal cell | Left click | Tap | — |
| Flag cell | Right click | Long press | — |
| Destroy shahed | Left click | Tap | — |
| Ship forward | — | — | Arrow Up |
| Ship reverse | — | — | Arrow Down |
| Ship pause | — | — | Space |
| New game | Click face | Click face | — |
