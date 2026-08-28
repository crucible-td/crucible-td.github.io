# Backlog

Things known to be worth doing, in no strict order. Items move out of here when
they ship; the reasoning behind each is kept so that picking one up later does
not mean rediscovering why it mattered.

## Verify on a real phone

**Status: unverified, and the one item with a known risk attached.**

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

## Clicking the road while a tower is armed does nothing

`boardAction()` in `src/render/decisions.ts` decides `place` whenever a tower
is armed and the clicked cell holds no tower — it does not know whether that
cell is on the lane. A click on the road therefore falls through to
`placeTower()`, which checks `isBuildableCell` and quietly refuses, leaving the
tower armed with no feedback at all. The player is stuck holding a selection
with no visible way to let go of it short of Escape or right-click, neither of
which is discoverable — the same class of bug `decisions.ts`'s own header
comment calls out as this project's real source of interface bugs.

The fix: clicking an unbuildable cell while armed should deselect, the same as
clicking the tower just placed does today. That means `boardAction` needs a
third fact about the clicked cell (buildable or not) alongside `selected` and
`towerHere`, and a new outcome — or `disarm` reused — for "armed, no tower
here, and it's not a legal cell anyway." Belongs in `decisions.ts` with a test
of its own, per the architecture rule: this is a decision, not a drawing.

## Freeplay is calibrated to a campaign that no longer exists

`freeplayWave()` opens at `scale = 2.2 * 1.11^past`, with a comment saying it
starts "near where the authored rounds finish". That was true when round 20 sat
at `hpScale` around 2. The mid-game ramp that made upgrades worth buying left it
stranded:

| | ORE | MOLTEN | VAPOR | CRYSTAL |
|---|---|---|---|---|
| authored round 20 | 17 | 17 | 16 | 55 |
| freeplay round 21 | 2.7 | 2.2 | 2.6 | 2.9 |

So a player survives a genuinely hard round 20 and then coasts; freeplay does not
regain round-20 pressure until roughly round 40. Measured, the reference plan now
reaches freeplay round 35, where CLAUDE.md's reference figures were written
against 22.

Nothing caught this because nothing tests the *seam*. `tests/freeplay.test.ts`
checks freeplay's internal consistency -- determinism, monotonic difficulty, slab
cadence -- and never compares round 21 to round 20, and the campaign test only
asserts `wavesCleared > 20`, which a thirteen-round overshoot passes easily.

The cheap fix is to derive the opening scale from the last authored round's own
groups rather than the literal `2.2`, plus one assertion that round 21 sits in a
sane band around round 20. The expensive question underneath is whether freeplay
should continue the *curve* or restart gentler and re-climb; that is a design
call, not a tuning one.

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

- **Freeplay has no button.** `World.freeplay`, `freeplayWave()` and `waveAt()`
  all work and the harnesses reach them via `--rounds`, but clearing round 20
  just ends the run. This is shipped work sitting behind no UI.
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

A note on synergy towers specifically: measurement says placement already
matters more than it appears. Shuffling the reference build's coordinates,
keeping each tower's own upgrades, swings the margin between 10.3 and 2.0 lives
while still winning. The diversity meter deliberately holds slots fixed to
isolate composition, so it currently understates the strategy space by ignoring
that axis entirely. Support towers would make placement a first-class decision
— and would be the change most likely to reintroduce a mandatory tower, so they
lean hardest on `npm run diversity`.
