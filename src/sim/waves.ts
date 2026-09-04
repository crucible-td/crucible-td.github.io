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
 * the only one that works. Rounds 1-4 carry no `hpScale` at all for the same
 * reason; the lift starts at round 5, where the reference plan previously took
 * no damage whatsoever and there was slack worth taking up.
 *
 * Immunities then arrive one at a time, each round introducing a single layer
 * that shuts one element off: Molten ignores Heat, Vapor ignores Kinetic and
 * floats over ground towers, Crystal ignores Cold. By the last rounds the feed
 * contains all of them at once, so a build has to answer everything somehow --
 * but never in one particular way.
 */
export const WAVES: Wave[] = [
  {
    hint: 'Ore golems, and nothing resists you yet -- open with whatever you fancy.',
    groups: [{ state: 'ORE', count: 6, gap: 78, delay: 0 }],
  },
  {
    hint: 'More golems, arriving faster. One tower will not keep up for long.',
    groups: [{ state: 'ORE', count: 11, gap: 48, delay: 0 }],
  },
  {
    hint: 'An ore golem breaks open and an ash crawler runs out. Watch what you leave behind.',
    groups: [
      { state: 'ORE', count: 14, gap: 34, delay: 0 },
      { state: 'SLAG', count: 6, gap: 50, delay: 260 },
    ],
  },
  {
    hint: 'Lava beasts. Heat does nothing to them at all -- bring Cold or Acid.',
    groups: [{ state: 'MOLTEN', count: 14, gap: 62, delay: 0 }],
  },
  {
    hint: 'Golems and lava beasts together. Heat still clears the golems; something else must take the beasts.',
    groups: [
      { state: 'ORE', count: 27, gap: 32, delay: 0, hpScale: 1.08 },
      { state: 'MOLTEN', count: 10, gap: 70, delay: 180, hpScale: 1.08 },
    ],
  },
  {
    hint: 'Gas ghosts float over Hammers and ignore Impact. Dissolve them or chill them.',
    groups: [{ state: 'VAPOR', count: 12, gap: 72, delay: 0, hpScale: 1.08 }],
  },
  {
    hint: 'Crystal giants. Cold is wasted on them; shatter them, or melt them back down.',
    groups: [{ state: 'CRYSTAL', count: 10, gap: 88, delay: 0, hpScale: 1.08 }],
  },
  {
    hint: 'Every creature you have met, walking together.',
    groups: [
      { state: 'ORE', count: 26, gap: 34, delay: 0, hpScale: 1.08 },
      { state: 'MOLTEN', count: 17, gap: 58, delay: 200, hpScale: 1.08 },
      { state: 'VAPOR', count: 12, gap: 76, delay: 400, hpScale: 1.08 },
    ],
  },
  {
    hint: 'Heavy shells. Every crystal giant is three creatures wearing one skin.',
    groups: [
      { state: 'CRYSTAL', count: 17, gap: 66, delay: 0, hpScale: 1.08 },
      { state: 'MOLTEN', count: 18, gap: 50, delay: 180, hpScale: 1.08 },
      { state: 'VAPOR', count: 14, gap: 68, delay: 340, hpScale: 1.08 },
    ],
  },
  {
    hint: 'Full pour. Every creature and every lesson, at once.',
    groups: [
      { state: 'ORE', count: 24, gap: 30, delay: 0, hpScale: 1.7 },
      { state: 'MOLTEN', count: 16, gap: 48, delay: 150, hpScale: 1.7 },
      { state: 'VAPOR', count: 14, gap: 58, delay: 320, hpScale: 1.7 },
      { state: 'CRYSTAL', count: 14, gap: 56, delay: 520, hpScale: 1.7 },
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
  //
  // These figures are far heavier than they once were, and the reason is the
  // whole point of the current tuning. A playtest found that buying towers and
  // never upgrading cleared all twenty rounds with 19 of 20 lives and 2632 gold
  // to spare: a tower was a linear unit of power at a flat 45-64 gold, an
  // upgrade multiplied one capped tower for 380, and breadth was measured at
  // 4.4x better value even against the tier's best target. Upgrades were dead
  // content for anyone playing to win.
  //
  // Raising late toughness alone could not fix that -- it scales the
  // requirement for both builds equally and kills the smaller board first. What
  // separates them is *when* their power arrives. Both builds own the same
  // 2-11 towers through round 7; only from round 10 does one hold tiers while
  // the other holds tower count. So the pressure is shaped as a ramp across
  // 10-15 rather than a step, because a flat wall at round 10 killed every
  // build before any of them had bought a tier, which measures nothing.
  //
  // Rounds 16-20 then carry the real weight, and that is deliberate too: by
  // then a board that spent on paths is finished, and a board still buying its
  // fortieth tower is not. `tests/breadth.test.ts` holds the property this
  // buys -- a board that never upgrades now dies on round 17, at every tower
  // count it can afford, up to and including a maximum 83-tower board.
  {
    hint: 'Reinforced golems. The same creature, carrying considerably more rock.',
    groups: [
      { state: 'ORE', count: 20, gap: 26, delay: 0, hpScale: 3.5 },
      { state: 'SLAG', count: 11, gap: 40, delay: 300, hpScale: 2.5 },
    ],
  },
  {
    hint: 'A flood of lava beasts. Heat is dead weight here unless you have paid to fix it.',
    groups: [
      { state: 'MOLTEN', count: 19, gap: 32, delay: 0, hpScale: 4.0 },
      { state: 'ORE', count: 11, gap: 40, delay: 240, hpScale: 3.0 },
    ],
  },
  {
    hint: 'Crystal giants with lava beasts inside them.',
    groups: [
      { state: 'CRYSTAL', count: 13, gap: 52, delay: 0, hpScale: 5.0 },
      { state: 'VAPOR', count: 10, gap: 60, delay: 300, hpScale: 3.5 },
    ],
  },
  {
    hint: 'A drift of gas ghosts. Impact is worthless and the ground towers cannot see them.',
    groups: [
      { state: 'VAPOR', count: 19, gap: 40, delay: 0, hpScale: 6.5 },
      { state: 'MOLTEN', count: 10, gap: 54, delay: 320, hpScale: 4.0 },
    ],
  },
  {
    hint: 'Every creature at once, and more of them than you have seen.',
    groups: [
      { state: 'ORE', count: 19, gap: 26, delay: 0, hpScale: 7.5 },
      { state: 'MOLTEN', count: 13, gap: 40, delay: 180, hpScale: 5.0 },
      { state: 'VAPOR', count: 11, gap: 52, delay: 360, hpScale: 5.0 },
      { state: 'CRYSTAL', count: 11, gap: 50, delay: 540, hpScale: 5.0 },
    ],
  },
  {
    hint: 'The first slab: a crystal giant grown enormous, with a great deal inside it.',
    groups: [
      { state: 'CRYSTAL', count: 4, gap: 150, delay: 0, hpScale: 40 },
      { state: 'ORE', count: 17, gap: 30, delay: 120, hpScale: 12 },
    ],
  },
  {
    hint: 'Slabs and gas ghosts together. Something must cover what the Hammers cannot.',
    groups: [
      { state: 'CRYSTAL', count: 4, gap: 140, delay: 0, hpScale: 45 },
      { state: 'VAPOR', count: 14, gap: 44, delay: 200, hpScale: 13 },
    ],
  },
  {
    hint: 'Lava beasts under pressure, and giants coming behind them.',
    groups: [
      { state: 'MOLTEN', count: 24, gap: 26, delay: 0, hpScale: 16 },
      { state: 'CRYSTAL', count: 10, gap: 60, delay: 300, hpScale: 14 },
    ],
  },
  {
    hint: 'Every creature at weight. This is what the whole board is for.',
    groups: [
      { state: 'ORE', count: 23, gap: 24, delay: 0, hpScale: 16 },
      { state: 'MOLTEN', count: 17, gap: 34, delay: 160, hpScale: 15 },
      { state: 'VAPOR', count: 14, gap: 42, delay: 340, hpScale: 14 },
      { state: 'CRYSTAL', count: 13, gap: 46, delay: 520, hpScale: 14 },
    ],
  },
  {
    hint: 'The pour. Hold the giants back and the crucible is yours.',
    groups: [
      { state: 'CRYSTAL', count: 5, gap: 130, delay: 0, hpScale: 55 },
      { state: 'ORE', count: 24, gap: 22, delay: 100, hpScale: 17 },
      { state: 'MOLTEN', count: 19, gap: 30, delay: 280, hpScale: 17 },
      { state: 'VAPOR', count: 17, gap: 38, delay: 460, hpScale: 16 },
    ],
  },
];
