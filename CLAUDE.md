# Crucible

A tower defense built around **counters and layers**. Enemies ("charges") walk a
fixed lane wearing a **state** (Ore, Slag, Molten, Crystal, Vapor). Towers throw
an **element** (Heat, Cold, Kinetic, Solvent) for damage, and how much of it
lands depends on the state it hits. Each element also leaves something behind
-- Cold slows, Heat burns, Kinetic shoves, Solvent corrodes -- at a strength
the same table cell decides, so a Chiller halves a Molten's pace and does
nothing at all to a Crystal. Break a layer and what is underneath keeps
walking: a Crystal shell becomes two Molten cores, each of which becomes a Slag
remnant. You are paid per layer broken.

The game is judged on one thing above being balanced: **more than one build has
to work.** An earlier version was fair, winnable on every seed, and still
wrong, because there was exactly one build worth making. See `npm run
diversity`.

| Document | What it holds |
|---|---|
| [DESIGN.md](DESIGN.md) | Why the mechanics are shaped this way. |
| [BALANCE.md](BALANCE.md) | What the current tuning measures, and what past tunings taught. |
| [BACKLOG.md](BACKLOG.md) | What is left to do, and why each item matters. |
| [DELEGATION.md](DELEGATION.md) | How to decide whether to hand work to a subagent. Read before delegating. |

## The one architectural rule

**`src/sim/` never imports from `src/render/` and never touches the DOM.**

The simulation is a pure function of (state, input, seed): fixed 60Hz timestep,
one seeded RNG, no wall-clock time. Breaking this rule breaks headless
playtesting, which is the most valuable thing this project has. If you need
rendering state, keep it in `src/render/`.

`tests/architecture.test.ts` enforces this by reading the source -- no import
from `src/render` inside `src/sim`, no DOM, no `Math.random()`. It has been
verified to fail when violated.

## Where things live

| Path | What it is |
|---|---|
| `src/sim/resistance.ts` | **The resistance table.** Twenty cells that define the entire game. |
| `src/sim/riders.ts` | **Riders.** One lingering effect per element, scaled by the table cell. |
| `src/sim/towers.ts`, `src/sim/waves.ts` | Tower stats and wave composition, as flat data. |
| `src/sim/upgrades.ts` | **Upgrade paths.** Two per tower, three tiers deep; the interesting tiers rewrite table cells. |
| `src/sim/world.ts` | `step()`, `applyElement()`, layer breaking, placement. The only place damage is resolved. |
| `src/sim/path.ts` | Board dimensions, the lane polyline, buildable cells. |
| `src/sim/freeplay.ts` | Rounds past the authored campaign, generated from a seed. |
| `src/sim/loadout.ts` | The `towerId@col,row[+upgradeId]` grammar the harnesses parse. |
| `src/sim/stats.ts` | Small shared numeric helpers. `median()` lives here so freeplay's seam and the diversity meter cannot drift apart. |
| `src/render/` | Canvas drawing and DOM chrome. Read-only over the sim. |
| `src/render/decisions.ts` | What the interface decides, without the interface. Pure and tested. |
| `src/render/art.ts` | Tower and monster artwork: one SVG path each, drawn on canvas and in the DOM. |
| `src/headless.ts` | The playtest harness behind `npm run sim`. |
| `src/campaign.ts` | The whole-run harness behind `npm run campaign`. |
| `src/diversity.ts` | The build-diversity meter behind `npm run diversity`, plus `breadthPlan`/`depthPlan` for the breadth-vs-depth axis it cannot itself measure. |

## Commands

```bash
npm run dev        # play it at localhost:5173
npm test           # vitest: 191 tests
npm run test:fast  # the 170 that are not balance measurements -- under a second
npm run test:sampled # whole suite, weak diversity verdict -- 8s not 55s
npm run coverage   # where the tests are, and are not
npm run typecheck  # tsc --noEmit
npm run sim -- --all-waves                 # balance report for every wave
npm run sim -- --wave 7 --runs 200 --json  # machine-readable, for tooling
npm run campaign -- --plan "forge@5,1 stamp@5,5 chiller@14,9"  # whole run, real wallet
npm run diversity                          # how many builds work, and is any tower mandatory
```

`npm run sim` places towers free and refreshes lives each round, so it measures
round pressure in isolation. `npm run campaign` runs every round on one world
with gold and lives carrying over, buying from a purchase plan only when the
wallet allows -- that is the one that can tell you a round was lost because the
player could not *afford* the answer. `npm run diversity` is the one that
matters most: it runs a large sample of compositions through the full campaign
and reports how many win and whether any tower appears in *every* winning
build. A mandatory tower means the game has a right answer again, however
healthy the difficulty numbers look.

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

Tuning means editing `src/sim/resistance.ts`, `towers.ts` or `waves.ts` and then
re-running `npm run sim -- --all-waves` **and** `npm run diversity`. Never one
without the other: healthy difficulty numbers and a game with one right answer
look identical from the sim report alone.

**[BALANCE.md](BALANCE.md) holds the current reference numbers, the two
structural rules the resistance table must obey, and the lessons past tunings
cost real time to learn.** Read it before changing a cell. The `balance-pass`
skill is the workflow that runs against it.

`npm test` spends almost all of its fifty-odd seconds on one line: the
720-build diversity sweep, which runs at module load. `npm run test:sampled`
drops that to 120 builds and the suite to eight seconds, for iterating on a
balance edit. It **skips the mandatory-tower and tower-usefulness verdicts and
says so**, because those are the assertions that read a false positive at a
small sample. It is a smoke check, never the answer -- `npm test` with no
override is, and that is what CI runs.

Balance retuning is not delegated -- see Delegation below.

## Conventions

- Every gameplay rule goes through the resistance table and `applyElement()`.
  Do not add special cases to tower code.
- **A lingering effect belongs to the element, not to the tower.** `riders.ts`
  holds one rider per element and `applyElement()` applies it at the same
  multiplier it just used for damage, so an immunity blocks the rider too and
  an upgrade that rewrites a cell moves the rider with it for free. A rider
  keyed on `TowerId` would be the special case this rule exists to prevent.
- Damage-over-time ticks must never re-enter the table. Riders resolve once, at
  the moment the hit lands, and tick as flat numbers afterwards -- resolving a
  burn tick would re-apply Heat's rider and refresh the burn forever.
- All twenty table cells are asserted in `tests/resistance.test.ts`. Changing a
  cell deliberately means updating that test; changing one by accident fails it.
- The layer chain in `STATES` only ever runs inward, which is what bounds a
  cascade. Nothing may put a layer back on.
- **Put interface logic in `src/render/decisions.ts`, not in an event handler.**
  Every interface bug this project has had came from logic tangled with the DOM
  where no test could reach it -- a selected tower that could not be deselected,
  a panel showing the previously clicked tower, and a board that ignored every
  tap because it read the target cell from a mousemove, which made the game
  unplayable on a phone. If a change involves a decision rather than a drawing,
  it belongs in that module with a test named after what it protects.
- `window.crucible` exists in dev builds for driving the sim from the console
  (`crucible.place('forge',5,4)`, `crucible.startWave()`, `crucible.advance(1200)`).
  Handy because requestAnimationFrame pauses in a hidden tab.

## Automated checks (hook)

A `PostToolUse` hook runs `npm run typecheck && npm run test:fast` after any
edit to a `.ts` file under `src/` or `tests/`. It lives in
`.claude/hooks/check-after-edit.sh`, wired up in `.claude/settings.json`. On
failure it exits 2 and prints the output to stderr, which is Claude Code's
convention for "block and feed this back to the model", so a broken edit
surfaces immediately. Edits to other file types exit 0 without running
anything.

`test:fast` is `npm test` minus `tests/campaign.test.ts`,
`tests/diversity.test.ts` and `tests/breadth.test.ts` -- 170 of the 191 tests,
about half a second against roughly fifty for the full run. Those three files
are almost the entire cost, and they answer a question about balance rather
than about whether the edit just made compiles. **Run `npm test` yourself after
a balance change.** CI runs the full suite on every push before it will deploy,
so nothing merges on the fast set alone.

Hooks reload at session start, so changes to the script or settings take effect
in the next session.

## Delegation

Three subagents live in `.claude/agents/`. There is no fourth: the CTO is *this
session*, whatever model it was started with.

| Agent | Model | For |
|---|---|---|
| `developer` | Sonnet | An already-scoped change. Reads, edits, tests, commits on the current branch. |
| `qa` | Haiku | Running the existing checks and reporting them. Read-only apart from mechanical fixes outside `src/sim/`. |
| `architect` | Opus | Escalation *upward* from a cheaper session: a hard design question, or an independent review. No Write or Edit -- it advises. |

**[DELEGATION.md](DELEGATION.md) holds how to decide, and it is not obvious --
read it before the first delegation in a session.** Delegating costs more
tokens than doing the work here, not fewer; what it buys is a cheaper unit
price and context that is paid once. The short version is that a good
delegation needs noisy output or a fully specifiable brief, and that a task too
small to be worth a cold boot should simply be kept.

Three rules that hold without reading it:

- **Delegated work is not finished until this session has read the diff.**
- **Balance retuning is never delegated.** It runs through the `balance-pass`
  skill in this session, because the diversity verdict is a judgement call
  about the game's identity rather than a number to report.
- **This session may keep any task.** No obligation to delegate overrides that.

## Git

Git is the source of truth, and agents work in a way that stays reviewable.
This applies to every session and every subagent.

- Substantial work gets a feature branch and a pull request. Nothing lands on
  `main` directly.
- **Push and merge need the owner's explicit approval, every time.** The
  `permissions.ask` block in `.claude/settings.json` forces a prompt on
  `git push`, `git merge` and `gh pr merge` as a backstop; the rule holds
  whether or not the prompt fires.
- Commits are coherent and their messages say the intent. No secrets, no build
  output, no scratch files -- `dist/` and `node_modules` are already ignored.
- Subagents commit but never push, merge, or change branches.

## Where the project stands

v2.1 is current: HP and damage, layers that break inward, money per layer, 5
towers with two three-tier upgrade paths each, 20 authored rounds, seeded
freeplay past them, and four harnesses. `npm test` (191 tests), `npm run
typecheck` and `npm run build` all pass. [BALANCE.md](BALANCE.md) records how
it got here.

Remaining work is in [BACKLOG.md](BACKLOG.md), including the one item with a
known risk: the game has never been tested on a real phone. Touch placement was
broken until recently and the fix was only verified against emulated events.

Still unbuilt: **a balance-analyst subagent**, best pinned to a cheaper model
in its frontmatter.
