# Backlog

Things known to be worth doing, in no strict order. Items move out of here when
they ship; the reasoning behind each is kept so that picking one up later does
not mean rediscovering why it mattered.

## Verified defects from a review pass -- all three shipped

The three were: a splash that cleared the cascade it had just created, because
both `advanceProjectiles` and `advanceEffects` walked `w.charges` while
`breakLayer` pushed children onto it; a hover tag that quoted a layer's base HP
while the health bar beside it showed the real number; and a dev console handle
that returned aliased statistics.

The last one is worth a note because of where the copy went. `crucible.advance()`
spread `world.stats` shallowly, so `leaksByState` in every reading was the same
live object and three readings taken across a session all reported the final
numbers. The fix is one copy -- but the reason nobody caught it is that the
handle lives in `src/main.ts`, which coverage excludes on purpose as an entry
point, so nothing watched it at all. So the copy is now `statsSnapshot()` in
`src/render/decisions.ts`, where a test holds it.

The lesson the splash one left still stands. It sat on a line `npm run coverage`
already reported as covered -- `src/sim/world.ts` is at 100% statements -- under
a comment stating the exact property it broke, and nothing caught it for as long
as nobody checked. **Statement coverage measures which lines ran, not which
properties hold.**

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

## The Matter panel is fully on screen -- shipped

The panel rebuilds from the best cell the player actually owns, and now all five
of its rows are visible without scrolling. At 1280x720 the page was **809px tall
against a 720px viewport**, with the panel running 637 to 793, so about two and
a half rows of the reference the interface treats as the entire game were on
screen. It is **720 exactly** now, with the panel ending at 698 -- measured in
three states, including a freeplay round whose preview strip carries five
entries.

The sidebar was the taller column, so that is where the work went, and none of
it removed a word of the copy that teaches:

- **The round preview strip moved out of the sidebar** to under the board beside
  the hint. Both describe the round, and the left column was the one with room.
- **The board yields height rather than the panel yielding rows.** The board
  column is `min(960px, (100vh - 145px) * 1.6)`, where 1.6 is its own 960/600
  aspect: at 720 tall it draws 920x575 and a cell is 38px instead of 40; at 745
  and taller it is the full 960 it always was. `toBoard()` maps clicks through
  `getBoundingClientRect`, so placement was unaffected -- verified by clicking
  a cell at the new size and checking where the tower landed.
- **Start wave, Pause and the speed cycle share one row** instead of stacking,
  worth 35px. Under 900px they go back to stacked full-width blocks, because on
  a phone the constraint is the touch target rather than the space.
- **Card padding, margins and blurb line-height came down**, worth about 7px per
  card.

One state still overflows and is meant to: opening a tower's upgrade panel adds
its own height to the sidebar. That panel is transient and the player opened it
deliberately, which is a different thing from the permanent reference being cut
off.

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

## Checks now run where the policy says they do -- shipped

All three gaps closed. CI triggers on `pull_request` as well as on a push to
`main`, so a change is verified before it merges rather than after. And
`tests/architecture.test.ts` now asserts the purity rule's third clause: no
`Date.now`, no `performance.now`, no `new Date` in `src/sim`. A clock there
would have passed every other check in this repo while quietly making the
browser and `npm run sim` disagree about the same seed, which invalidates every
number in BALANCE.md without anything going red.

Comments are now stripped once, in `simFiles()`, for every check rather than
only for the `Math.random` one -- a `src/sim` file that merely *mentioned*
`window.` in a doc comment used to fail a rule it had not broken.

Both new behaviours were verified the way this file is meant to be: a
`Date.now()` was added to `src/sim/stats.ts` under a comment mentioning
`window.` and `document.body`, and the suite went red on the wall-clock
assertion **and stayed green on the DOM one** before the probe was reverted.

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

## Enemies as monsters -- shipped

Charges are creatures now, in the artwork and in the words. The artwork half had
already shipped without this file noticing: `MONSTER_ART` draws all five with
faces and its comment names them, but those names lived only in a code comment
no player could read.

They are now real, as `MONSTER_NAME` in `src/render/art.ts`: **ore golem, ash
crawler, lava beast, crystal giant, gas ghost**. The hover tag's last line reads
"Breaks into 2 lava beasts" rather than "Breaks into 2 x Lava" -- that is the
line that decides whether breaking a shell is a good idea, and it is now a
sentence rather than a lookup. All twenty wave hints were rewritten to talk
about creatures while each keeps the single mechanical fact it teaches, and the
end-of-run overlay counts monsters rather than charges.

Two decisions worth keeping:

- **Each creature name contains its layer's own label**, and
  `tests/art.test.ts` holds that property. "Lava" is the word that makes "Heat
  does nothing to it" land, and this game is read by people for whom English is
  a second language, so a name that replaced the material word would read
  better and teach less.
- **The Matter panel keeps the short label.** "2x lava beast" wraps the Crystal
  row in a 285px sidebar, which costs 21px and puts the panel's last row back
  under the fold -- measured, at 735px against a 720px viewport. The hover tag
  has the room and says it in full; the panel does not and does not.

`MONSTER_NAME` sits in the render layer rather than on `StateDef`, which is the
one place this project's architecture does not quite reach (see below): the
simulation already carries five labels, five colours and five radii that belong
to the interface, and a name for a drawing is not the field that should make
that worse.

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

## Findings from a play session (2026-09-04)

Recorded as they were reported while playing, in the reporter's own framing.
Independent of each other, none of them fixed.

- **Every tower's shot looks the same; only the colour differs.** Reported as
  "every tower shoots the same shot (in a different color though)", with the
  suggestion that more animation would make the game more fun, and the code
  agrees exactly. `drawProjectiles` (`src/render/canvas.ts`) draws every
  projectile in the world as the same 3.5px filled circle, varying nothing but
  `p.color`. The impact end is the same story from the other side: `ingest`
  turns every event that is not a plain `hit` into one expanding ring of
  `BURST_LIFE` frames, radius `6 + t * 22`, coloured from `EVENT_STYLE`, plus
  an optional floating number. So Heat, Cold, Kinetic and Solvent are told
  apart by hue and by nothing else -- which is no distinction at all for a
  colour-blind player, and reads as sameness to everyone else.

  The firing end is *not* part of this: towers already recoil when they shoot
  (`recoil`, driven off the cooldown-went-up test at the top of the file). It
  is the flight and the landing that are uniform.

  Two things make this cheaper than it looks. The riders have already shipped
  -- Heat ignites, Cold chills, Kinetic shoves, Solvent corrodes -- so there
  are four genuinely different behaviours the visuals are currently not
  showing, which means the animation work has something true to depict rather
  than needing decoration invented for it. And it lives entirely in the render
  layer, where `bursts` and `floaters` already are, so it neither touches the
  simulation nor risks the purity rule `tests/architecture.test.ts` holds.

  Distinct from the open half of "Towers that are more fun to use" above, and
  worth doing even if that never happens: that item is about *targeting*
  shapes -- a beam that pierces, a chain that jumps -- which changes what a
  tower does. This changes only what a shot looks like on its way there.

  Two constraints to respect. Firing is detected in the renderer by watching
  cooldowns rather than announced by the simulation, deliberately, because a
  sim event per shot is thousands of throwaway objects per headless campaign
  and `npm run diversity` runs hundreds of them -- so a per-tower fire
  animation must keep reading `lastCooldown`, not ask for a new event. And
  whatever replaces the single circle is drawn per projectile per frame, which
  is the hot path the performance pass already went over; a per-shot trail or
  sprite wants measuring, not assuming.

- **The upgrade panel is not accessible enough.** Reported with a suggestion
  attached: when a tower is selected, have the upgrade section take the place
  of the Build section rather than appearing underneath it. Today `#inspect`
  is a sibling that sits *below* `#towerList` in the `#build` aside and is
  merely unhidden, so opening it does not replace anything -- it grows the
  sidebar by its own height and pushes the controls and the Matter panel
  further down a column that was already the taller one.

  This item and "The Matter panel is fully on screen" are the same measurement
  seen from two sides. That item ends by accepting exactly this overflow --
  "opening a tower's upgrade panel adds its own height to the sidebar... that
  panel is transient and the player opened it deliberately" -- and the swap
  proposed here would retire the exception rather than live with it: if the
  upgrade list stands in for the tower list instead of stacking under it, the
  sidebar does not grow at all. Whether it ends up shorter or taller than the
  Build list it replaces is a measurement, not a guess, and wants taking at
  1280x720 in the state that matters (a tier-3 path with both branches still
  offered) before the change is called done.

  A vocabulary trap worth naming, because the codebase is careful about it and
  the report is not: `selected` in `src/render/ui.ts` means a tower *type*
  armed from the Build list for placement, while `inspected` means a *placed*
  tower being examined -- and it is the second one the player means by
  "selected a tower". The swap keys on `inspected`, and the element strip that
  already reads from `selected ?? inspected` is a good check on the reasoning.

  The real cost to weigh: today both lists are on screen at once, so a player
  who opens a tower's upgrades can still arm a new tower without a step in
  between. Swapping puts `#inspectClose` in that path. That is probably the
  right trade -- the upgrade panel is the one being reported as hard to reach
  -- but it is a trade and not a free win, and it is worth asking whether
  arming any tower card should simply close the inspect panel by itself, which
  would cost the player nothing at all.

  Per this project's conventions the decision belongs in
  `src/render/decisions.ts` with a test named after what it protects, not in
  the click handler -- that module exists because every interface bug this
  project has had came from logic tangled with the DOM, including a panel that
  showed the previously clicked tower, which is the same family as this.

- **A tower's base damage is nowhere on screen.** Reported as "would be nice
  to see a tower's base damage", and it is not a matter of it being buried:
  the only damage number the interface renders anywhere is the
  `Damage 4 → 6` line inside an *upgrade* button, from `describeStats` in
  `src/render/decisions.ts`. A Build card carries the tower's name, element
  glyph, cost, blurb and rider sentence and no numbers at all
  (`buildTowerMenu`, `src/render/ui.ts`), and the inspect panel adds only a
  title and the branches still on offer. So a player can see what a tier will
  do to a stat they have never been shown, and cannot compare two towers they
  have not bought.

  The pieces are already there and pure: `describeStats` reads exactly the
  four fields worth showing, and `rate()` already turns a cooldown into shots
  per second because that reads better than ticks. What is missing is the
  same formatter without an upgrade to diff against -- a current-stats
  version, wanted by both surfaces, the Build card before the purchase and the
  inspect panel after it, where `effective()` already resolves what the bought
  tiers have changed it to.

  **Damage on its own would mislead, and the roster is built so that it
  does.** The Burner hits for 4 and the Beam for 14, which reads as three and
  a half times the tower; per second it is 8 against 11.4, because the Burner
  fires at 2.0/s and the Beam at 0.81/s. Those two carry the same element on
  purpose -- CLAUDE.md and `towers.ts` both say the interesting axis is the
  *shape* of the tower rather than its column -- and a bare damage figure
  hides precisely that axis. Rate belongs beside it, and so does range for the
  Beam's 260 against everyone else's ~90-110, and splash for the Acid Tank,
  which is the only tower whose 36 explains its low damage. The blurbs already
  say all of this in words; the numbers should agree with them rather than
  replace them.

  And whatever is shown must not read as a promise. Damage in this game is an
  input to the resistance table, not an outcome -- the Burner's 4 is 0 against
  Lava -- so a stats line has to sit alongside the Matter panel's reading of
  the same tower rather than compete with it. The element strip already lights
  the column for the held or inspected tower, which is the existing answer to
  "what does this actually do", and a raw number placed carelessly would
  undercut it.

  The cost, as always in this sidebar, is height: the Build list is permanent,
  so a stats line on five cards is height the column pays all the time, and
  that column was measured to exactly 720 to get the Matter panel fully on
  screen. Putting the numbers only in the inspect panel costs nothing there
  but does not answer the comparison-before-buying half. Worth measuring both
  before choosing, at 1280x720, and worth noting that the swap proposed in the
  previous item frees the room the first option needs.

- **The upgrade paths need rework -- they are doing too many different things
  at once.** Reported as: lifting a tower's weakness is fine, but the system
  is somehow too complicated, and a simpler shape would be most upgrades
  giving damage, or range, or both, or cover against a weakness. Reading the
  ten paths against the table, the complaint is precise, and it is not that
  any one path is complicated. It is that no two towers offer the *same kind
  of pair*, and nothing on screen says which kind you are looking at.

  Sorted by what a path actually does to the game:

  - **Pure stats, no table edit at all:** `bellows` (rate, damage), `super`
    (range, damage, rate), `focus` (damage, rate).
  - **Lifts this tower's own wall:** `kiln` (Heat on Lava, 0 → 1.4), `depo`
    (Cold on Crystal, 0 → 1.75), `damp` (Impact on Lava, 0.75 → 2.25).
  - **Amplifies a cell the tower was already good at:** `die` (Impact on
    Crystal, 2.0 → 3.5), `cat` (Acid on Ash, 1.25 → 3.0), most of `prism`
    (Heat on Ore, 2.0 → 3.0).
  - **Mixes two of the above inside one path:** `recl` amplifies Gas 2.0 → 4.0
    for two tiers and then lifts Crystal's immunity at tier 3; `prism3` adds
    Gas 0.5 → 1.5 on top of two amplifications; `die` opens with a range tier
    and then turns into a table path.

  So the Burner pairs a wall-lift against a rate path, the Chiller a wall-lift
  against a range path, the Hammer a wall-lift against a mixed range-and-
  amplify path, the Beam a pure damage path against a three-cell amplify path,
  and the Acid Tank pairs *two* table paths and offers no stat path at all.
  Five towers, five different shapes of choice. That is the complexity, and it
  compounds with the two findings above: judging `kiln1` requires knowing that
  Heat on Lava is 0, which lives in the Matter panel, and judging `bellows1`
  requires knowing the Burner's fire rate, which finding 3 established is not
  displayed anywhere at all.

  **The thing not to do, even though it is what "just make it damage and
  range" would produce.** The table rewrites are the mechanism the whole game
  is judged on. `upgrades.ts` says it directly -- lifting an immunity is "the
  clearest way a build covers a gap it was not designed for. More ways to
  answer a layer is more builds that work" -- and `resistance.ts` puts the
  other half plainly: "a tower that fires 8% faster is not a decision". If
  every path became a stat path, the best build stops depending on what a
  board can *answer* and becomes whichever towers have the best base cells,
  upgraded. That is the one right answer the project exists to avoid, and
  `npm run diversity` is the thing that would catch it -- after the work, not
  before.

  **A shape that keeps the mechanic and removes the complaint.** Give every
  tower the same two paths, and say so on the button: a **Power** path that
  only ever touches damage, rate and range, and a **Counter** path that only
  ever lifts that tower's own worst cell, one step per tier. One rule, ten
  paths, and the player learns it once instead of five times. Most of the
  roster is already there -- `bellows`, `super` and `focus` are Power paths
  today, and `kiln`, `depo` and `damp` are Counter paths today. Four paths
  need work: `die` becomes the Hammer's Power path (it already opens with two
  range tiers), `cat` becomes the Acid Tank's Power path (splash is a stat and
  the Vat currently has no Power path at all), `recl` becomes its Counter path
  built around the Crystal immunity that `recl3` already lifts rather than
  reaching it only at the top, and `prism` becomes the Beam's Counter path
  around Gas, which `prism3` already touches.

  Two things that do not fall out of the rule cleanly, and want deciding
  rather than discovering. The Burner and the Beam share Heat, so a Counter
  path defined as "lift your own wall" gives them the same wall (Lava) and
  makes the pair redundant -- the Beam's second-worst cell, Gas at 0.5, is
  probably the honest answer and is where `prism` already points. And the
  Hammer is `groundOnly`, so its true worst cell, Gas at 0, is one it cannot
  shoot at anyway; its wall is Lava at 0.75, which is what `damp` already
  does.

  **What this costs, before anyone starts.** Path ids are load-bearing beyond
  `upgrades.ts`: the loadout grammar in CLAUDE.md documents `stamp@11,9+damp3`,
  BALANCE.md's reference builds name tiers, and `tests/upgrades.test.ts`,
  `tests/decisions.test.ts` and `tests/riders.test.ts` assert specific
  overrides on `die3`, `prism3`, `recl3` and `depo3` by id. Renaming or
  repurposing a path is therefore a rename across four documents and three
  test files, not a data edit. And it is a balance change by definition, so it
  goes through the `balance-pass` skill in the main session with both `npm run
  sim -- --all-waves` and `npm run diversity` -- never one without the other
  -- plus `tests/breadth.test.ts`, which currently asserts that a board that
  never upgrades loses at every tower count it can afford. That assertion is
  the tripwire for the failure mode above: a roster of pure stat paths could
  keep it passing while the game quietly acquired a right answer again.

  **The cheap alternative, worth pricing first.** It may be that the paths are
  fine and only their reading is bad. Labelling each path with two words on
  the panel -- what kind of path it is -- plus the stats line from finding 3,
  would test whether "too complicated" is really "unexplained" at a small
  fraction of the cost and none of the balance risk. Worth trying before a
  reshape that touches every reference build in the project.

- **Pause is live between rounds, where there is nothing to pause.** Reported
  as a small thing, and the reading is right: `#startWave` is the only control
  in that row that consults the world -- `start.disabled = world.status !==
  'idle'` in `sync`, `src/render/ui.ts` -- while the Pause button and the
  speed cycle are wired unconditionally and never look at `status` at all. So
  between rounds the row offers Start wave beside a Pause that pauses an idle
  simulation, and the `P` key does the same.

  There is a real consequence hiding behind the oddity, not just a dead
  button. Speed lives in the render layer and nothing resets it: `togglePause`
  sets `speed = 0`, `onStartWave` calls `startWave(world)` and touches speed
  not at all, and `startWave` in `src/sim/world.ts` only moves `status` from
  `idle` to `running`. So a pause taken between rounds survives into the next
  one -- the wave starts frozen, and the only thing on screen saying why is
  the button reading "Resume". Cheap to reproduce: press Pause while idle,
  then Start wave.

  Two candidate fixes, and they are not the same. Disabling Pause while
  `status === 'idle'` matches Start wave's existing treatment and makes the
  row honest, but leaves open what happens to a pause held across the end of a
  round, since a round ending sets `status` back to `idle` on its own
  (`world.ts`, where a cleared board becomes `won` or `idle`). Clearing the
  pause when a wave starts fixes the trapped-frozen-round case directly and
  leaves the button harmlessly pressable. Doing both is probably right, and
  the second is the half that matters.

  Per this project's conventions the enabled-state decision belongs in
  `src/render/decisions.ts` beside `cardState`, which already does exactly
  this job for the tower cards, rather than as another line of imperative
  fiddling inside `sync`.
