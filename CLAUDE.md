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

## Deliberately not built yet

No `.claude/skills`, no hooks, no subagents -- those are the owner's to write,
and the codebase was shaped to make them easy: deterministic sim, flat balance
data, and a harness with `--json` output.

M2 scope: upgrade branches, more maps, audio, save/load.
