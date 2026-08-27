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
| **ORE** | **×2.0** | ×0.5 | ×1.5 | ×1.0 |
| **SLAG** | ×1.0 | ×1.0 | **×1.5** | ×1.25 |
| **MOLTEN** | **immune** | **×2.0** | ×0.75 | ×1.6 |
| **CRYSTAL** | ×1.6 | **immune** | **×2.0** | **immune** |
| **VAPOR** | ×0.5 | ×1.6 | **immune** | **×2.0** |

Two rules generate these numbers, and both are asserted in tests:

**Every element is useless against exactly one layer.** Immunities are what
force the player to have a strategy at all. An element without a wall becomes
the answer to everything — Solvent briefly had none, and the Vat immediately
appeared in every single winning build.

**Every layer has at least two counters** — a specialist in bold at ×2.0, and a
runner-up near ×1.6. One counter would make that tower mandatory whenever the
layer appears. The runner-up has to be close behind, too: when the seconds sat
at ×1.25 they could not keep up with late-round toughness, and the three towers
holding a specialist became mandatory together.

Every element is the specialist for exactly one layer and useless against
exactly one. Heat lacked a specialty for a while and both Heat towers dropped
out of every winning build.

Round 1 is bare Ore, which nothing is immune to, so the opening is genuinely a
preference. Immunities then arrive one per round, each teaching a single cell.

## Riders: the lingering half of a hit

Damage is not all an element does. Every element carries exactly one **rider**,
and its magnitude is scaled by the same resistance cell that scales the damage.

| Element | Rider | | Survives the break? |
|---|---|---|---|
| **HEAT** | Ignite | burns, hot and brief | no |
| **COLD** | Chill | slows the charge down | no |
| **KINETIC** | Shove | knocks it back down the lane | n/a, instant |
| **SOLVENT** | Corrode | eats slowly | **yes — onto the children** |

One rule generates all of the behaviour worth having, and none of it is a
special case in tower code:

**An immune cell means no damage and no rider.** Crystal is never chilled,
Vapor is never shoved, and nothing anywhere says so — the table already did.
This is also the answer to "which monsters walk slow": Cold slows Molten to
little over half pace (×2.0), Vapor by a third (×1.6), Ore barely at all
(×0.5), and Crystal not at all. The Cold column, read back as speed.

**An upgrade that rewrites a cell moves the rider with it.** An Absolute Zero
Chiller does not merely start hurting Crystal, it starts *slowing* Crystal. A
Blast Furnace starts igniting Molten. That interaction cost nothing to build
and is the best reason in the game to climb a path.

Two riders exist to stay out of each other's way. Cold owns throughput, so
Kinetic owns position instead: a shove is capped per *charge* rather than per
tower, so a bank of Stamps cannot chain one into a stall-lock, and it is
divided by the square root of toughness, because a boss that can be pushed
around is a boss that never arrives. None of the three timed riders stack —
a second application takes the stronger value and refreshes the clock.

Corrode is the only one that knows the layer system exists, and it is the Vat's
whole identity: a wash over a Crystal keeps eating the two Molten cores that
climb out of it. Its damage is small and its duration is long, because almost
all of its value is being still alive when the layer breaks.

Riders were a straight power gain across all five towers — the reference
campaign went from 9 lives left to 15, a run with no tension in it — and every
upgrade tier's damage is 10% lower than before to pay for it. The tiers pay
rather than the base towers because that is where the gain concentrates: a
rider's strength is a table cell times a constant, and tiers are what push
cells up.

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

## Upgrade paths

Two paths per tower, three tiers deep, mutually exclusive and with no refund.
A tower commits to a path and then climbs it, which makes "which tower do I
take all the way" the central late decision rather than a formality.

Upgrades change *table behaviour*, not just numbers. The strongest of them
**lift an immunity** — the hardest wall in the game — and those sit at the top
of a path, reached by commitment rather than handed out at tier 1.

| Tower | Path | What the top of it does |
|---|---|---|
| Forge | **Kiln** | Molten stops being immune to Heat and ends up taking ×1.4. |
| Forge | Bellows | Fires roughly three times as often as stock. |
| Chiller | **Deposition** | Crystal stops being immune to Cold and ends at ×1.75. |
| Chiller | Supercooled | Covers a quarter of the lane on its own. |
| Stamp | **Dampened** | Crushes Molten and Ore; trades away the Crystal specialism. |
| Stamp | **Die** | Doubles down on Crystal — ×3.5, the hardest hit in the game. |
| Vat | **Reclaimer** | Tears through Vapor, and dissolves Crystal slightly — its own wall, undone. |
| Vat | **Catalyst** | Floods a stretch of lane; eats Slag and Ore in bulk. |
| Lens | Focus | One shot removes most things, from anywhere on the map. |
| Lens | **Prism** | Finds a wavelength for every layer, including Vapor. |

Six of the ten paths rewrite table cells; the rest are numeric, which
DESIGN.md's older self correctly called the boring half.

A tower that resolves a cell to *nothing* also stops firing at it — towers hold
fire where the table says nothing happens — so a bare Forge facing a Molten
round shows up as restraint rather than as wasted shots, and buying the Kiln
path is what turns those held shots into breaks.

## Rounds
20 authored rounds, then seeded freeplay without end. Rounds 1–7 teach one
immunity each; 8–10 mix them; 11–20 escalate through weight rather than new
vocabulary.

Difficulty past round 10 climbs through a per-group `hpScale` rather than
through sheer count. Spawning ever more bodies would drown the simulation and
slow headless playtesting, and a round of a thousand weak charges only asks for
more of what you already own. Toughness keeps asking the question the
resistance table poses: did you bring an answer to this layer?

One mechanism covers both bosses and freeplay. A **slab** is a deep stack at
high `hpScale` — a Crystal shell whose Molten cores inherit its toughness — and
freeplay is the same dial turned by a formula, compounding without end.

Bounty scales with the **square root** of toughness, not linearly. Paying full
multiples let a heavy round fund the towers that beat it, which is the same
trap that made wave size useless as a difficulty dial.

## Non-negotiable architecture rule
The simulation must run **headless and deterministic**: fixed timestep, seeded
RNG, zero rendering imports in the sim layer. Balance is then measurable
(`npm run sim -- --wave 23 --runs 500`) instead of a matter of opinion.
This is what makes automated playtesting possible at all.
