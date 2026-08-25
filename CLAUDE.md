# Crucible

A tower defense where towers do not deal damage -- they change what the enemy
*is*. Enemies ("charges") walk a fixed lane in a **state** (Ore, Slag, Molten,
Crystal, Vapor). Towers apply an **element** (Heat, Cold, Kinetic, Solvent), and
what happens depends on the state it hits. The player is paid per
transmutation, not per kill.

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
| `src/sim/table.ts` | **The transmutation table.** Twenty cells that define the entire game. |
| `src/sim/towers.ts`, `src/sim/waves.ts` | Tower stats and wave composition, as flat data. |
| `src/sim/world.ts` | `step()`, `applyElement()`, placement. The only place outcomes are interpreted. |
| `src/sim/path.ts` | Board dimensions, the lane polyline, buildable cells. |
| `src/render/` | Canvas drawing and DOM chrome. Read-only over the sim. |
| `src/headless.ts` | The playtest harness behind `npm run sim`. |

## Commands

```bash
npm run dev        # play it at localhost:5173
npm test           # vitest: determinism + all 20 table cells
npm run typecheck  # tsc --noEmit
npm run sim -- --all-waves                 # balance report for every wave
npm run sim -- --wave 7 --runs 200 --json  # machine-readable, for tooling
```

Loadout syntax is `towerId@col,row`, space-separated:

```bash
npm run sim -- --wave 10 --loadout "forge@5,4 chiller@1,8 stamp@8,10"
```

## Balance is measured, not guessed

Tuning means editing `src/sim/table.ts`, `towers.ts`, or `waves.ts` and then
re-running `npm run sim -- --all-waves`. The report's per-state leak breakdown
("what leaked") is the fastest way to find the actual problem -- it is how wave
10 was diagnosed as a Vapor wall rather than a general difficulty problem.

Reference points from the current tuning, all measurable:

- Correct order (Forge -> Chiller -> Stamp) on wave 1: 6 shatters, 0 leaks, 85 gold.
- Wrong order (Forge -> Stamp -> Chiller): 0 shatters, 6 splits, 12 leaks, run lost.

If a change makes those two converge, the change removed the game's whole point.

## Conventions

- Every gameplay rule goes through the table and `applyElement()`. Do not add
  special cases to tower code.
- New table behaviour means a new `Outcome` variant, handled in one switch.
- All twenty table cells are asserted in `tests/table.test.ts`. Changing a cell
  deliberately means updating that test; changing one by accident fails it.
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

The M1 vertical slice is complete and verified: 5 states, the full
transmutation table, 4 towers, 10 waves, the per-transmutation economy, build
UI, and the headless harness. `npm test` (23 tests), `npm run typecheck`, and
`npm run build` all pass, and the browser build has been confirmed to reproduce
the headless numbers exactly.

Still deliberately unbuilt, and left as the owner's own AI-tooling exercise:

- **A `balance-pass` skill** that calls `npm run sim -- --all-waves --json`,
  reads the per-state leak breakdown, and proposes table edits. The most
  valuable one to write, because its success criterion is measurable.
- **A balance-analyst subagent**, worth adding only after that skill exists,
  and best pinned to a cheaper model in its frontmatter.

M2 game scope: upgrade branches (ones that change table behaviour, not just
numbers), more maps, audio, save/load.
