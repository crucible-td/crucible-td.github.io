# Crucible

**[Play it →](https://crucible-td.github.io/)**

A tower defense built around counters and layers. Enemies walk a fixed lane
wearing a *state* — Ore, Slag, Molten, Crystal, Vapor. Towers throw an
*element* — Heat, Cold, Kinetic, Solvent — and how much damage lands depends
entirely on the state it hits.

Break a layer and what is underneath keeps walking. A Crystal shell becomes two
Molten cores, each of which becomes a Slag remnant, so one charge is five
payouts and three different resistance profiles on its way down the lane. You
are paid per layer broken.

## The twenty cells that are the whole game

|            | Heat   | Cold   | Kinetic | Solvent |
|------------|--------|--------|---------|---------|
| **Ore**     | **×2.0** | ×0.5   | ×1.5    | ×1.0    |
| **Slag**    | ×1.0   | ×1.0   | **×1.5** | ×1.25   |
| **Molten**  | immune | **×2.0** | ×0.75   | ×1.6    |
| **Crystal** | ×1.6   | immune | **×2.0** | immune  |
| **Vapor**   | ×0.5   | ×1.6   | immune  | **×2.0** |

Two rules generate those numbers, and both are asserted in the test suite:

- **Every element is useless against exactly one layer.** An element without a
  wall becomes the answer to everything.
- **Every layer has at least two counters** — a specialist at ×2.0 and a
  runner-up near ×1.6, close enough behind to actually substitute.

Round 1 is bare Ore, which nothing resists, so the opening is a preference
rather than a puzzle. Immunities then arrive one per round.

## The unusual part

The game is judged on one thing above being balanced: **more than one build has
to work.**

An earlier version was fair, winnable on every seed, and still wrong, because
there was exactly one build worth making — the optimal build quietly ignored a
quarter of the tower roster. Being balanced turned out to be necessary and not
sufficient.

So there is a meter for it:

```bash
npm run diversity
```

It runs a large sample of tower compositions through the full campaign and
reports how far each got, how many won, and — the important one — whether any
tower appears in *every* winning build. A mandatory tower means the game has a
right answer again, however healthy the difficulty numbers look. That check
runs in CI on every push.

Current state: 77 of 320 sampled 18-tower builds clear all twenty rounds, in 77
distinct compositions, with no tower mandatory and none dead.

## Running it

```bash
npm install
npm run dev        # play at localhost:5173
npm test           # 70 tests: the table, the sim, upgrades, the campaign, diversity
npm run typecheck
```

## The harnesses

The simulation is a pure function of (state, input, seed) — fixed 60Hz
timestep, one seeded RNG, no wall-clock time, and no imports from the renderer.
That is what makes all of this possible:

| Command | What it answers |
|---|---|
| `npm run sim -- --all-waves` | Is each round survivable? Towers are free and lives reset, so it measures round pressure alone. |
| `npm run campaign -- --plan "..."` | Could a player *afford* the answer? One world, gold and lives carrying across all twenty rounds. |
| `npm run diversity` | How many different builds work, and is any tower mandatory? |

Balance changes are made by editing a table of numbers and re-running these,
never by feel. [DESIGN.md](DESIGN.md) has the full rationale.

## Licence

MIT.
