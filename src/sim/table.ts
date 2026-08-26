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
    // Quenched, not vaporised. Solvent strips things down to Slag wherever it
    // finds them, so the Vat has one coherent job and the Stamp finishes it.
    //
    // This used to yield VAPOR, and that was the game's one genuinely unfair
    // cell. Wave 4 is all Molten and the player can afford exactly one tower
    // there, so a lone Vat -- the tower the 120-gold opening forces them to
    // learn -- converted the whole wave into the fastest, most expensive state
    // in the game and then could not finish it. Two Vats can dissolve a Vapor;
    // one never could, and wave 4 only ever affords one. With no sell mechanic
    // the run was simply over, with nothing on screen explaining why.
    SOLVENT: { kind: 'transmute', to: 'SLAG' },
  },
  CRYSTAL: {
    // Undoes your own work -- keep Forges away from the end of the line.
    HEAT: { kind: 'transmute', to: 'MOLTEN' },
    COLD: { kind: 'none' },
    // The payoff cell.
    KINETIC: { kind: 'destroy', gold: 5, shatter: true },
    SOLVENT: { kind: 'none' },
  },
  VAPOR: {
    HEAT: { kind: 'speed', mult: 1.8 },
    COLD: { kind: 'transmute', to: 'MOLTEN' },
    // Passes straight through. Stamps cannot even target it.
    KINETIC: { kind: 'none' },
    // Vapor has 4 integrity and moves at 2.5, so one Vat lands roughly a single
    // hit as a Vapor crosses its range. At 1 damage that meant four Vats to
    // dissolve one Vapor, which made "chill it or dissolve it" false advice:
    // dissolving was not a real option at any price a player would pay. At 2
    // it is two Vats -- still the slow, expensive answer next to a Chiller,
    // which is what a slow kill should feel like, but an answer that exists.
    SOLVENT: { kind: 'damage', amount: 2 },
  },
};

export function outcomeFor(state: State, element: Element): Outcome {
  return TRANSMUTATION[state][element];
}

/**
 * A sparse patch over the table, owned by a tower upgrade.
 *
 * Upgrades are allowed to rewrite cells because that is the only kind of
 * upgrade worth having here -- a tower that fires 8% faster is not a decision.
 * They are still table edits, not special cases: an upgrade supplies new
 * `Outcome` values and `applyElement` interprets them through the same switch
 * as everything else.
 */
export type OutcomeOverrides = Partial<Record<State, Partial<Record<Element, Outcome>>>>;

/**
 * The outcome for a hit, honouring the firing tower's upgrade if it has one.
 *
 * This is a lookup layer over the table, deliberately not a second source of
 * truth: with no overrides it is exactly `outcomeFor`, and an override can only
 * replace a cell that already exists.
 */
export function resolveOutcome(state: State, element: Element, overrides?: OutcomeOverrides): Outcome {
  return overrides?.[state]?.[element] ?? TRANSMUTATION[state][element];
}
