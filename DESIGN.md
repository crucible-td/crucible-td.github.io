# CRUCIBLE — Design Document (v2)

## One line
A tower defense where towers don't deal damage, they change what the enemy *is* —
and you get paid for processing, not for killing.

## The core loop
Enemies ("charges") walk a fixed path carrying raw material in a **state**.
Towers apply an **element**. What happens depends on the state it hits.
There is no healthbar. There is a state machine.

The player's job is to arrange towers *in the right order along the path* so that
material enters as raw Ore and leaves as nothing. A well-built lane reads like a
foundry line: soften, freeze, shatter.

## The five states

| State | Speed | Behaviour |
|---|---|---|
| **ORE** | slow | Default spawn state. Armored: resists Kinetic almost entirely. |
| **SLAG** | slow | Ore with its armor stripped. Fragile, but stable — it won't change on its own. |
| **MOLTEN** | fast | Volatile. Drips: leaves a brief burning tile that damages nothing but blocks Vapor. |
| **CRYSTAL** | very slow | Inert and tough, but structurally brittle. The state you *want* things in. |
| **VAPOR** | fast | Floats. Ignores ground-only towers entirely. Immune to Kinetic. |

Anything that reaches the end leaks. Leak cost scales with state:
ORE 1 life, MOLTEN 2, VAPOR 3, CRYSTAL 1, SLAG 1.

## The resistance table

This is the whole game. Four elements × five states, each cell a damage
multiplier.

| | **HEAT** | **COLD** | **KINETIC** | **SOLVENT** |
|---|---|---|---|---|
| **ORE** | ×1.5 | ×0.5 | ×1.25 | ×1.0 |
| **SLAG** | ×1.0 | ×1.0 | ×1.5 | ×1.25 |
| **MOLTEN** | **immune** | ×2.0 | ×0.75 | ×1.25 |
| **CRYSTAL** | ×1.25 | **immune** | ×2.0 | **immune** |
| **VAPOR** | ×0.5 | ×1.5 | **immune** | ×2.0 |

Two rules generate these numbers, and both are asserted in tests:

**Every element is useless against exactly one layer.** Immunities are what
force the player to have a strategy at all. An element without a wall becomes
the answer to everything — Solvent briefly had none, and the Vat immediately
appeared in every single winning build.

**Every layer has at least two counters.** One counter would make that tower
mandatory whenever the layer appears. Two or more is what keeps several
different builds viable.

Round 1 is bare Ore, which nothing is immune to, so the opening is genuinely a
preference. Immunities then arrive one per round, each teaching a single cell.

## Layers

Enemies are stacks. Breaking the outer layer does not kill the charge — it
reveals what is underneath, at the same point on the lane.

```
CRYSTAL ──breaks into──> 2 × MOLTEN ──each into──> SLAG ──> gone
ORE ──> SLAG ──> gone
VAPOR ──> gone
```

One Crystal is therefore five payouts and three different resistance profiles.
It also sets the game's best trap: shattering Crystal with a Stamp is the
correct play, and it fills the lane with Molten, which Heat cannot touch at all.
A Forge-and-Stamp board handles the shell and then watches the cores walk past.

The chain only ever runs inward. Nothing anywhere puts a layer back on, which
is what bounds a cascade however it is triggered.

## Economy: paid for processing

Gold is awarded **per layer broken**, not per kill. Each layer carries its own
bounty, so depth of enemy rather than number of enemies is what makes a round
lucrative.

This single rule does a lot of work:
- Long processing chains out-earn one-shot kills, so the game teaches its own
  strategy through the wallet.
- Splitting Molten is *profitable but dangerous* — three enemies means three
  processing streams. Good players sometimes split on purpose.
- Thematically exact: you run a foundry. You're paid for refining ore.

## Towers (M2 target: 8, each with 2 upgrade branches)

Starter four, one per element:
- **Forge** (Heat) — short range, fast, cheap. The line's entry point.
- **Chiller** (Cold) — medium range, slow rate. Expensive early.
- **Stamp** (Kinetic) — ground-only, tight range, huge burst. Useless out of position.
- **Vat** (Solvent) — slow, applies over an area. The utility tower. Solvent
  strips whatever it touches down to Slag, so a Vat always leaves the Stamp
  something it can finish.

Upgrade branches change *table behaviour*, not just numbers — e.g. a Stamp
upgrade that stops splitting Molten, letting you break the ordering rule at
a price. Numeric-only upgrades are the boring half; keep them a minority.

**Shipped:** two per tower, mutually exclusive, no refund. Five rewrite table
cells, three are numeric.

| Tower | Branch | Effect |
|---|---|---|
| Forge | **Kiln** | `CRYSTAL/HEAT` → nothing. A late Forge stops melting your own work. |
| Forge | Bellows | Faster fire rate. |
| Chiller | **Deposition Coil** | `VAPOR/COLD` → CRYSTAL instead of MOLTEN. |
| Chiller | Supercooled Jets | Longer range. |
| Stamp | **Dampened Press** | `MOLTEN/KINETIC` chips instead of splitting, and presses slower. |
| Stamp | Wide Die | Longer range. Still ground-only. |
| Vat | **Reclaimer** | `VAPOR/SOLVENT` 1 → 2 damage, so two Vats finish a Vapor. |
| Vat | **Catalyst Bath** | `SLAG/SOLVENT` destroys, so the Vat needs no Stamp. |

A tower that resolves a cell to *nothing* also stops firing at it — towers
already hold fire where the table says nothing happens — so the Kiln shows up
as restraint rather than as a wasted shot.

## Waves
40 waves at M2. Design rhythm: waves 1–8 teach one table cell each.
Wave 9+ mixes states at spawn, forcing parallel lines.
Boss charges: multi-layered — a CRYSTAL shell around a MOLTEN core, so
shattering it releases something worse.

## Non-negotiable architecture rule
The simulation must run **headless and deterministic**: fixed timestep, seeded
RNG, zero rendering imports in the sim layer. Balance is then measurable
(`npm run sim -- --wave 23 --runs 500`) instead of a matter of opinion.
This is what makes automated playtesting possible at all.
