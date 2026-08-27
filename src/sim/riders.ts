import type { Element } from './types.ts';

/**
 * RIDERS -- the lingering half of a hit.
 *
 * Every element carries exactly one rider, and its magnitude is scaled by the
 * same resistance cell that scales the damage. That single rule is the whole
 * feature, and it is why none of this is a special case in tower code:
 *
 *   - An immune cell means no damage AND no rider. Towers already hold fire
 *     where the table says nothing happens, so Crystal is simply never chilled.
 *   - "At least some monsters walk slow" falls straight out of the table.
 *     Molten takes Cold at x2.0 and crawls; Ore takes it at x0.5 and barely
 *     notices; Crystal is immune and is untouched. No per-state list to keep.
 *   - An upgrade that rewrites a cell moves that tower's rider with it, for
 *     free. `depo3` lifts Crystal/COLD to x1.75, so an Absolute Zero Chiller
 *     starts slowing Crystal without a line of new rider data; `kiln3` makes a
 *     Blast Furnace start igniting Molten. The interaction is emergent, and
 *     tests/riders.test.ts asserts it stays that way.
 *
 * `Record<Element, Rider>` makes "exactly one rider per element" a type error
 * to violate, the same way `RESISTANCE` makes the twenty cells total.
 *
 * Damage-over-time is quoted per second rather than per tick. The sim runs at
 * a fixed 60Hz so the conversion is exact, and a number like 1.2 is legible in
 * a way that 0.02 is not -- these are balance dials, and a dial nobody can
 * read does not get turned.
 */
export type Rider =
  /** Cold: slows the charge down. `factor` is the fraction of speed removed. */
  | { kind: 'chill'; factor: number; ticks: number }
  /** Heat: burns hot and brief, and dies with the layer it was applied to. */
  | { kind: 'ignite'; dps: number; ticks: number }
  /** Solvent: eats slowly, and survives the break onto whatever climbs out. */
  | { kind: 'corrode'; dps: number; ticks: number }
  /** Kinetic: shoves the charge back down the lane. Position, not throughput. */
  | { kind: 'shove'; pixels: number; cooldown: number };

export const RIDERS: Record<Element, Rider> = {
  /**
   * Hot and brief. Ignite is the smallest rider in the game on purpose: Heat
   * is the only element carried by two towers, so anything it gains is gained
   * twice over. Forty ticks against the Forge's 31 means a Forge keeps its
   * target alight continuously, while the Lens at 75 lights fires that go out
   * between beams -- the same rider reading differently on the two towers that
   * share it, which is what `towers.ts` says the Heat pair is for.
   */
  HEAT: { kind: 'ignite', dps: 0.7, ticks: 40 },

  /**
   * The one the game most obviously wanted, and the largest of the four.
   *
   * 60 ticks against the Chiller's 54 means one Chiller holds a target chilled
   * continuously, so the slow reads as a property of the tower rather than as
   * a flicker. Through the table it lands as x0.44 on Molten -- the fastest
   * ground layer walks at little over half pace -- x0.35 on Vapor, x0.22 on
   * Slag, a nearly invisible x0.11 on Ore, and nothing at all on Crystal.
   * That spread is the whole answer to "some monsters walk slow": it is the
   * Cold column of the resistance table, read back as speed.
   *
   * Deliberately short of MAX_CHILL at every cell, so the cap stays a guard
   * against an upgrade rather than a number the base tower sits on.
   */
  COLD: { kind: 'chill', factor: 0.22, ticks: 60 },

  /**
   * Repositioning, not a second slow -- Cold already owns throughput. Two
   * guards keep it there and both are asserted:
   *
   *   `cooldown` is per *charge*, not per tower, so a bank of Stamps cannot
   *   chain shoves into a stall-lock however many of them are in range.
   *
   *   The shove is divided by sqrt(scale) at application, so a slab shrugs it
   *   off. Heavy things do not fly backwards, and a boss that could be pushed
   *   around would be a boss that never arrives.
   *
   * 5px at Ore's x1.5 is 7.5px of lane given back, once per 55 ticks -- about
   * a sixth of a cell. Enough to see, and nowhere near enough to hold a lane.
   */
  KINETIC: { kind: 'shove', pixels: 5, cooldown: 55 },

  /**
   * Slow, lasting, and the only rider that survives a break: the children that
   * climb out inherit what is left of it. This is the Vat's whole identity
   * from DESIGN.md -- "Solvent strips whatever it touches down to Slag" -- and
   * it makes the one tower with splash the one that punishes deep stacks,
   * since a wash over a Crystal keeps eating both Molten cores afterwards.
   *
   * Five seconds is long on purpose. Corrode is worth little as damage -- at
   * x1.6 on Molten it is under a fifth of what the Vat's own shot does -- and
   * almost all of its value is that it is still running when the layer breaks.
   * A short corrode is a worse version of ignite; a long one is a different
   * effect. The Vat pays for it in rate: 82 ticks, the slowest tower by half
   * again, measured back to where the roster sat before riders existed.
   */
  SOLVENT: { kind: 'corrode', dps: 0.5, ticks: 300 },
};

/**
 * The hardest a charge can ever be slowed, however many Chillers see it.
 *
 * Chill takes the stronger of two applications rather than adding them, so
 * this cap is only reachable through the table -- but it has to exist anyway:
 * a lane the player can freeze outright is a lane where placement stops
 * mattering, which is the opposite of what riders are for.
 */
export const MAX_CHILL = 0.6;

/** Per-second damage as per-tick damage. The sim is a fixed 60Hz. */
export function perTick(dps: number): number {
  return dps / 60;
}
