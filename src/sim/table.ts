import type { Element, State } from './types.ts';

/**
 * What applying an element to a state does.
 *
 * Every rule in Crucible is one of these six shapes. If you want a new kind of
 * interaction, add a variant here and handle it in world.ts -- do not sneak
 * special cases into tower code.
 */
export type Outcome =
  /** Element bounces off. Towers hold fire rather than waste shots on these. */
  | { kind: 'none' }
  | { kind: 'transmute'; to: State }
  | { kind: 'split'; into: State; count: number }
  | { kind: 'destroy'; gold: number; shatter?: boolean }
  /** Multiplies the charge's speed. Always a trap. */
  | { kind: 'speed'; mult: number }
  /** Chips integrity. The slow, unglamorous way to kill something. */
  | { kind: 'damage'; amount: number };

/**
 * THE TRANSMUTATION TABLE -- the entire game, in twenty cells.
 *
 * Balance lives here, not in tower code. Tuning the game means editing this
 * table and re-running `npm run sim -- --all-waves`. Every cell is asserted in
 * tests/table.test.ts, so changing one deliberately means updating a test --
 * and changing one accidentally fails the suite.
 *
 * The intended kill line is HEAT -> COLD -> KINETIC:
 *   Ore melts, Molten crystallises, Crystal shatters for bonus gold.
 * The classic disaster is Kinetic reaching Molten before Cold does.
 */
export const TRANSMUTATION: Record<State, Record<Element, Outcome>> = {
  ORE: {
    HEAT: { kind: 'transmute', to: 'MOLTEN' },
    COLD: { kind: 'none' },
    // Ore is armoured: kinetic works, but it takes eight hits to matter.
    KINETIC: { kind: 'damage', amount: 1 },
    SOLVENT: { kind: 'transmute', to: 'SLAG' },
  },
  SLAG: {
    HEAT: { kind: 'transmute', to: 'MOLTEN' },
    COLD: { kind: 'none' },
    // Armour stripped: the cheap early-game kill.
    KINETIC: { kind: 'destroy', gold: 1 },
    SOLVENT: { kind: 'none' },
  },
  MOLTEN: {
    HEAT: { kind: 'speed', mult: 1.4 },
    COLD: { kind: 'transmute', to: 'CRYSTAL' },
    // THE TRAP. Profitable if you are ready for three; fatal if you are not.
    KINETIC: { kind: 'split', into: 'MOLTEN', count: 3 },
    SOLVENT: { kind: 'transmute', to: 'VAPOR' },
  },
  CRYSTAL: {
    // Undoes your own work -- keep Forges away from the end of the line.
    HEAT: { kind: 'transmute', to: 'MOLTEN' },
    COLD: { kind: 'none' },
    // The payoff cell.
    KINETIC: { kind: 'destroy', gold: 6, shatter: true },
    SOLVENT: { kind: 'none' },
  },
  VAPOR: {
    HEAT: { kind: 'speed', mult: 1.8 },
    COLD: { kind: 'transmute', to: 'MOLTEN' },
    // Passes straight through. Stamps cannot even target it.
    KINETIC: { kind: 'none' },
    SOLVENT: { kind: 'damage', amount: 1 },
  },
};

export function outcomeFor(state: State, element: Element): Outcome {
  return TRANSMUTATION[state][element];
}
