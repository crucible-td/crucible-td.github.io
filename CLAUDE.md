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
| `src/sim/upgrades.ts` | **Upgrade branches.** Two per tower; the interesting ones rewrite table cells. |
| `src/sim/loadout.ts` | The `towerId@col,row[+upgradeId]` grammar both harnesses parse. |
| `src/sim/world.ts` | `step()`, `applyElement()`, layer breaking, placement. The only place damage is resolved. |
| `src/sim/path.ts` | Board dimensions, the lane polyline, buildable cells. |
| `src/render/` | Canvas drawing and DOM chrome. Read-only over the sim. |
| `src/headless.ts` | The playtest harness behind `npm run sim`. |
| `src/campaign.ts` | The whole-run harness behind `npm run campaign`. |
| `src/diversity.ts` | The build-diversity meter behind `npm run diversity`. |

## Commands

```bash
npm run dev        # play it at localhost:5173
npm test           # vitest: determinism + all 20 table cells
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
npm run sim -- --wave 3 --loadout "chiller@5,9 stamp@11,9+dampened"
```

Upgrades have to be expressible here, not just clickable in the browser: an
upgrade that cannot appear in a loadout cannot be measured, and unmeasurable
balance is the one thing this project refuses. In `npm run campaign` a tower
and its upgrade are two separate purchases -- the tower in plan order, the
branch afterwards out of whatever gold is spare.

## Balance is measured, not guessed

Tuning means editing `src/sim/resistance.ts`, `towers.ts`, or `waves.ts` and then
re-running `npm run sim -- --all-waves` **and** `npm run diversity`. The report's per-state leak breakdown
("what leaked") is the fastest way to find the actual problem -- it is how wave
10 was diagnosed as a Vapor wall rather than a general difficulty problem.

Reference points from the current tuning, all measurable:

- Every one of the five towers clears round 1 on its own. That is deliberate:
  the opening is a preference, not a puzzle.
- 28 of 150 sampled 14-tower compositions clear all ten rounds, in 28 distinct
  compositions, and no tower appears in every winner.
- The reference plan wins on every seed with about 9 of 20 lives left.

If a change makes round 1 punishing, or drives the number of winning builds
toward one, it has removed the point of this version.

Two structural rules the resistance table has to keep obeying, both asserted in
`tests/resistance.test.ts`:

- **Every element is useless against exactly one layer.** An element without a
  wall becomes the answer to everything -- the Vat was briefly mandatory in
  every winning build for precisely this reason.
- **Every layer has at least two counters.** One counter makes that tower
  mandatory whenever the layer shows up.

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

A `PostToolUse` hook runs `npm run typecheck && npm test` after any edit to a
`.ts` file under `src/` or `tests/`. It lives in
`.claude/hooks/check-after-edit.sh` and is wired up in `.claude/settings.json`.

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
`v1-transmutation`. It was retired because it had one right answer: the shatter
line paid 7 against 2 and 1 for every alternative, and the build the harness
converged on used three of the four towers and ignored the fourth entirely.

The playable core of v2 has landed: HP and damage, layers that break inward,
money per layer, 5 towers with two upgrade branches each, 10 escalating rounds,
and three harnesses. `npm test` (53 tests), `npm run typecheck` and
`npm run build` all pass, and the browser build reproduces the headless numbers.

The `balance-pass` skill lives at `.claude/skills/balance-pass/`, with the
references it measures against in `reference/`.

Still unbuilt, and left as the owner's own AI-tooling exercise:

- **A balance-analyst subagent**, best pinned to a cheaper model in its
  frontmatter.

Remaining game scope: breadth (more towers, 3 upgrade paths x 3 tiers, synergy
towers), more rounds and freeplay, more maps, audio, save/load.

One open balance finding, measured rather than assumed and inherited from v1: a
run ends with a large unspent gold pile, because most of it accrues *during* the
final round, after the last purchase point. No pricing change can reach it --
sweeping upgrade costs down by two-thirds in v1 barely moved it. The real fixes
are more rounds or shifting income earlier.
