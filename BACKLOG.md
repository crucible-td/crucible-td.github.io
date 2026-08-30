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

## The hook script's comments describe a suite that no longer exists

**Small, self-contained, and in a file that shapes behaviour.**

`.claude/hooks/check-after-edit.sh` explains in its header why it runs
`test:fast` rather than the full suite. Two of its numbers are now wrong:

| It says | Actually |
|---|---|
| "The full suite takes ~24 seconds" | ~55 seconds |
| "a 240-build campaign sample" | 720 builds |

It also predates `npm run test:sampled`, which is now the middle option
between `test:fast` and the full run and is worth a mention in the same
comment.

The reasoning in the header is still exactly right -- a long pause after every
edit turns the hook into something to switch off -- so this is a numbers-and-
mention correction, not a rewrite. Nothing about the script's behaviour needs
to change.

Left for the owner because `.claude/` is his own AI-tooling work.

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

A note on synergy towers specifically: measurement says placement already
matters more than it appears. Shuffling the reference build's coordinates,
keeping each tower's own upgrades, swings the margin between 10.3 and 2.0 lives
while still winning. The diversity meter deliberately holds slots fixed to
isolate composition, so it currently understates the strategy space by ignoring
that axis entirely. Support towers would make placement a first-class decision
— and would be the change most likely to reintroduce a mandatory tower, so they
lean hardest on `npm run diversity`.
