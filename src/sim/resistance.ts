import type { Element, State } from './types.ts';

/**
 * THE RESISTANCE TABLE -- the entire game, in twenty cells.
 *
 * A multiplier applied to a tower's damage, chosen by what the tower throws
 * and what layer it lands on. This replaced a transmutation table that had the
 * same shape and the same role: balance lives here, not in tower code, and
 * every cell is asserted in tests/resistance.test.ts so that changing one is
 * always a deliberate act.
 *
 * The numbers carry the design, and two rules generate them:
 *
 *   0 is immunity, and immunities are what force the player to have a
 *   strategy at all. Every element is useless against exactly one layer, so
 *   no single tower can carry a run.
 *
 *   Above 1 is a counter, and EVERY layer has at least two of them. That is
 *   what keeps more than one strategy valid -- the previous version of this
 *   game paid 7 for one route and 2 for the next, and the build the harness
 *   converged on quietly discarded a quarter of the tower roster.
 *
 * Round 1 is plain Ore, which nothing is immune to and three elements beat
 * comfortably, so the opening is genuinely free. The immunities arrive one per
 * wave after that, each teaching a single cell.
 */
export const RESISTANCE: Record<State, Record<Element, number>> = {
  // Rock. Soft to heat, shrugs off cold. Any opening can chew through it.
  ORE: { HEAT: 1.5, COLD: 0.5, KINETIC: 1.25, SOLVENT: 1.0 },

  // Stripped and brittle: the layer under everything, weak to a good hit.
  SLAG: { HEAT: 1.0, COLD: 1.0, KINETIC: 1.5, SOLVENT: 1.25 },

  // Already molten, so heat does nothing at all. Chill it or dissolve it.
  MOLTEN: { HEAT: 0, COLD: 2.0, KINETIC: 0.75, SOLVENT: 1.25 },

  // Inert: freezing a crystal achieves nothing and solvent runs straight off
  // it. Shatter it, or melt it back down. Crystal is the layer that punishes a
  // board built entirely out of Vats -- every element needs exactly one wall,
  // or the element without one becomes the answer to everything.
  CRYSTAL: { HEAT: 1.25, COLD: 0, KINETIC: 2.0, SOLVENT: 0 },

  // A gas: kinetic passes straight through, and it floats over ground towers.
  VAPOR: { HEAT: 0.5, COLD: 1.5, KINETIC: 0, SOLVENT: 2.0 },
};

/**
 * A sparse patch over the table, owned by a tower upgrade.
 *
 * Upgrades rewrite cells because that is the only kind of upgrade worth
 * having: a tower that fires 8% faster is not a decision. They stay table
 * edits rather than special cases -- an upgrade supplies new multipliers and
 * damage resolution reads them through the same lookup as everything else.
 */
export type ResistanceOverrides = Partial<Record<State, Partial<Record<Element, number>>>>;

export function resistanceFor(state: State, element: Element): number {
  return RESISTANCE[state][element];
}

/**
 * The multiplier for a hit, honouring the firing tower's upgrade if it has one.
 *
 * A lookup layer over the table, deliberately not a second source of truth:
 * with no overrides it is exactly `resistanceFor`, and an override can only
 * replace a cell that already exists.
 */
export function resolveResistance(state: State, element: Element, overrides?: ResistanceOverrides): number {
  return overrides?.[state]?.[element] ?? RESISTANCE[state][element];
}

/** True where the element does nothing at all, so towers can hold fire. */
export function isImmune(state: State, element: Element, overrides?: ResistanceOverrides): boolean {
  return resolveResistance(state, element, overrides) <= 0;
}
