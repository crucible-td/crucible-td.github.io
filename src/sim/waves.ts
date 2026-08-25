import type { State } from './types.ts';

export interface SpawnGroup {
  state: State;
  count: number;
  /** Ticks between spawns within this group. */
  gap: number;
  /** Ticks after wave start before this group begins. */
  delay: number;
}

export interface Wave {
  /** Shown in the HUD -- each early wave teaches exactly one table cell. */
  hint: string;
  groups: SpawnGroup[];
}

/**
 * Ten waves, ordered as a teaching sequence.
 *
 * The opening economy matters: 120 starting gold buys a Vat (55) + Stamp (50),
 * which is the cheap Solvent -> Slag -> Kinetic line. The profitable
 * Heat -> Cold -> Kinetic shatter line costs 155 and has to be saved for. The
 * player is meant to discover the expensive line pays for itself.
 */
export const WAVES: Wave[] = [
  {
    hint: 'Raw ore. Strip it with Solvent, then break it.',
    groups: [{ state: 'ORE', count: 6, gap: 60, delay: 0 }],
  },
  {
    hint: 'More of the same, faster. One tower will not keep up.',
    groups: [{ state: 'ORE', count: 10, gap: 42, delay: 0 }],
  },
  {
    hint: 'Molten arrives. Kinetic will split it -- be ready or be elsewhere.',
    groups: [
      { state: 'ORE', count: 12, gap: 40, delay: 0 },
      { state: 'MOLTEN', count: 2, gap: 90, delay: 300 },
    ],
  },
  {
    hint: 'All molten. Cold turns it to brittle Crystal.',
    groups: [{ state: 'MOLTEN', count: 6, gap: 75, delay: 0 }],
  },
  {
    hint: 'Mixed feed. Your line must handle both.',
    groups: [
      { state: 'ORE', count: 14, gap: 36, delay: 0 },
      { state: 'MOLTEN', count: 4, gap: 80, delay: 200 },
    ],
  },
  {
    hint: 'Vapor floats over Stamps and ignores Kinetic. Chill it or dissolve it.',
    groups: [{ state: 'VAPOR', count: 5, gap: 90, delay: 0 }],
  },
  {
    hint: 'Pre-crystallised. Free gold if you shatter it -- Heat ruins it.',
    groups: [{ state: 'CRYSTAL', count: 6, gap: 70, delay: 0 }],
  },
  {
    hint: 'Everything at once.',
    groups: [
      { state: 'ORE', count: 16, gap: 32, delay: 0 },
      { state: 'MOLTEN', count: 8, gap: 62, delay: 240 },
      { state: 'VAPOR', count: 6, gap: 85, delay: 460 },
    ],
  },
  {
    hint: 'Heavy processing load. Parallel lines pay off here.',
    groups: [
      // Overlapping on purpose: the groups are timed to arrive on top of each
      // other rather than in sequence, so this wave tests parallel lines
      // instead of raw throughput -- which is what the hint promises.
      { state: 'MOLTEN', count: 16, gap: 32, delay: 0 },
      { state: 'CRYSTAL', count: 8, gap: 52, delay: 160 },
      { state: 'VAPOR', count: 10, gap: 58, delay: 320 },
    ],
  },
  {
    hint: 'Full pour. Everything you have learned, at once.',
    groups: [
      { state: 'ORE', count: 16, gap: 30, delay: 0 },
      { state: 'MOLTEN', count: 11, gap: 48, delay: 180 },
      // Vapor is the wall here: fast, costs 3 lives, and only Cold or Solvent
      // touch it. Five is beatable with a real chiller bank; eight was not
      // beatable at all -- `npm run sim` said so before a human ever played it.
      { state: 'VAPOR', count: 8, gap: 66, delay: 350 },
      { state: 'CRYSTAL', count: 11, gap: 48, delay: 580 },
    ],
  },
];
