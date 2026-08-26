import type { State } from './types.ts';

export interface SpawnGroup {
  state: State;
  count: number;
  /** Ticks between spawns within this group. */
  gap: number;
  /** Ticks after round start before this group begins. */
  delay: number;
}

export interface Wave {
  /** Shown in the HUD -- each early round teaches exactly one immunity. */
  hint: string;
  groups: SpawnGroup[];
}

/**
 * Ten rounds, ordered as a teaching sequence.
 *
 * Rounds 5-10 were scaled up by measurement, not by feel. `npm run diversity`
 * shows the trade directly: more pressure means fewer builds survive, and past
 * a point it starts demanding *particular* towers rather than merely enough of
 * them. At double the counts here, Stamp becomes mandatory and the game has a
 * right answer again. These numbers sit well below that cliff -- tense, but
 * still answerable in many ways.
 *
 * Round 1 is bare Ore, which nothing is immune to: every opening tower clears
 * it, at its own pace. That is deliberate and load-bearing -- the player is
 * meant to pick a tower because they like the look of it, not because it is
 * the only one that works.
 *
 * Immunities then arrive one at a time, each round introducing a single layer
 * that shuts one element off: Molten ignores Heat, Vapor ignores Kinetic and
 * floats over ground towers, Crystal ignores Cold. By the last rounds the feed
 * contains all of them at once, so a build has to answer everything somehow --
 * but never in one particular way.
 */
export const WAVES: Wave[] = [
  {
    hint: 'Raw ore. Nothing resists you yet -- open with whatever you fancy.',
    groups: [{ state: 'ORE', count: 6, gap: 78, delay: 0 }],
  },
  {
    hint: 'More ore, arriving faster. One tower will not keep up for long.',
    groups: [{ state: 'ORE', count: 11, gap: 48, delay: 0 }],
  },
  {
    hint: 'Ore breaks into Slag, and Slag is quick. Watch what you leave behind.',
    groups: [
      { state: 'ORE', count: 14, gap: 34, delay: 0 },
      { state: 'SLAG', count: 6, gap: 50, delay: 260 },
    ],
  },
  {
    hint: 'Molten. Heat does nothing to it at all -- bring Cold or Solvent.',
    groups: [{ state: 'MOLTEN', count: 14, gap: 62, delay: 0 }],
  },
  {
    hint: 'Mixed feed. Heat still clears the ore; something else must take the molten.',
    groups: [
      { state: 'ORE', count: 27, gap: 32, delay: 0 },
      { state: 'MOLTEN', count: 10, gap: 70, delay: 180 },
    ],
  },
  {
    hint: 'Vapor floats over Stamps and ignores Kinetic. Dissolve it or chill it.',
    groups: [{ state: 'VAPOR', count: 12, gap: 72, delay: 0 }],
  },
  {
    hint: 'Crystal. Cold is wasted on it; shatter it, or melt it back down.',
    groups: [{ state: 'CRYSTAL', count: 10, gap: 88, delay: 0 }],
  },
  {
    hint: 'Everything so far, together.',
    groups: [
      { state: 'ORE', count: 22, gap: 34, delay: 0 },
      { state: 'MOLTEN', count: 14, gap: 58, delay: 200 },
      { state: 'VAPOR', count: 10, gap: 76, delay: 400 },
    ],
  },
  {
    hint: 'Heavy shells. Every crystal is three layers of somebody else problem.',
    groups: [
      { state: 'CRYSTAL', count: 14, gap: 66, delay: 0 },
      { state: 'MOLTEN', count: 15, gap: 50, delay: 180 },
      { state: 'VAPOR', count: 12, gap: 68, delay: 340 },
    ],
  },
  {
    hint: 'Full pour. Everything you have learned, at once.',
    groups: [
      { state: 'ORE', count: 26, gap: 30, delay: 0 },
      { state: 'MOLTEN', count: 17, gap: 48, delay: 150 },
      { state: 'VAPOR', count: 15, gap: 58, delay: 320 },
      { state: 'CRYSTAL', count: 15, gap: 56, delay: 520 },
    ],
  },
];
