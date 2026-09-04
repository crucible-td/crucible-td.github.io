# Balance: the measurement record

> **Naming note.** The interface was relabelled after these measurements were
> taken: Kinetic reads as Impact, Solvent as Acid, Slag as Ash, Molten as Lava,
> Vapor as Gas, and Forge/Stamp/Vat/Lens as Burner/Hammer/Acid Tank/Beam. **No
> id changed and no number moved** -- `npm run sim -- --all-waves` was verified
> byte-identical across the whole change -- so every loadout and every figure
> below is still exactly correct. Entries are left in the vocabulary they were
> written in rather than rewritten, because this file is a record of what was
> measured and when, and editing it after the fact would make it a worse one.

What the current tuning actually measures, and what past tunings taught. This
is the evidence behind the numbers in `src/sim/`, kept out of
[CLAUDE.md](CLAUDE.md) because it is a record to consult when tuning rather
than a rule to follow while coding.

The `balance-pass` skill is the workflow; this is the reference it reads
against. [DESIGN.md](DESIGN.md) explains *why* the mechanics are shaped this
way; this file records *what they currently do*.

## Reference points from the current tuning

All measurable, all reproducible from the commands in CLAUDE.md.

- **Every one of the five towers clears round 1 on its own.** That is
  deliberate: the opening is a preference, not a puzzle.
- **53 of 720 sampled 18-tower compositions clear all twenty rounds**, in 53
  distinct compositions, and no tower appears in every winner. The win rate
  halved when upgrades were made to matter, which is the cost of that change,
  and gave up a further eight builds when the splash cascade defect was fixed.
  Still comfortably inside the 5-50% band the meter asserts.
- **The reference plan wins on every seed with 11-15 of 20 lives left**,
  climbing 46 upgrade tiers across all eighteen of its towers.
- **Freeplay continues the authored curve rather than restarting it.** Round 21
  opens at the *median* toughness of round 20's own groups, computed from
  `WAVES` at module load, so retuning the campaign moves the seam with it. The
  reference plan clears freeplay round 24 and dies on 25 on every seed. It used
  to coast to round 35 against a scale still calibrated to a round 20 that had
  long since been retuned; `tests/freeplay.test.ts` now guards the seam.

If a change makes round 1 punishing, or drives the number of winning builds
toward one, it has removed the point of this version.

## Two structural rules the resistance table must keep obeying

Both asserted in `tests/resistance.test.ts`, so breaking one fails the suite.

- **Every element is useless against exactly one layer.** An element without a
  wall becomes the answer to everything -- the Vat was briefly mandatory in
  every winning build for precisely this reason.
- **Every layer has at least two counters**, a specialist at 2.0 and a
  runner-up near 1.6. One counter makes that tower mandatory whenever the layer
  shows up -- and a runner-up too far behind the specialist is not really a
  second answer, because it cannot keep up with late-round toughness.

## Upgrades have to stay worth buying

A board that never upgrades must lose, at every tower count it can afford.

This is the property most easily broken by an economy tweak, because a tower is
a linear unit of power at a flat price while a tier multiplies one capped tower
for several times that price. `npm run diversity` **cannot see it** -- the meter
holds slots at eighteen and always intends tier 3, so every build it samples is
a depth build. `tests/breadth.test.ts` is what watches this axis.

## Lessons from past tunings

These cost real time to learn. They are recorded so the next tuning pass does
not pay for them again.

### Sample size is part of the measurement

It is easy to underestimate how much. At 120 builds the meter called the Vat
mandatory, and a hand-built Vat-free board then cleared all twenty rounds with
18 lives left. At 240 it did it again when riders landed: the tuning before
produced exactly one Vat-free winner out of 34 and the tuning after produced
none out of 34 -- a pass and a fail one build apart, from a change that moved
the Vat's presence among winners not at all (99% at 960 builds, before and
after). The test now samples 720, which is where the verdict stops flipping.

### A defect can be load-bearing, so fixing one is a balance change

`advanceProjectiles` and `advanceEffects` walked `w.charges` while `breakLayer`
pushed children onto it, so a splash hit the layers it had just exposed, and
theirs, and theirs. One shot beside a Crystal broke seven layers.

Fixing it was three lines and it moved real numbers: winning builds 61 to 53
out of 720, and a stamp+vat board -- half of it Acid Tanks, the tower the table
has always had to be careful about -- fell from 11 lives to 0 on one seed. The
reference plan did not move at all (13/20 lives, 46 tiers, the same two leaks),
which is the shape to expect: a bug that pays a specific build pays nothing to
a board that was not leaning on it.

Two things to carry forward. A test asserting an outright win is a test resting
on whichever board is strongest today, and the strongest board is the most
likely to be the one living off a defect -- `tests/breadth.test.ts` now compares
how far a climbed board gets against its bare twin, across three compositions
and three seeds, which is the property rather than one witness of it. And the
Vat's presence among winners barely moved (97% to 96%), so a fix that costs a
tower real power is not the same as one that costs it its place.

### When the meter names a mandatory tower, hand-build a board without it

Do that before believing the verdict. It is one campaign run against a
twenty-minute sweep, and it has been the deciding evidence twice.

### The leak breakdown finds the problem faster than the win rate

The per-state breakdown in `npm run sim -- --all-waves` ("what leaked") is how
wave 10 was diagnosed as a Vapor wall rather than as a general difficulty
problem. A win rate tells you a round is too hard; the breakdown tells you
which layer nobody could answer.

### Bounty scales with the square root of toughness

Paying full multiples let heavy rounds fund the towers that beat them -- the
same trap that made wave size useless as a difficulty dial in v1.

## Open finding: a run still ends holding gold

About 1360 on the reference plan, and rather more on boards that spend badly.
No pricing change has ever reached it, because most of the surplus accrues
*during* the final rounds, after the last useful purchase point. A large idle
balance is evidence that *something* is underpriced rather than merely untidy.

Kept in [BACKLOG.md](BACKLOG.md) as an open item, with the full history of what
the surplus was hiding -- it is work still to do rather than a measurement.

## Test coverage, and why it is uneven

`npm run coverage` reports where the tests are. The split is deliberate:

- **`src/sim` is at 100% statements.** The twenty resistance cells are asserted
  individually, as are every upgrade path, the campaign economy and build
  diversity. Changing a cell without updating a test fails the suite, which is
  the point.
- **`src/render` is at 19%**, and that is the honest number rather than a
  target. `decisions.ts` and `clock.ts` are near full; canvas drawing and DOM
  wiring are at zero on purpose. Pixel comparison is brittle and proves little.
  `tests/art.test.ts` guards the part that can silently break, which is a tower
  or layer shipping with no artwork at all.

There is no coverage threshold in CI. A percentage target produces tests
written for the number rather than for the risk.

## Where the project came from

**v2 is a pivot.** The original game -- towers that never dealt damage and
instead transmuted enemies between states -- is complete, measured, and tagged
`v1-transmutation`. It was retired because it had exactly one right answer,
which is the failure this project now measures against on every change.
