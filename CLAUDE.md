# Crucible

A tower defense built around **counters and layers**. Enemies ("charges") walk a
fixed lane wearing a **state** (Ore, Slag, Molten, Crystal, Vapor). Towers throw
an **element** (Heat, Cold, Kinetic, Solvent) for damage, and how much of it
lands depends on the state it hits. Break a layer and what is underneath keeps
walking: a Crystal shell becomes two Molten cores, each of which becomes a Slag
remnant. You are paid per layer broken.

The game is judged on one thing above being balanced: **more than one build has
to work.** An earlier version of this game was fair, winnable on every seed,
and still wrong, because there was exactly one build worth making. See
`npm run diversity`.

Full design rationale: [DESIGN.md](DESIGN.md).

## The one architectural rule

**`src/sim/` never imports from `src/render/` and never touches the DOM.**

The simulation is a pure function of (state, input, seed): fixed 60Hz timestep,
one seeded RNG, no wall-clock time. Breaking this rule breaks headless
playtesting, which is the most valuable thing this project has. If you need
rendering state, keep it in `src/render/`.

## Where things live

| Path | What it is |
|---|---|
| `src/sim/resistance.ts` | **The resistance table.** Twenty cells that define the entire game. |
| `src/sim/towers.ts`, `src/sim/waves.ts` | Tower stats and wave composition, as flat data. |
| `src/sim/upgrades.ts` | **Upgrade paths.** Two per tower, three tiers deep; the interesting tiers rewrite table cells. |
| `src/sim/loadout.ts` | The `towerId@col,row[+upgradeId]` grammar both harnesses parse. |
| `src/sim/freeplay.ts` | Rounds past the authored campaign, generated from a seed. |
| `src/sim/world.ts` | `step()`, `applyElement()`, layer breaking, placement. The only place damage is resolved. |
| `src/sim/path.ts` | Board dimensions, the lane polyline, buildable cells. |
| `src/render/` | Canvas drawing and DOM chrome. Read-only over the sim. |
| `src/render/decisions.ts` | What the interface decides, without the interface. Pure and tested. |
| `src/render/art.ts` | Tower and monster artwork: one SVG path each, drawn on canvas and in the DOM. |
| `src/headless.ts` | The playtest harness behind `npm run sim`. |
| `src/campaign.ts` | The whole-run harness behind `npm run campaign`. |
| `src/diversity.ts` | The build-diversity meter behind `npm run diversity`. |

## Commands

```bash
npm run dev        # play it at localhost:5173
npm test           # vitest: 131 tests
npm run test:fast  # the 118 that are not balance measurements -- under a second
npm run coverage   # where the tests are, and are not
npm run typecheck  # tsc --noEmit
npm run sim -- --all-waves                 # balance report for every wave
npm run sim -- --wave 7 --runs 200 --json  # machine-readable, for tooling
npm run campaign -- --plan "forge@5,1 stamp@5,5 chiller@14,9"  # whole run, real wallet
npm run diversity                          # how many builds work, and is any tower mandatory
```

`npm run sim` places towers free and refreshes lives each round, so it measures
round pressure in isolation. `npm run campaign` runs all ten rounds on one world
with gold and lives carrying over, buying from a purchase plan only when the
wallet allows -- that is the one that can tell you a round was lost because the
player could not *afford* the answer.

`npm run diversity` is the one that matters most. It runs a large sample of
compositions through the full campaign and reports how many win and whether any
tower appears in *every* winning build. A mandatory tower means the game has a
right answer again, however healthy the difficulty numbers look.

Loadout syntax is `towerId@col,row`, space-separated, with an optional
`+upgradeId` to fit one of that tower's two branches:

```bash
npm run sim -- --wave 10 --loadout "forge@5,4 chiller@1,8 stamp@8,10"
npm run sim -- --wave 3 --loadout "chiller@5,9 stamp@11,9+damp3"
```

Naming a tier-3 upgrade means "climb this path": tiers 1 and 2 are bought first
and paid for.

Upgrades have to be expressible here, not just clickable in the browser: an
upgrade that cannot appear in a loadout cannot be measured, and unmeasurable
balance is the one thing this project refuses. In `npm run campaign` a tower
and its upgrades are separate purchases -- the tower in plan order, the path
climbed afterwards out of whatever gold is spare, a tier at a time.

## Balance is measured, not guessed

Tuning means editing `src/sim/resistance.ts`, `towers.ts`, or `waves.ts` and then
re-running `npm run sim -- --all-waves` **and** `npm run diversity`. The report's per-state leak breakdown
("what leaked") is the fastest way to find the actual problem -- it is how wave
10 was diagnosed as a Vapor wall rather than a general difficulty problem.

Reference points from the current tuning, all measurable:

- Every one of the five towers clears round 1 on its own. That is deliberate:
  the opening is a preference, not a puzzle.
- 77 of 320 sampled 18-tower compositions clear all twenty rounds, in 77
  distinct compositions, and no tower appears in every winner.
- The reference plan wins on every seed with about 9 of 20 lives left, climbing
  22 upgrade tiers, and reaches roughly round 22 in freeplay.
- Sample size is part of that measurement. At 120 builds the meter called the
  Vat mandatory and a hand-built Vat-free board then cleared all twenty rounds
  with 18 lives left. Raise the sample before believing a verdict.

If a change makes round 1 punishing, or drives the number of winning builds
toward one, it has removed the point of this version.

Two structural rules the resistance table has to keep obeying, both asserted in
`tests/resistance.test.ts`:

- **Every element is useless against exactly one layer.** An element without a
  wall becomes the answer to everything -- the Vat was briefly mandatory in
  every winning build for precisely this reason.
- **Every layer has at least two counters**, a specialist at 2.0 and a
  runner-up near 1.6. One counter makes that tower mandatory whenever the layer
  shows up -- and a runner-up too far behind the specialist is not really a
  second answer, because it cannot keep up with late-round toughness.

## What is tested, and what is not

`npm test` runs 131 tests; `npm run coverage` reports where they are. The split
is deliberate and worth knowing before adding more:

- **`src/sim` is at 100% statements.** The twenty resistance cells are asserted
  individually, as are every upgrade path, the campaign economy and build
  diversity. Changing a cell without updating a test fails the suite, which is
  the point.
- **`src/render` is at 19%**, and that is the honest number rather than a
  target. `decisions.ts` and `clock.ts` are near full; canvas drawing and DOM
  wiring are at zero on purpose. Pixel comparison is brittle and proves little;
  `tests/art.test.ts` guards the part that can silently break, which is a tower
  or layer shipping with no artwork at all.

**Put interface logic in `src/render/decisions.ts`, not in an event handler.**
Every interface bug this project has had came from logic tangled with the DOM
where no test could reach it -- a selected tower that could not be deselected,
a panel showing the previously clicked tower, and a board that ignored every
tap because it read the target cell from a mousemove, which made the game
unplayable on a phone. If a change involves a decision rather than a drawing,
it belongs in that module with a test named after what it protects.

`tests/architecture.test.ts` enforces the one architectural rule by reading the
source: no import from `src/render` inside `src/sim`, no DOM, no
`Math.random()`. It has been verified to fail when violated.

There is no coverage threshold in CI. A percentage target produces tests
written for the number rather than for the risk.

## Conventions

- Every gameplay rule goes through the resistance table and `applyElement()`.
  Do not add special cases to tower code.
- All twenty table cells are asserted in `tests/resistance.test.ts`. Changing a
  cell deliberately means updating that test; changing one by accident fails it.
- The layer chain in `STATES` only ever runs inward, which is what bounds a
  cascade. Nothing may put a layer back on.
- `window.crucible` exists in dev builds for driving the sim from the console
  (`crucible.place('forge',5,4)`, `crucible.startWave()`, `crucible.advance(1200)`).
  Handy because requestAnimationFrame pauses in a hidden tab.

## Automated checks (hook)

A `PostToolUse` hook runs `npm run typecheck && npm run test:fast` after any
edit to a `.ts` file under `src/` or `tests/`. It lives in
`.claude/hooks/check-after-edit.sh` and is wired up in `.claude/settings.json`.

`test:fast` is `npm test` minus `tests/campaign.test.ts` and
`tests/diversity.test.ts`, which is 118 of the 131 tests and about two seconds
instead of twenty-five. Those two files are almost the
entire cost: the diversity suite runs a 240-build campaign sample at module
load, and the campaign suite plays twenty rounds on several seeds. They are the
measurements the project is judged on, but they answer a question about balance
rather than about whether the edit just made compiles and behaves, and a
twenty-five-second pause after every edit turns the hook into something to
switch off. Run them with `npm test` after a balance change -- and CI runs the
full suite on every push before it will deploy, so nothing merges on the fast
set alone.

On failure it exits 2 and prints the compiler/test output to stderr, which is
Claude Code's convention for "block and feed this back to the model" -- so a
broken edit surfaces immediately instead of being discovered later. Edits to
other file types exit 0 without running anything.

To change what it checks, edit the script; to disable it, remove the block from
`.claude/settings.json`. Hooks are reloaded when a session starts, so changes
to either file take effect in the next session.

## Where the project stands

**v2 is a pivot.** The original game -- towers that never dealt damage and
instead transmuted enemies between states -- is complete, measured, and tagged
`v1-transmutation`. It was retired because it had one right answer.

v2.1 is current: HP and damage, layers that break inward, money per layer,
5 towers with two three-tier upgrade paths each, 20 authored rounds, seeded
freeplay past them, and four harnesses. `npm test` (131 tests),
`npm run typecheck` and `npm run build` all pass.

Still unbuilt, and left as the owner's own AI-tooling exercise:

- **A balance-analyst subagent**, best pinned to a cheaper model in its
  frontmatter.

Remaining work lives in [BACKLOG.md](BACKLOG.md), including the one item with a
known risk: the game has never been tested on a real phone. Touch placement was
broken until recently and the fix was only verified against emulated events.

The unspent-gold finding is largely closed. It was 995 at the end of a ten-round
run with nothing left to buy; lengthening the campaign to twenty rounds and
giving each tower a three-tier path brought it to about 790 while the reference
plan now spends on 18 towers and 22 upgrade tiers. Bounty scales with the
*square root* of a charge's toughness rather than linearly, because paying full
multiples let heavy rounds fund the towers that beat them -- the same trap that
made wave size useless as a difficulty dial in v1.
