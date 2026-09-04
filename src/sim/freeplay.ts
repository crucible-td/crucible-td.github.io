import type { Rng } from './rng.ts';
import { median } from './stats.ts';
import type { State } from './types.ts';
import { WAVES } from './waves.ts';
import type { SpawnGroup, Wave } from './waves.ts';

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

const LAST_WAVE_SCALES = WAVES[WAVES.length - 1]!.groups.map((g) => g.hpScale ?? 1);

/**
 * The bulk pressure the last authored round actually asked for.
 *
 * Median, not max and not mean, of that round's group hpScales: the slab
 * group in a leading position (round 20's CRYSTAL at 55) is a spike by
 * design and would drag a mean or max upward, making freeplay open harder
 * than the round a player just survived. The median lands on the bulk
 * groups instead -- the pressure that was actually sustained -- so freeplay
 * continues that curve rather than restarting above or below it.
 */
export const AUTHORED_FLOOR = median(LAST_WAVE_SCALES);

/** How far above the bulk floor the authored slab sits, kept the same ratio in freeplay. */
export const SLAB_RATIO = Math.max(...LAST_WAVE_SCALES) / AUTHORED_FLOOR;

/** A generated group always states its toughness -- that is the dial freeplay turns. */
type FreeplayGroup = SpawnGroup & { hpScale: number };

/**
 * A freeplay round's composition, with no randomness in it at all.
 *
 * Split out from `freeplayWave` so the interface can say what a freeplay round
 * contains without building one. `freeplayWave` draws from the seeded RNG, and
 * a preview that spent a roll would desynchronise the browser from
 * `npm run sim` -- the same constraint documented on `roundHint`. Everything
 * here is a pure function of `round`; the only randomness in a freeplay wave is
 * the per-group toughness jitter, which `freeplayWave` applies on top.
 *
 * The slab is returned separately rather than already unshifted because it is
 * the one group that takes no roll, so `freeplayWave` must jitter the bulk
 * groups and leave it alone. Keeping them apart makes that impossible to get
 * wrong, and lets a preview mark the bulk toughness as approximate and the
 * slab's as exact.
 */
export function freeplayShape(round: number): { slab: FreeplayGroup | null; bulk: FreeplayGroup[] } {
  const past = round - AUTHORED_ROUNDS;

  // Compounding toughness, continuing the authored curve rather than
  // restarting it: round 21 is a touch harder than round 20, not a coast.
  const scale = AUTHORED_FLOOR * Math.pow(1.11, past);
  // Counts grow slowly and level off, so the lane stays readable.
  const bulkCount = Math.min(30, 18 + Math.floor(past * 0.8));

  const bulk = POOL.map((state, i) => ({
    state,
    count: Math.max(6, Math.round(bulkCount * (state === 'CRYSTAL' ? 0.55 : 0.85))),
    gap: Math.max(16, 34 - Math.floor(past / 3)),
    delay: i * 160,
    hpScale: scale,
  }));

  // Every fifth freeplay round leads with a slab: one very deep stack, which
  // is a different question from a crowd and needs a different answer.
  const slab =
    past % 5 === 0
      ? {
          state: 'CRYSTAL' as State,
          count: 4 + Math.floor(past / 5),
          gap: 110,
          delay: 0,
          hpScale: Number((scale * SLAB_RATIO).toFixed(2)),
        }
      : null;

  return { slab, bulk };
}

export function freeplayWave(round: number, rng: Rng): Wave {
  const { slab, bulk } = freeplayShape(round);

  // Jittered in POOL order, one roll per bulk group and none for the slab.
  // The order and count of these draws is load-bearing: change either and
  // every freeplay round in `npm run sim` becomes a different round.
  const groups = bulk.map((g) => ({
    ...g,
    hpScale: Number((g.hpScale * (0.9 + rng.range(0, 0.3))).toFixed(2)),
  }));
  if (slab) groups.unshift(slab);

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
