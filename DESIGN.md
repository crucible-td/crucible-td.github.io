# CRUCIBLE — Design Document

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

## The transmutation table

This is the whole game. Four elements × five states.

| | **HEAT** | **COLD** | **KINETIC** | **SOLVENT** |
|---|---|---|---|---|
| **ORE** | → MOLTEN | *nothing* (bounces) | chip (very slow) | → SLAG |
| **SLAG** | → MOLTEN | *nothing* | **destroyed** | *nothing* |
| **MOLTEN** | speeds up +40% ⚠ | → CRYSTAL | **splits into 3 MOLTEN** ⚠ | → VAPOR |
| **CRYSTAL** | → MOLTEN ⚠ | *nothing* | **SHATTERED — bonus gold** ✅ | *nothing* |
| **VAPOR** | speeds up +80% ⚠ | → MOLTEN | passes through | dissipates (slow kill) |

⚠ = the trap. These are the cells that punish careless placement.

**The ideal line:** HEAT → COLD → KINETIC.
Ore melts, molten crystallizes, crystal shatters for bonus gold.
Three towers, in that order, and only in that order.

**The classic disaster:** a Kinetic tower placed too early. It hits MOLTEN,
splits it into three, and now you have triple the throughput arriving at a line
sized for one. The player builds their own defeat — a failure mode Bloons
doesn't have, and the reason placement stays interesting after hour ten.

## Economy: paid for processing

Gold is awarded **per transmutation**, not per kill. Roughly 1g per state
change, plus a shatter bonus of 5g.

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
- **Vat** (Solvent) — slow, applies over an area. The utility tower.

Upgrade branches change *table behaviour*, not just numbers — e.g. a Stamp
upgrade that stops splitting Molten, letting you break the ordering rule at
a price. Numeric-only upgrades are the boring half; keep them a minority.

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
