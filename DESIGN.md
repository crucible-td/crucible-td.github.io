# CRUCIBLE — Design Document (v2)

> **On this document.** Everything below describes v2, the current game. The
> original version — towers that dealt no damage and instead *transmuted*
> enemies between states — is retired and tagged `v1-transmutation`. If you find
> prose here claiming there is no healthbar, or that Ore resists Impact, it is
> v1 text that outlived the pivot and should be deleted rather than believed.

## One line
A tower defense where every enemy is a stack of layers, each layer answers to a
different element, and you are paid for every layer you break.

## The core loop
Enemies ("charges") walk a fixed lane wearing a **layer** — a state of matter.
Towers throw an **element**. The layer decides how much of that damage lands,
and what the hit leaves behind afterwards.

Break a layer and the charge is not dead: what was underneath keeps walking, at
the same point on the lane, answering to different elements than the shell did.
The player's job is to cover every layer the lane will show them, and to arrange
the board so that whatever climbs out of a break walks into the tower that
answers it. A well-built lane reads like a foundry line: shatter, cool, dissolve.

## The five layers

Speed is pixels per tick at 60Hz. HP is what the layer absorbs before it breaks,
before the round's toughness multiplier. Bounty is paid when it breaks.

| Layer | Speed | HP | Leak | Bounty | Breaks into | Character |
|---|---|---|---|---|---|---|
| **ORE** | 1.0 | 12 | 1 | 2 | 1 × Ash | The default spawn. Heat's specialty; Cold slides off it. |
| **ASH** | 1.4 | 6 | 1 | 1 | — | What is left when anything else is stripped. Quick, thin, and the last of it. |
| **LAVA** | 1.8 | 14 | 2 | 3 | 1 × Ash | Already melted, so Heat does nothing at all. Chill it or dissolve it. |
| **CRYSTAL** | 0.9 | 22 | 2 | 4 | **2 × Lava** | Slow and tough, and inert to both Cold and Acid. Shatter it — and then deal with what comes out. |
| **GAS** | 2.4 | 10 | 3 | 3 | — | Floats over ground-only towers and Impact passes straight through. Fast, and the most expensive thing to let past. |

Anything reaching the end leaks, costing the lives in the Leak column: Gas is
worth three, Lava and Crystal two, Ore and Ash one each.

## The resistance table

This is the whole game. Four elements × five states, each cell a damage
multiplier.

| | **HEAT** | **COLD** | **IMPACT** | **ACID** |
|---|---|---|---|---|
| **ORE** | **×2.0** | ×0.5 | ×1.5 | ×1.0 |
| **ASH** | ×1.0 | ×1.0 | **×1.5** | ×1.25 |
| **LAVA** | **immune** | **×2.0** | ×0.75 | ×1.6 |
| **CRYSTAL** | ×1.6 | **immune** | **×2.0** | **immune** |
| **GAS** | ×0.5 | ×1.6 | **immune** | **×2.0** |

Two rules generate these numbers, and both are asserted in tests:

**Every element is useless against exactly one layer.** Immunities are what
force the player to have a strategy at all. An element without a wall becomes
the answer to everything — Acid briefly had none, and the Acid Tank immediately
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
| **IMPACT** | Shove | knocks it back down the lane | n/a, instant |
| **ACID** | Corrode | eats slowly | **yes — onto the children** |

One rule generates all of the behaviour worth having, and none of it is a
special case in tower code:

**An immune cell means no damage and no rider.** Crystal is never chilled,
Gas is never shoved, and nothing anywhere says so — the table already did.
This is also the answer to "which monsters walk slow": Cold slows Lava to
little over half pace (×2.0), Gas by a third (×1.6), Ore barely at all
(×0.5), and Crystal not at all. The Cold column, read back as speed.

**An upgrade that rewrites a cell moves the rider with it.** An Absolute Zero
Chiller does not merely start hurting Crystal, it starts *slowing* Crystal. A
Blast Furnace starts igniting Lava. That interaction cost nothing to build
and is the best reason in the game to climb a path.

Two riders exist to stay out of each other's way. Cold owns throughput, so
Impact owns position instead: a shove is capped per *charge* rather than per
tower, so a bank of Hammers cannot chain one into a stall-lock, and it is
divided by the square root of toughness, because a boss that can be pushed
around is a boss that never arrives. None of the three timed riders stack —
a second application takes the stronger value and refreshes the clock.

Corrode is the only one that knows the layer system exists, and it is the Acid Tank's
whole identity: a wash over a Crystal keeps eating the two Lava cores that
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
CRYSTAL ──breaks into──> 2 × LAVA ──each into──> ASH ──> gone
ORE ──> ASH ──> gone
GAS ──> gone
```

One Crystal is therefore five payouts and three different resistance profiles.
It also sets the game's best trap: shattering Crystal with a Hammer is the
correct play, and it fills the lane with Lava, which Heat cannot touch at all.
A Burner-and-Hammer board handles the shell and then watches the cores walk past.

The chain only ever runs inward. Nothing anywhere puts a layer back on, which
is what bounds a cascade however it is triggered.

## Breadth versus depth

Gold buys two different things: **another tower**, or **another tier on a tower
you own**. For a long time the first was strictly better and the second was
therefore dead content.

The arithmetic is what made it so. A tower is a linear unit of power at a flat
45-64 gold, and it brings coverage as well as damage -- it watches its own patch
of lane. A tier multiplies one tower whose base is capped, for 50-255. Measured
at the worst point, the Hammer's `die` chain cost 380 gold and added 49 dps
against Crystal, its own best target, while the same 380 gold bought 8.4 more
Hammers for 217 dps. Breadth was 4.4x better value, and a board of forty towers
that never upgraded cleared all twenty rounds with 19 of 20 lives.

Difficulty cannot fix this. Raising toughness scales the requirement for both
builds by the same factor, so it never separates them -- it just kills the
smaller board first. What separates them is *when* their power arrives: two
builds own the same towers through round 7, and only from round 10 does one
hold tiers while the other holds tower count.

So tiers were repriced against what they displace, and the rounds were shaped
into a ramp across 10-15 followed by real weight in 16-20, where a board that
spent on paths is finished and a board still buying its fortieth tower is not.
A board that never upgrades now loses on round 17 at every tower count it can
afford, up to filling every one of the 103 lane-adjacent cells.

`npm run diversity` is blind to this axis -- it holds the slot count at eighteen
and gives every tower a tier-3 intent, so every build it samples is a depth
build. `tests/breadth.test.ts` is what guards it.

## Economy: paid for processing

Gold is awarded **per layer broken**, not per kill. Each layer carries its own
bounty, so depth of enemy rather than number of enemies is what makes a round
lucrative.

This single rule does a lot of work:
- Deep enemies out-earn shallow ones, so the game teaches its own strategy
  through the wallet: one Crystal pays five times on the way down (shell, two
  cores, two remnants) where a bare Ash pays once.
- Shattering a Crystal is *profitable but dangerous* — the payout is immediate
  and so are the two Lava cores, which Heat cannot touch at all. A
  Burner-and-Hammer board takes the shell apart and then watches the cores walk
  past. That is the game's best trap and it is paid for in gold.
- Thematically exact: you run a foundry. You're paid for refining ore.

Bounty scales with the **square root** of a charge's toughness, not linearly.
Paying full multiples let a heavy round fund the towers that beat it, which is
the same trap that made wave size useless as a difficulty dial.

## Towers

Five, covering four elements — Heat is carried by two of them on purpose, since
the interesting axis is not only which element you bring but what shape of tower
carries it. Stats live in `src/sim/towers.ts`; what follows is the shape.

| Tower | Element | Cost | Damage | Range | Cooldown | Shape |
|---|---|---|---|---|---|---|
| **Burner** | Heat | 46 | 4 | 92 | 30 | Cheap, short and constant. The line's entry point. |
| **Chiller** | Cold | 58 | 6 | 110 | 48 | Medium reach, slow rate, expensive early. Its chill is the largest rider in the game. |
| **Hammer** | Impact | 45 | 9 | 90 | 42 | Ground-only, tight range, heavy hits. Useless out of position, and Gas floats straight over it. |
| **Acid Tank** | Acid | 52 | 5 | 100 | 60 | The only tower with splash (36px), and the slowest. Its corrosion follows whatever breaks out. |
| **Beam** | Heat | 64 | 14 | 260 | 74 | Reaches most of the lane and hits hard, but rarely. The Burner's opposite on the same table column. |

Growing this to eight is still open; see BACKLOG.md, which notes that support
towers are the change most likely to reintroduce a mandatory tower and therefore
lean hardest on `npm run diversity`.

## Upgrade paths

Two paths per tower, three tiers deep, mutually exclusive and with no refund.
A tower commits to a path and then climbs it, which makes "which tower do I
take all the way" the central late decision rather than a formality.

Upgrades change *table behaviour*, not just numbers. The strongest of them
**lift an immunity** — the hardest wall in the game — and those sit at the top
of a path, reached by commitment rather than handed out at tier 1.

| Tower | Path | What the top of it does |
|---|---|---|
| Burner | **Kiln** | Lava stops being immune to Heat and ends up taking ×1.4. |
| Burner | Bellows | Fires roughly three times as often as stock. |
| Chiller | **Deposition** | Crystal stops being immune to Cold and ends at ×1.75. |
| Chiller | Supercooled | Covers a quarter of the lane on its own. |
| Hammer | **Dampened** | Crushes Lava and Ore; trades away the Crystal specialism. |
| Hammer | **Die** | Doubles down on Crystal — ×3.5, the hardest hit in the game. |
| Acid Tank | **Reclaimer** | Tears through Gas, and dissolves Crystal slightly — its own wall, undone. |
| Acid Tank | **Catalyst** | Floods a stretch of lane; eats Ash and Ore in bulk. |
| Beam | Focus | One shot removes most things, from anywhere on the map. |
| Beam | **Prism** | Finds a wavelength for every layer, including Gas. |

Six of the ten paths rewrite table cells; the rest are numeric, which
DESIGN.md's older self correctly called the boring half.

A tower that resolves a cell to *nothing* also stops firing at it — towers hold
fire where the table says nothing happens — so a bare Burner facing a Lava
round shows up as restraint rather than as wasted shots, and buying the Kiln
path is what turns those held shots into breaks.

## Rounds
20 authored rounds, then seeded freeplay without end. Rounds 1–7 teach one
immunity each; 8–10 mix them; 11–20 escalate through weight rather than new
vocabulary.

Difficulty climbs through a per-group `hpScale` rather than through sheer count.
Spawning ever more bodies would drown the simulation and slow headless
playtesting, and a round of a thousand weak charges only asks for more of what
you already own. Toughness keeps asking the question the resistance table poses:
did you bring an answer to this layer?

Rounds 1–4 carry no toughness at all, so the opening stays a preference rather
than a puzzle. A mild lift starts at round 5. Rounds 10–15 are a *ramp* rather
than a step, and 16–20 carry the real weight — that shape is not cosmetic, it is
what makes upgrades worth buying, and the reasoning is under "Breadth versus
depth" above.

One mechanism covers both bosses and freeplay. A **slab** is a deep stack at
high `hpScale` — a Crystal shell whose Lava cores inherit its toughness — and
freeplay is the same dial turned by a formula, compounding without end.

**Known gap:** freeplay's formula was calibrated when round 20 finished near
`hpScale 2`, and the ramp above left it far behind — round 21 is currently about
six times *easier* than round 20, and freeplay does not regain round-20 pressure
until roughly round 40. The seam between the last authored round and the first
generated one is not asserted anywhere, which is why the ramp could move without
anything failing. See BACKLOG.md.

Bounty scales with the **square root** of toughness, not linearly. Paying full
multiples let a heavy round fund the towers that beat it, which is the same
trap that made wave size useless as a difficulty dial.

## Non-negotiable architecture rule
The simulation must run **headless and deterministic**: fixed timestep, seeded
RNG, zero rendering imports in the sim layer. Balance is then measurable
(`npm run sim -- --wave 23 --runs 500`) instead of a matter of opinion.
This is what makes automated playtesting possible at all.
