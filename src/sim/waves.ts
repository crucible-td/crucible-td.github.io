import type { State } from './types.ts';

export interface SpawnGroup {
  state: State;
  count: number;
  /** Ticks between spawns within this group. */
  gap: number;
  /** Ticks after round start before this group begins. */
  delay: number;
  /**
   * Toughness multiplier for this group, inherited by inner layers.
   *
   * This is how a boss is expressed: a deep stack at a high scale, rather than
   * a new enemy type. It is also the dial freeplay turns, so late rounds get
   * harder without the sim drowning in bodies.
   */
  hpScale?: number;
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
      { state: 'ORE', count: 26, gap: 34, delay: 0 },
      { state: 'MOLTEN', count: 17, gap: 58, delay: 200 },
      { state: 'VAPOR', count: 12, gap: 76, delay: 400 },
    ],
  },
  {
    hint: 'Heavy shells. Every crystal is three layers of somebody else problem.',
    groups: [
      { state: 'CRYSTAL', count: 17, gap: 66, delay: 0 },
      { state: 'MOLTEN', count: 18, gap: 50, delay: 180 },
      { state: 'VAPOR', count: 14, gap: 68, delay: 340 },
    ],
  },
  {
    hint: 'Full pour. Everything you have learned, at once.',
    groups: [
      { state: 'ORE', count: 24, gap: 30, delay: 0 },
      { state: 'MOLTEN', count: 16, gap: 48, delay: 150 },
      { state: 'VAPOR', count: 14, gap: 58, delay: 320 },
      { state: 'CRYSTAL', count: 14, gap: 56, delay: 520 },
    ],
  },

  // -- Rounds 11-20: no new vocabulary, only combination and weight ---------
  //
  // Toughness here was swept against `npm run diversity`, not chosen by feel.
  // The trade is direct and measurable: heavier rounds mean fewer builds
  // survive, and past a point they stop asking for enough towers and start
  // asking for particular ones -- when the runner-up counters sat too low,
  // the three towers holding a 2.0 counter became mandatory together. These
  // numbers sit below that cliff.
  //
  // Every layer has been taught by round 7, so escalation here is depth rather
  // than novelty: tougher stacks, tighter overlaps, and the first charges that
  // need a dedicated answer rather than incidental damage.
  {
    hint: 'Reinforced ore. The same rock, considerably more of it.',
    groups: [
      { state: 'ORE', count: 20, gap: 26, delay: 0, hpScale: 1.5 },
      { state: 'SLAG', count: 11, gap: 40, delay: 300 },
    ],
  },
  {
    hint: 'A molten flood. Heat is dead weight here unless you have paid to fix it.',
    groups: [
      { state: 'MOLTEN', count: 19, gap: 32, delay: 0, hpScale: 1.41 },
      { state: 'ORE', count: 11, gap: 40, delay: 240 },
    ],
  },
  {
    hint: 'Heavy shells over hot cores.',
    groups: [
      { state: 'CRYSTAL', count: 13, gap: 52, delay: 0, hpScale: 1.41 },
      { state: 'VAPOR', count: 10, gap: 60, delay: 300 },
    ],
  },
  {
    hint: 'A gas cloud. Kinetic is worthless and the ground towers cannot see it.',
    groups: [
      { state: 'VAPOR', count: 19, gap: 40, delay: 0, hpScale: 1.5 },
      { state: 'MOLTEN', count: 10, gap: 54, delay: 320 },
    ],
  },
  {
    hint: 'Everything, and more of it than you have seen.',
    groups: [
      { state: 'ORE', count: 19, gap: 26, delay: 0, hpScale: 1.6 },
      { state: 'MOLTEN', count: 13, gap: 40, delay: 180 },
      { state: 'VAPOR', count: 11, gap: 52, delay: 360 },
      { state: 'CRYSTAL', count: 11, gap: 50, delay: 540 },
    ],
  },
  {
    hint: 'First slab: one shell, enormously thick, with a great deal beneath it.',
    groups: [
      { state: 'CRYSTAL', count: 4, gap: 150, delay: 0, hpScale: 4.67 },
      { state: 'ORE', count: 17, gap: 30, delay: 120, hpScale: 1.41 },
    ],
  },
  {
    hint: 'Slabs and gas together. Something must cover what the Stamps cannot.',
    groups: [
      { state: 'CRYSTAL', count: 4, gap: 140, delay: 0, hpScale: 5.15 },
      { state: 'VAPOR', count: 14, gap: 44, delay: 200, hpScale: 1.5 },
    ],
  },
  {
    hint: 'A hot flood under pressure.',
    groups: [
      { state: 'MOLTEN', count: 24, gap: 26, delay: 0, hpScale: 1.87 },
      { state: 'CRYSTAL', count: 10, gap: 60, delay: 300, hpScale: 1.68 },
    ],
  },
  {
    hint: 'Everything at weight. This is what the whole board is for.',
    groups: [
      { state: 'ORE', count: 23, gap: 24, delay: 0, hpScale: 1.87 },
      { state: 'MOLTEN', count: 17, gap: 34, delay: 160, hpScale: 1.77 },
      { state: 'VAPOR', count: 14, gap: 42, delay: 340, hpScale: 1.68 },
      { state: 'CRYSTAL', count: 13, gap: 46, delay: 520, hpScale: 1.68 },
    ],
  },
  {
    hint: 'The pour. Hold this and the crucible is yours.',
    groups: [
      { state: 'CRYSTAL', count: 5, gap: 130, delay: 0, hpScale: 6.54 },
      { state: 'ORE', count: 24, gap: 22, delay: 100, hpScale: 2.06 },
      { state: 'MOLTEN', count: 19, gap: 30, delay: 280, hpScale: 1.97 },
      { state: 'VAPOR', count: 17, gap: 38, delay: 460, hpScale: 1.87 },
    ],
  },
];
