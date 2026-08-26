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

## Towers that are more fun to use

Every tower currently does the same *thing*: throw an element at the furthest
charge in range, for damage, on a cooldown. They differ only in numbers —
element, damage, rate, range, splash — plus one flag for ground-only. The
resistance table makes the *choice* of tower interesting, but it does not make
any individual tower interesting to watch or to place.

Directions worth considering, none decided:

- Behaviour that is not "single projectile at the furthest target": a beam that
  pierces along the lane, a chain that jumps between charges, something that
  hits an area over time rather than instantly.
- Towers that interact with the lane rather than the charge — slowing a
  stretch, or changing where charges are when they arrive.
- Towers whose payoff depends on the layer system specifically, since that is
  the part of this game no other tower defense has.

The constraint to respect: every gameplay rule goes through the resistance
table and `applyElement()`. A new behaviour should be a new kind of *outcome*,
not a special case in tower code — the same discipline that kept the
transmutation table honest.

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

A run still ends holding roughly 790 gold. Lengthening the campaign to twenty
rounds and adding three-tier upgrade paths brought it down from 995 and got the
reference plan spending on 18 towers and 22 upgrade tiers, but most of the
remaining surplus accrues *during* the final rounds, after the last purchase
point. No pricing change reaches it — cutting every upgrade cost by two-thirds
in an earlier version moved it barely at all. The real fixes are more rounds or
shifting income earlier.

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
