import type { Rng } from './rng.ts';
import type { State } from './types.ts';
import { WAVES } from './waves.ts';
import type { Wave } from './waves.ts';

/** Rounds beyond this are generated rather than authored. */
export const AUTHORED_ROUNDS = WAVES.length;

/**
 * Freeplay: rounds past the authored campaign, generated from a seed.
 *
 * The authored rounds are a curve somebody designed; these are the same curve
 * extrapolated. Difficulty climbs mostly through `hpScale` rather than through
 * count, for two reasons: spawning ever more bodies would eventually drown the
 * simulation and make headless playtesting slow, and a round of a thousand
 * weak charges is not harder in any interesting way -- it just asks for more
 * of what you already own. Toughness keeps asking the question the resistance
 * table poses, which is whether you brought an answer to this layer.
 *
 * Deterministic in (round, seed), so freeplay depth is a measurable property
 * of a build rather than a matter of luck.
 */
const POOL: State[] = ['ORE', 'MOLTEN', 'VAPOR', 'CRYSTAL'];

export function freeplayWave(round: number, rng: Rng): Wave {
  const past = round - AUTHORED_ROUNDS;

  // Compounding toughness, starting near where the authored rounds finish.
  const scale = 2.2 * Math.pow(1.11, past);
  // Counts grow slowly and level off, so the lane stays readable.
  const bulk = Math.min(30, 18 + Math.floor(past * 0.8));

  const groups = POOL.map((state, i) => ({
    state,
    count: Math.max(6, Math.round(bulk * (state === 'CRYSTAL' ? 0.55 : 0.85))),
    gap: Math.max(16, 34 - Math.floor(past / 3)),
    delay: i * 160,
    hpScale: Number((scale * (0.9 + rng.range(0, 0.3))).toFixed(2)),
  }));

  // Every fifth freeplay round leads with a slab: one very deep stack, which
  // is a different question from a crowd and needs a different answer.
  if (past % 5 === 0) {
    groups.unshift({
      state: 'CRYSTAL',
      count: 4 + Math.floor(past / 5),
      gap: 110,
      delay: 0,
      hpScale: Number((scale * 6).toFixed(2)),
    });
  }

  return { hint: `Freeplay round ${round}. It does not stop.`, groups };
}

/**
 * The wave for a round index, authored or generated.
 *
 * Wave lookup goes through here rather than indexing WAVES directly, so that
 * "what happens on round N" has one answer no matter how far past the campaign
 * N is.
 */
export function waveAt(index: number, rng: Rng): Wave {
  return index < AUTHORED_ROUNDS ? WAVES[index]! : freeplayWave(index + 1, rng);
}
