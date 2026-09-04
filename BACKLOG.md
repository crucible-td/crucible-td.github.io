# Backlog

Things known to be worth doing, in no strict order. Items move out of here when
they ship; the reasoning behind each is kept so that picking one up later does
not mean rediscovering why it mattered.

## Verified defects from a review pass

One left of the three. The other two shipped: a splash that cleared the cascade
it had just created, because both `advanceProjectiles` and `advanceEffects`
walked `w.charges` while `breakLayer` pushed children onto it; and a hover tag
that quoted a layer's base HP while the health bar beside it showed the real
number.

The lesson the splash one left is worth keeping. It sat on a line `npm run
coverage` already reported as covered -- `src/sim/world.ts` is at 100%
statements -- under a comment stating the exact property it broke, and nothing
caught it for as long as nobody checked. Statement coverage measures which
lines ran, not which properties hold. The one below lives in `src/main.ts`,
which coverage excludes on purpose as an entry point: a reasonable exclusion
that happens to mean nothing watches the dev console handle at all.

### `crucible.advance()` returns aliased statistics

The dev console handle spreads `world.stats` shallowly, so `leaksByState` in
every snapshot it returns is the *same live object*. Take three readings across
a session and all three report the final values. Small, but a debugging tool
that lies is the worst kind, and this one cost time during the review that found
it. Copying the counter rather than aliasing it is the whole fix.

## The player cannot see how tough anything is -- shipped

Toughness -- `hpScale` -- is the entire late-game difficulty curve. Rounds 16 to
20 run at scales of 12 to 55, freeplay turns no other dial, and it used to be
the one variable the board did not show.

Three channels now carry it. The hover tag quotes the charge's real HP; the
round preview strip names each layer's toughness before the round starts; and
the board draws **shell rings** -- one concentric ring per tier of
`toughnessTier()`, at x3, x10, x32 and x100, with a slab's outermost ring fired
pale so it differs in kind and not only in count. Rings are decoration:
`chargeRadius` remains the single source of truth for picking, so a charge you
can see is still a charge you can point at. Rounds 1 to 4 carry no `hpScale` at
all and stay bare, which keeps the rounds that teach an immunity from also
introducing armour.

**The "raise the cap" half was tried and rejected by looking at it.** This item
used to argue the `Math.min(Math.sqrt(scale), 2.1)` cap was a layout problem
rather than a real constraint. It is a real constraint: at the cap a Crystal is
already 34px of radius on a lane 40px wide, and a screenshot of round 20 in play
shows the lane as a solid column of overlapping bodies. Raising it to 2.4 -- 39px
against a 40px lane -- made the crowd measurably harder to read, so it went back
to 2.1 and the ring channel carries the range instead. Do not re-propose the cap
without looking at round 20 first.

## Three of the Matter panel's five rows are below the fold

The panel now rebuilds from the best cell the player actually owns rather than
from the base `RESISTANCE` table, so buying Absolute Zero visibly lifts
Crystal/Cold off the wall instead of being denied by the interface. What is
left is that most of it cannot be seen.

At 1280×720 the sidebar runs to 789px against a 720px viewport, so three of its
five rows sit below the fold. An earlier pass compacted the sidebar to get the
panel on screen, and it is on screen — but only two rows of it are. This is the reference the interface treats
as the entire game, and most players see 40% of it without scrolling.

## Selling towers

Nothing in this game can be undone. There is no sell, no move, no refund and no
respec: a tower placed is placed for the rest of the run, and a path climbed is
climbed.

That is a defensible rule in a game about commitment and an odd one in a game
about counters. The premise is "read the layer, bring the answer", and round 4
is the round that teaches Heat does nothing to Lava. A player who learns that
the intended way — by having already built two Burners — has exactly one
recovery available, which is to out-build the mistake with gold they do not have
yet.

The cost is paid in the property this project is judged on. A player who cannot
undo a composition is a player who stops trying compositions and starts looking
up the right one, and "there is a right one" is the failure state the diversity
meter exists to catch. The meter cannot see this: it samples compositions fixed
up front and never revised, so the entire cost of irreversibility is invisible
to every harness in the repo.

A sell at some fraction of outlay — 60% is the genre default — is a small change
with a real balance surface, because it is also a gold sink and therefore a
partial answer to the surplus recorded below. It wants `npm run campaign` and
`npm run diversity` on the far side, and the refund fraction should be treated
as the dial to measure rather than a number to guess once.

## What the hot path pass measured -- mostly shipped

The item that used to sit here said the simulation spent three-quarters of its
time deciding what to shoot, from a `node --cpu-prof` run over round 20 against
a 40-tower board. Two of its three fixes shipped and the 720-build diversity
sweep fell from **37.8s to 23.6s**, taking `npm test` from about 53s to 32s.
Every step was checked by requiring the sweep and the reference campaign to
produce output identical to the baseline, byte for byte.

What shipped, and what each was actually worth:

- **Squared distances instead of `Math.hypot`** in the range, splash and impact
  thresholds -- 37.8s to 28.1s, by far the largest single win. The root is
  discarded either way; the projectile's movement vector still takes it, on the
  branch that uses it.
- **A cached lane position on `Charge`** -- 28.1s to 23.6s. `pointAt` scans the
  lane's segments and allocates a point on every call, and it was called per
  charge per tower, then again per projectile, per splash candidate and per
  event.

Two results worth keeping, because both contradict what this file predicted:

- **The id-to-charge map made it slower and was dropped.** Replacing
  `advanceProjectiles`'s linear `find` with a `Map` built once per tick cost a
  consistent 1.85s across three runs each way -- 29.96-30.12s against
  28.16-28.23s. There are usually only a handful of projectiles in flight
  against forty-odd charges, so building the index every tick costs more than
  the scans it saves. Do not re-propose it without measuring first.
- **Resolving each tower's stats once instead of twice did not move the clock**,
  despite `fireTowers` holding 13.5% self time in the profile. It was kept
  anyway, because it is strictly less work and one tower resolving its own
  stats twice per tick read as a mistake.

Still open, and small: `src/render/canvas.ts` calls `pointAt(c.dist)` where it
could now read `c.x`/`c.y`. It is not on the simulation's hot path, so it buys
frame time rather than harness time.

The general lesson is the one the numbers keep repeating: a profile names the
expensive function, not the profitable change.

## The simulation carries the interface's data

To be clear about what this is not: the one architectural rule is not broken.
That rule is directional — `src/sim/` never imports from `src/render/` and never
touches the DOM — and it holds, with `tests/architecture.test.ts` proving it on
every run. The observation is narrower. It is that "`src/sim` is the simulation"
is a little less true than the documents around it imply.

`src/sim/types.ts` declares `label`, `color` and `radius` on `StateDef`, and
`name`, `color` and `blurb` on `TowerDef`; `src/sim/towers.ts` fills them in. So
the pure layer owns five hex colours, five drawn radii, five display names and
five sentences of marketing copy. None of it is reachable by the rule's test,
because a rule about the direction of imports cannot see data sitting on the
correct side of the arrow.

There is a runtime cost as well as an aesthetic one, and it lands on the hot path
the performance item above is about. `effective()` returns `color`, and
`fireTowers` copies that string onto every projectile it creates. The simulation
therefore allocates and copies a hex string it never reads, once per shot, in the
function the profiler puts second.

The test that appears to justify keeping the colours here does not actually
require it. `tests/palette.test.ts` — which enforces the genuinely good rule that
a layer is never painted in the hue of an element it is immune to — imports from
`src/render/art.ts` and `src/sim/` together. It needs both importable, not
co-located.

Two ways to go, and the choice is not obvious:

- **Leave it, and say so on purpose.** It is cheap, nothing is broken, and the
  alternative adds a directory for five colours. If this is the answer, the
  reason belongs in a comment on `StateDef`, because the current silence reads as
  an oversight rather than a decision.
- **Move the presentational fields to a `src/shared/` both layers may import.**
  This is the only option that lets the simulation be lifted out as a library —
  for a different front end, or a server-side harness — without carrying the
  artwork with it. It also lets `Projectile` stop holding a colour.

Not urgent either way. Recorded because the project defends its architecture
carefully and this is the one place the defence does not quite reach, and because
whoever eventually asks "why does a projectile have a colour" should find the
answer here rather than working it out again.

## Checks that do not run where the policy says they do

One gap left between a rule this project states and the thing meant to enforce
it. The other closed: CI now triggers on `pull_request` as well as on a push to
`main`, so a change is verified before it merges rather than after.

**The purity rule is enforced for two of its three clauses.** CLAUDE.md
describes the simulation as "a pure function of (state, input, seed): fixed 60Hz
timestep, one seeded RNG, no wall-clock time", and `tests/architecture.test.ts`
asserts the render-import ban, the DOM ban and the `Math.random` ban. It does
not assert the third clause. A `Date.now()` or `performance.now()` in `src/sim`
would pass every check in this repo and silently desynchronise the browser from
`npm run sim`, which is the exact failure that file exists to prevent. One more
assertion, in the style of the three already there.

While in that file: the `Math.random` check strips comments before matching and
the DOM check does not, so a `src/sim` file that merely *mentions* `window.` in
a doc comment fails it. Harmless today; confusing on the day it fires.

## A round preview the player can plan against -- shipped

A strip above Start wave now names what the round contains: each layer's glyph,
how many of it, and its toughness as a plain multiplier, omitted at x1. It
answers the three things a player actually plans against, none of which used to
be on screen -- the only way to learn what round 17 held was to lose to it once.
`roundHint`'s sentence stays under the board; it was good prose about the round's
character and a poor substitute for its composition.

Two details worth keeping:

- **Freeplay is previewed without being built.** `freeplayWave` draws from the
  seeded RNG, so a preview that called it would desynchronise the browser from
  `npm run sim` on every frame. `freeplayShape` is the same composition with the
  toughness jitter left off; the strip marks those rows approximate (`~x29`) and
  the leading slab, which takes no roll, exact. `npm run sim -- --all-waves` and
  the reference campaign were required to produce byte-identical output across
  the split.
- **Toughness is not folded together.** Groups merge only when the layer *and*
  the rounded toughness match, so round 20's x55 Crystal slab keeps its own row
  beside the x17 Ore. That is the whole point: the board draws them at the same
  size, because `chargeRadius` caps its toughness term far below where the late
  rounds live -- see the open item above.

**Possible later improvement: a word ladder instead of the number.** "Tough /
heavy / slab" would read more easily than `x55`, and for a player who is not
reading the number as a multiplier it would teach the mechanic better. It was
not shipped first because bucketing hides the size of the jump -- x17 and x55
would both be "slab" -- and that jump is the information the strip exists to
carry. Worth revisiting as a label *beside* the number rather than instead of
it.

## Small, verified, low-risk

- **`MAX_CHILL` is currently unreachable.** The strongest Cold cell available
  anywhere, upgrades included, is `depo3`'s ×1.75 on Crystal, which yields
  1.75 × 0.22 = 0.385 against a cap of 0.6. The cap is documented as a guard
  against a future upgrade rather than a number the base tower sits on, which is
  fair — but nothing in the game comes within a third of it, so it is guarding a
  hypothetical. Worth knowing before tuning Cold.
- **Where a comment asserts an invariant, consider a test.** The splash defect
  above lived under a comment stating the exact property it broke, on a line
  reported as covered, for as long as nobody checked. A pass over the "so that X
  cannot happen" comments — there are perhaps a dozen — asking which of them a
  test actually holds, would be cheap, and would have caught that one.
- **A projectile is deleted by setting its speed to -1.** `advanceProjectiles`
  marks a spent or orphaned projectile for removal by assigning `-1` to
  `p.speed`, then filters the array on `p.speed > 0`. It works, and it is the
  one place in the simulation where the code is cleverer than it needs to be: a
  physics field doubles as a deletion flag, so `Projectile.speed`'s type stops
  describing its domain and removal becomes coupled to a magnitude. A `dead`
  flag, or collecting the survivors directly, says the same thing plainly. Pure
  readability — this is not a bug and should not be filed as one.
- **No linter or formatter.** Arguable at seven thousand lines, and the
  architecture test already covers the rule that matters most. Noted only
  because this codebase leans unusually hard on hand-written invariants, and a
  lint rule is cheaper to maintain than a paragraph of prose.

## Verify on a real phone

**Status: unverified, and the item whose risk is hardest to retire, because
it needs a device this project cannot drive.**

The game is now published at a public URL, so people will open it on phones.
Touch placement was broken until recently — the board read its target cell from
`hover`, which is only ever set by `mousemove`, an event touch devices never
send, so every tap did nothing at all.

That is fixed and the layout was made responsive, but the verification was done
in an emulated viewport: layout checked at 1280, 768 and 375 wide with no
horizontal overflow, and the tap path exercised by dispatching the exact event
sequence a tap produces (a `click` with no preceding `mousemove`) against a
355px-wide canvas. A genuine hardware tap could not be driven through the
tooling available.

What to check on an actual device:

- Tapping a buildable cell places the armed tower, and tapping a placed tower
  deselects.
- Tapping a placed tower with nothing armed opens its upgrade panel, and the
  panel is usable — the tier buttons are the smallest touch targets in the UI.
- The board is large enough to aim at a single 40px cell with a fingertip. If
  it is not, the fix is a larger effective hit area rather than a bigger board.
- Pause and the speed control are reachable without zooming.

Failure here is likely to be about precision rather than about events firing.

Measured since this was written: on a 375px-wide viewport the board renders at
355px, which puts a grid cell at **14.8 CSS pixels** against the roughly 44px
both platform guidelines ask for. A cell is about a third of a comfortable
touch target, so precision is not a worry to confirm — it is arithmetic already
done.

The sharper version of the risk turns out not to be placement at all. Hovering
a charge to ask what it is — the tag naming the layer, its counters and its
immunities — is the best teaching surface in the game, and it is bound to
`mousemove`, an event a touch device never sends. On a phone that tag **does
not exist**. The layer system is what the game is about, and the phone build
currently teaches it only through the Matter panel and the round hints. A
tap-to-inspect reusing `pickCharge` with a more generous radius would answer
this and the cell-size problem together, since both want the same thing: a
larger effective hit area.

## Cut the token cost of how sessions are run

**Not a code change. Prompted by hitting the Pro plan's weekly limit.**

Analysis of where a week's tokens actually went, in rough order of size:

1. **Conversation length dominates.** Every request re-sends the whole
   conversation, so a token spent early is re-billed on every later turn. The
   expensive pattern is one long session covering several unrelated jobs; the
   cheap one is a session per task. This is free to fix and worth more than
   everything below it combined. (Caveat: prompt caching makes re-sent context
   cheaper than the raw count suggests, and how the weekly limit counts cached
   reads is not something this project can observe -- so the direction is
   certain and the multiplier is not.)
2. **Whole-file reads.** Dumping a 300-line file to read one section costs
   ~4k tokens *and* keeps them in context for the rest of the session.
   Targeted line ranges and greps instead.
3. **Oversized pull request bodies.** Several have run 800-1,100 words. That is
   expensive output, and it persists in context afterwards. The same content
   fits in ~250 words.
4. **Re-running checks that already passed.** The hook already proves an edit
   compiles; a second full-suite run to confirm it is pure cost.

The durable fix for 2-4 is a short **session protocol** section in CLAUDE.md --
deliberately short, because CLAUDE.md is paid for on every cold subagent boot
and three commits were just spent shrinking it. Roughly eighty tokens buys all
four points; it should not grow past that. Item 1 is a habit rather than a
document, and no file can enforce it.

## Towers that are more fun to use -- partly shipped

Riders shipped: every element now carries one lingering effect scaled by its
resistance cell (Heat ignites, Cold chills, Kinetic shoves, Solvent corrodes
and the corrosion follows what breaks out). See DESIGN.md. That answers the
"hits an area over time" and "interacts with the lane" directions, and Corrode
answers "payoff that depends on the layer system".

What is still open from the original item is the *targeting* half, which riders
did not touch: every tower still throws one projectile at the furthest charge
in range. A beam that pierces along the lane, or a chain that jumps between
charges, would be a genuinely different shape of tower rather than a different
outcome on impact. The same constraint applies -- it has to be a new kind of
outcome, not a special case in tower code.

## Enemies as monsters

Charges are abstract at the moment: an Ore is a grey circle, a Molten an orange
one. Naming and drawing them as creatures — a lava-monster for Molten, whatever
Crystal and Vapor want to be — would make the layer system read the way it
actually behaves. "A crystal shell cracks and two lava monsters climb out" is a
thing a player can picture; "CRYSTAL breaks into 2 MOLTEN" is a spec.

Worth noting how cheap this is: the simulation does not care. States are five
entries in `STATES` and twenty cells in the resistance table, and none of that
changes. This is naming, artwork in `drawCharge()`, and the hint text — no
balance implications, so it cannot break the diversity property.

## Deferred, with the work already partly done

- **Per-tower target priority** — first/last/strongest/deepest. "Deepest stack"
  is a genuinely different choice here than in other tower defenses, because a
  slab hides several tougher layers underneath.
- **Round flow** — autostart, a countdown between rounds, so a run reads as
  continuous rather than as twenty button presses.

## Open balance finding

A run still ends holding gold -- about 1360 on the reference plan, and rather
more on boards that spend badly. The figure has moved around a lot (995 in the
ten-round version, ~800 after twenty rounds and three-tier paths) and no pricing
change has ever reached it, because most of the surplus accrues *during* the
final rounds, after the last useful purchase point.

What changed recently is what the surplus was hiding. It used to be cosmetic;
measurement showed it was exploitable, because the cheapest thing to convert
spare gold into was another tower, and towers were strictly better value than
tiers. That is fixed (see DESIGN.md, "Breadth versus depth"), but the surplus
itself remains, and it is worth remembering that a large idle balance is
evidence that *something* is underpriced rather than merely untidy.

The real fixes are still more rounds, or shifting income earlier.

## Larger scope, not started

More towers (5 → 8), synergy and support towers, more maps, audio, save/load.

A note on the roster's shape, for when it grows from five towers to eight. Heat
is carried by two towers with deliberately different shapes — the Forge cheap,
short and constant, the Lens expensive, distant and slow — while Cold, Impact
and Acid have exactly one delivery shape each. So a player can vary *which*
elements they bring, but only for Heat can they vary *how*. If the point of new
towers is more builds that work, a second Cold or Impact shape is likely to buy
more than a fifth element would, and unlike a new element it cannot disturb the
resistance table's twenty cells at all.

A note on synergy towers specifically: measurement says placement already
matters more than it appears. Shuffling the reference build's coordinates,
keeping each tower's own upgrades, swings the margin between 10.3 and 2.0 lives
while still winning. The diversity meter deliberately holds slots fixed to
isolate composition, so it currently understates the strategy space by ignoring
that axis entirely. Support towers would make placement a first-class decision
— and would be the change most likely to reintroduce a mandatory tower, so they
lean hardest on `npm run diversity`.
