---
name: balance-pass
description: Diagnose and retune Crucible's difficulty and build diversity from measured data instead of intuition. Use when asked to balance the game, retune a round, fix a round that is too hard or too easy, investigate leaks, adjust the resistance table, tower stats, or wave composition, check whether one tower has become mandatory, or check whether a gameplay change broke difficulty. Runs the headless sim, the campaign, and the build-diversity meter, reads the per-state leak breakdown, proposes a minimal edit, and re-measures to prove the edit worked.
---

# Balance pass

Crucible's balance is measured, never guessed. Every claim about difficulty in
this project comes from a harness, and a balance change is not finished until
the same commands show it worked.

The loop is always: **measure -> diagnose -> minimal edit -> re-measure ->
check the invariants.** Do not skip straight to editing the table because a
round "feels" hard.

## 0. The thing this game is actually judged on

Being balanced is necessary and **not sufficient**. The previous version of
this game was fair, survivable and winnable on every seed, and it was still
wrong, because there was exactly one build worth making. Before and after any
change, run:

```bash
npm run diversity
```

It runs a large sample of compositions through the full campaign and reports
how many win, and whether any tower appears in *every* winning build. A
mandatory tower means the game has a right answer again, whatever the
difficulty numbers say. Current state: **28 of 150 sampled builds clear all ten
rounds, in 28 distinct compositions, with no tower mandatory.**

Two failure modes it detects, both of which have really happened here:

- **A mandatory tower.** Usually caused by an asymmetry rather than a stat: the
  Vat became mandatory the moment Solvent was the one element with no immunity
  anywhere in its column, and the Forge became mandatory when it was both the
  cheapest tower *and* the best answer to Ore.
- **A dead tower.** A tower appearing in no winning build is decoration. v1's
  Vat appeared in none of them, which is how that whole version was diagnosed.

## 1. Measure round pressure

```bash
npm run sim -- --all-waves --loadout "$(cat .claude/skills/balance-pass/reference/loadout.txt)" --runs 50 --seed 1
```

Loadouts take an optional `+upgradeId` per tower (`stamp@11,9+dampened`), so
upgrades are measurable rather than only clickable in the browser.

Add `--json` to compare fields precisely. Each result carries `winRate`,
`avgLivesLost`, `avgLeaks`, `avgGold`, `avgTicks`, `avgBreaks`, `avgWasted`,
and `leaksByState` -- the per-layer leak count, still the most useful field in
the report. `avgWasted` counts shots landing on something immune to them, which
is the fastest way to spot a build with no answer to a layer.

`reference/baseline.json` holds the committed output of exactly that command.

## 2. The baseline, as committed

| round | win% | leaks | gold | breaks | what leaks |
|---|---|---|---|---|---|
| 1 | 100 | 0.00 | 40 | 12 | -- |
| 2 | 100 | 0.00 | 59 | 22 | -- |
| 3 | 100 | 0.00 | 78 | 34 | -- |
| 4 | 100 | 0.00 | 90 | 28 | -- |
| 5 | 100 | 0.00 | 159 | 74 | -- |
| 6 | 100 | 0.00 | 78 | 12 | -- |
| 7 | 100 | 0.00 | 166 | 50 | -- |
| 8 | 100 | 0.00 | 202 | 82 | -- |
| 9 | 100 | 1.70 | 311 | 109 | MOLTEN 1.7 |
| 10 | 100 | 4.00 | 413 | 168 | MOLTEN 4 |

Rounds 1-8 clean and 9-10 ramping is the shape to preserve. A flat tail means
the board is overbuilt; a dip in the middle means that round is skippable.

## 3. Measure affordability

```bash
npm run campaign -- --plan "$(cat .claude/skills/balance-pass/reference/plan.txt)" --runs 20
```

All ten rounds on one world, gold and lives carrying over, buying only when the
wallet covers it. The reference plan wins on every seed with about **9 of 20
lives left**, all the damage in rounds 8-10.

This is the harness that catches economic causes, which look nothing like
tactical ones. The Forge was mandatory for a while not because Heat was too
strong but because it was the cheapest tower on the board, so every build that
skipped it fell a tower behind and died on round 2.

## 4. Diagnose from `leaksByState`

The leak breakdown names the problem almost every time. Map the leaking layer
back to what should have stopped it, remembering that **Molten leaks are often
a Crystal problem**: shattering Crystal is correct play and it fills the lane
with Molten, which Heat cannot touch at all.

- **ORE leaking** -- not enough raw throughput early. Heat and Kinetic are both
  strong here, so this is usually a quantity problem, not a counter problem.
- **SLAG leaking** -- remnants outrunning the back of the line. Slag is fast
  and weak; something cheap needs to cover the tail of the lane.
- **MOLTEN leaking** -- the commonest failure. Cold and Solvent are the only
  answers, Heat is useless. Check whether the Molten is *spawned* or falling
  out of broken Crystal; if the latter, the fix belongs near the Stamps.
- **CRYSTAL leaking** -- only Kinetic and Heat touch it. Cold and Solvent are
  both wasted, so a Chiller-and-Vat board will watch Crystal walk past.
- **VAPOR leaking** -- Solvent and Cold only; Kinetic passes through and Vapor
  floats over every ground-only tower. It costs three lives, so a handful ends
  a run.

Cross-check with `avgWasted`. A high wasted count alongside leaks of the same
layer means the build has no answer at all, rather than not enough of one --
those need different fixes.

## 5. Edit the smallest thing that could work

In order of preference, because each is a wider blast radius than the last:

1. **`src/sim/upgrades.ts`** -- a branch, when one strategy lacks an answer
   rather than the game being too hard. Branches are paid and opt-in, so they
   change nothing for players who skip them, which makes them the safest home
   for a rule change. A branch that partly lifts an immunity is the strongest
   thing available and the best tool for widening the set of viable builds.
2. **`src/sim/waves.ts`** -- round composition. Changing a `count`, `gap` or
   `delay` fixes one round and touches nothing else.
3. **`src/sim/towers.ts`** -- tower stats. Watch `cost` especially: an
   unusually cheap tower becomes mandatory through the economy rather than
   through the table.
4. **`src/sim/resistance.ts`** -- the table itself. This is the game's
   identity. Change a cell only when the *shape* is wrong, and never without
   re-running `npm run diversity`, because table edits are how mandatory towers
   are created.

Never add a special case to tower code. Every rule goes through the resistance
table and `applyElement()`.

If you change a cell, update `tests/resistance.test.ts` in the same edit. The
PostToolUse hook typechecks and tests after any edit under `src/` or `tests/`
made with the Write or Edit tools -- not for shell-based edits.

## 6. Re-measure, and check the invariants

Re-run steps 0, 1 and 3, and report before/after on what moved.

Then check the three properties that protect this version's whole point. All
three are asserted in `tests/diversity.test.ts` and `tests/resistance.test.ts`,
so `npm test` is the quick version:

1. **Every single tower still clears round 1 alone.** The opening must stay a
   preference rather than a puzzle.
2. **No tower is mandatory, and no tower is dead.**
3. **The table keeps its shape**: every element useless against exactly one
   layer, every layer with at least two counters.

Pressure and diversity trade against each other, and the trade is measurable.
Scaling the late rounds up gradually reduces the number of winning builds; at
roughly double the current counts, Stamp becomes mandatory and the game has a
right answer again. Current tuning sits deliberately below that cliff.

## 7. Report

Say what leaked, what you changed and why, and the before/after numbers,
including the diversity verdict. If an edit did not fix the measured problem,
say so and leave it reverted. If a retune is accepted, regenerate the committed
reference:

```bash
npm run sim -- --all-waves --loadout "$(cat .claude/skills/balance-pass/reference/loadout.txt)" --runs 50 --seed 1 --json > .claude/skills/balance-pass/reference/baseline.json
```

and update the table in section 2 to match.
