---
name: balance-pass
description: Diagnose and retune Crucible's difficulty from measured data instead of intuition. Use when asked to balance the game, retune a wave, fix a wave that is too hard or too easy, investigate leaks, adjust the transmutation table, tower stats, or wave composition, or check whether a gameplay change broke difficulty. Runs the headless sim, reads the per-state leak breakdown, proposes a minimal edit, and re-measures to prove the edit worked.
---

# Balance pass

Crucible's balance is measured, never guessed. Every claim about difficulty in
this project comes from `npm run sim`, and a balance change is not finished
until the same command shows it worked.

The loop is always: **measure -> diagnose -> minimal edit -> re-measure ->
check the invariants.** Do not skip straight to editing `table.ts` because a
wave "feels" hard.

## 1. Measure

Run the canonical loadout across every wave:

```bash
npm run sim -- --all-waves --loadout "forge@2,1 forge@5,1 forge@5,5 chiller@5,9 chiller@8,9 chiller@8,13 stamp@11,9 chiller@12,13 chiller@14,9 stamp@14,7 chiller@18,7 stamp@18,3 stamp@19,9 stamp@22,11" --runs 50 --seed 1
```

Loadouts take an optional `+upgradeId` per tower (`stamp@11,9+dampened`), so
upgrades are measurable here rather than only clickable in the browser. The
reference loadout deliberately buys none, which is what makes it a control: if
a change to an upgrade moves the baseline, something has leaked out of the
opt-in path and into the base table.

That loadout is the reference build and must not be changed casually --
changing it invalidates every number below. It is fourteen towers laid out in
lane order (Forge bank -> Chiller bank -> Stamp bank, with a second Chiller
bank mid-lane to catch splits), representing competent late-game play. Running
`--all-waves` **without** a loadout measures raw wave pressure with no towers
at all, so every wave reads as a total loss; that mode is only useful for
asking "how much damage does this wave do if completely unopposed".

Add `--json` when you want to compare fields precisely rather than eyeball a
table. The JSON is `{loadout, runs, seed, results[]}`, and each result carries
`winRate`, `avgLivesLost`, `avgLeaks`, `avgGold`, `avgTicks`, `avgSplits`,
`avgShatters`, and `leaksByState` (a per-state leak count, the single most
useful field in the whole report).

`reference/baseline.json` in this skill holds the committed output of exactly
the command above. Diff against it to see what a change actually moved:

```bash
npm run sim -- --all-waves --loadout "$(cat .claude/skills/balance-pass/reference/loadout.txt)" --runs 50 --seed 1 --json > /tmp/after.json
```

## 2. The baseline, as committed

| wave | win% | leaks | gold | shatters | what leaks |
|---|---|---|---|---|---|
| 1 | 100 | 0.00 | 69 | 6 | -- |
| 2 | 100 | 0.00 | 105 | 10 | -- |
| 3 | 100 | 0.00 | 133 | 14 | -- |
| 4 | 100 | 0.00 | 65 | 6 | -- |
| 5 | 100 | 0.00 | 167 | 18 | -- |
| 6 | 100 | 0.00 | 62 | 5 | -- |
| 7 | 100 | 0.00 | 83 | 6 | -- |
| 8 | 100 | 1.52 | 266 | 32 | MOLTEN 1.52 |
| 9 | 100 | 3.00 | 277 | 35 | MOLTEN 3 |
| 10 | 100 | 6.88 | 358 | 45 | ORE 1, MOLTEN 5.88 |

Waves 1-7 are clean and waves 8-10 ramp -- 1.52, 3.00, 6.88 leaks -- which is
the shape to preserve. The reference build should clear the game while being
visibly stressed at the end, so a regression shows up as new leaks rather than
being absorbed by an overbuilt board. A flat tail means the board is
overbuilt; a dip in the middle (wave 9 once sat at 0.02 between neighbours at
1.52 and 6.88) means that wave is skippable and should be reshaped.

Read the table for shape, not just for failures. Gold climbing steadily and
shatter counts rising with wave size is the economy working as designed; a wave
that pays far less than its neighbours is a balance problem even at 100% win
rate, because it starves the player of the next tower.

## 3. Measure affordability, not just survivability

`npm run sim` places towers free and hands every wave a fresh twenty lives, so
it can prove a wave is *survivable* while saying nothing about whether the
player could have afforded the towers that survived it, or how much damage has
already accumulated. Those are the two ways a tuning change breaks a real run,
so check them with the campaign harness:

```bash
npm run campaign -- --plan "$(cat .claude/skills/balance-pass/reference/plan.txt)" --runs 10
```

That runs all ten waves on one world -- gold and lives carry over -- buying the
next tower in the plan at each wave start if and only if the wallet covers it.
Because it stops at the first tower it cannot afford, an expensive tower at the
head of the plan blocks the cheap ones behind it, which is how a saving
strategy differs from a greedy one.

The committed plan in `reference/plan.txt` wins all ten waves on every seed
tried, averaging **12.5 of 20 lives left** (12 on seed 1). Treat both halves as
the thing to protect: 100% won means the game stays fair, and roughly half the
life bar spent means it stays tense. A change that keeps the win rate but sends
lives back toward 20 has quietly removed the difficulty; one that drops the win
rate below 100% has made the reference plan unviable, which is a different and
worse problem.

Two failure signatures this catches and `npm run sim` cannot:

- **"LOST on wave N" with gold to spare.** The wave was survivable; the player
  just could not buy the answer in time. Fix the economy or the wave, not the
  table. Wave 4 is the pressure point -- it is all Molten, and it affords
  exactly one tower. Any rule that needs *two* towers to resolve safely is a
  rule wave 4 cannot satisfy, which is worth checking before you add one.
- **"N tower(s) still unbought"** at the end of a winning run. The plan ran out
  of things to buy before the wallet ran out of gold, so the run was never
  purchase-limited. The committed plan ends with 3 towers unbought and **330
  gold unspent** -- it now runs out of *waves* rather than gold, which is the
  healthy version of this signal. When it ended with 924 gold spare and nothing
  left to buy, the late economy was paying far more than there was to spend
  it on.

The cross-check the campaign exists to make visible: the Vat is the opening
purchase the economy is designed around, so any rule that punishes owning one
punishes the player for learning the game as taught. `MOLTEN/SOLVENT` used to
yield VAPOR and cost the committed plan six lives on wave 4 for exactly that
reason; it now quenches to SLAG. There is still no sell mechanic, so a bad
purchase remains permanent -- weigh that before adding any cell that makes a
tower situationally harmful.

## 4. Diagnose from `leaksByState`

The leak breakdown names the broken table cell almost every time. Map the
leaking state back to what should have consumed it:

- **ORE leaking** -- nothing is converting it. Either Heat throughput is too
  low for the wave's spawn `gap`, or `ORE/KINETIC` damage (currently 1, so
  eight hits) is doing the killing and cannot keep up. Prefer fixing throughput
  over buffing the Kinetic chip; the chip is deliberately unglamorous.
- **MOLTEN leaking** -- the commonest failure, and usually *not* a Molten
  problem. It means Cold throughput is behind Heat throughput, or Kinetic is
  reaching Molten first and `MOLTEN/KINETIC` split x3 is multiplying the
  backlog. Check `avgSplits`: a high split count next to Molten leaks is the
  classic wrong-order disaster, and the fix is wave composition or tower
  cooldown, not the split itself.
- **CRYSTAL leaking** -- Kinetic is not reaching the end of the line, or a
  Forge sits too late and `CRYSTAL/HEAT` is melting the player's own work back
  to Molten.
- **VAPOR leaking** -- only Cold and Solvent touch Vapor, and Kinetic cannot
  even target it. Vapor costs three lives, so a handful of Vapor leaks loses a
  run outright. This is how wave 10 was diagnosed as a Vapor wall rather than a
  general difficulty problem.

  **A Vapor problem often does not show up as Vapor leaks.** `VAPOR/COLD`
  yields MOLTEN rather than a kill, so a board with enough Chillers converts
  every Vapor and then drowns in the Molten it just created. Measured: raising
  wave 10's Vapor group from 5 to 8 against the reference build left Vapor
  leaks at zero and pushed *Molten* leaks from 1.02 to 5.94 and lives lost from
  2.04 to 11.88. So when Molten leaks jump on a wave that contains Vapor,
  suspect the Vapor group first and check whether `avgShatters` rose too -- if
  the line is shattering more than baseline and still leaking, it is
  saturated downstream, not failing upstream.
- **SLAG leaking** -- rare; means Solvent stripped Ore but no Kinetic followed.

## 5. Edit the smallest thing that could work

In order of preference, because each is a wider blast radius than the last:

1. **`src/sim/upgrades.ts`** -- an upgrade branch, when the problem is that one
   strategy has no answer rather than that the game is too hard. A branch is a
   paid, opt-in table rewrite, so it changes nothing for players who do not buy
   it -- which makes it the *safest* place to put a rule change that would be
   too strong as a global edit. Both branches now called Deposition Coil and
   Reclaimer began as global table edits and were reverted for exactly that
   reason: Cold answering everything flattened the game.
2. **`src/sim/waves.ts`** -- wave composition. Changing a `count`, `gap`, or
   `delay` fixes one wave and touches nothing else, which makes it the first
   thing to reach for when the game itself is sound and one wave is not. Wave
   10's Vapor group was tuned from eight down to five exactly this way.
3. **`src/sim/towers.ts`** -- tower stats (`cost`, `range`, `cooldown`,
   `splash`). Affects every wave, but changes no rules. A throughput problem is
   usually a `cooldown` problem.
4. **`src/sim/table.ts`** -- the transmutation table. This is the game's
   identity, not a tuning knob. Change a cell only when the *rule* is wrong,
   not when a number is wrong, and never to paper over a throughput problem.

Never add a special case to tower code. Every gameplay rule goes through the
table and `applyElement()`; a new kind of interaction means a new `Outcome`
variant handled in the one switch in `src/sim/world.ts`.

If you change a table cell, update its assertion in `tests/table.test.ts` in
the same edit. All twenty cells are asserted there precisely so that a
deliberate change is a visible test edit and an accidental one is a failure.
The repo's PostToolUse hook typechecks and tests after any edit under `src/` or
`tests/`, so a forgotten test update surfaces immediately -- but only for edits
made with the Write or Edit tools, not for shell-based edits.

## 6. Re-measure, and check the two invariants

Re-run the command from step 1 and compare against the baseline table. Report
the change as a before/after on the waves that moved, not as prose.

Then check the invariants that protect the game's whole point. First, order
still has to matter on wave 1:

```bash
npm run sim -- --wave 1 --loadout "forge@5,4 chiller@1,8 stamp@8,10" --runs 20
npm run sim -- --wave 1 --loadout "forge@5,4 stamp@1,8 chiller@8,10" --runs 20
```

Correct order (Forge -> Chiller -> Stamp) must give **6 shatters, 0 leaks, 59
gold, 100% win**. Wrong order (Forge -> Stamp -> Chiller) must give **0
shatters, 6 splits, 12 leaks, 16 gold, 0% win**. If a change makes those two converge,
the change removed the reason the game exists -- revert it, whatever it did to
the win rates.

Second, no wave may sit at 100% win with zero leaks *and* below its neighbours
in gold: that is a wave the player can ignore, which is worse than a wave they
lose.

## 7. Report

Say what leaked, what you changed and why, and the before/after numbers. If a
proposed edit did not fix the measured problem, say so and leave it reverted
rather than shipping a change that merely felt principled. If the baseline
retune is accepted as the new intended difficulty, regenerate the committed
reference so future passes diff against reality:

```bash
npm run sim -- --all-waves --loadout "$(cat .claude/skills/balance-pass/reference/loadout.txt)" --runs 50 --seed 1 --json > .claude/skills/balance-pass/reference/baseline.json
```

and update the baseline table in section 2 to match.
