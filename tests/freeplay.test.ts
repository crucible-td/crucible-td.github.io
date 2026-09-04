import { describe, expect, it } from 'vitest';
import { AUTHORED_ROUNDS, freeplayShape, freeplayWave, waveAt } from '../src/sim/freeplay.ts';
import { Rng } from '../src/sim/rng.ts';
import { STATE_IDS } from '../src/sim/types.ts';
import { WAVES } from '../src/sim/waves.ts';

/**
 * Rounds past the authored campaign, generated rather than written.
 *
 * This is sim-layer code that ships to players and had no tests. Freeplay
 * depth is also reported by the diversity meter as a property of a build, so a
 * generator that drifted would quietly corrupt a measurement.
 */
describe('freeplay generation', () => {
  it('produces the same round for the same seed', () => {
    expect(freeplayWave(25, new Rng(4))).toEqual(freeplayWave(25, new Rng(4)));
  });

  it('produces different rounds for different seeds', () => {
    expect(freeplayWave(25, new Rng(1))).not.toEqual(freeplayWave(25, new Rng(2)));
  });

  it('only ever spawns layers that exist', () => {
    for (let round = AUTHORED_ROUNDS + 1; round < AUTHORED_ROUNDS + 30; round++) {
      for (const g of freeplayWave(round, new Rng(round)).groups) {
        expect(STATE_IDS, `round ${round}`).toContain(g.state);
      }
    }
  });

  it('gets harder as it goes', () => {
    const toughness = (round: number) =>
      Math.max(...freeplayWave(round, new Rng(1)).groups.map((g) => g.hpScale ?? 1));
    expect(toughness(AUTHORED_ROUNDS + 20)).toBeGreaterThan(toughness(AUTHORED_ROUNDS + 1));
  });

  it('grows in toughness rather than in bodies', () => {
    // Spawning ever more charges would eventually drown the simulation and
    // make headless playtesting slow; a thousand weak charges is also not a
    // more interesting question than a few tough ones.
    const bodies = (round: number) =>
      freeplayWave(round, new Rng(1)).groups.reduce((n, g) => n + g.count, 0);
    expect(bodies(AUTHORED_ROUNDS + 40)).toBeLessThan(200);
  });

  it('leads with a slab every fifth round', () => {
    // A very deep single stack asks a different question than a crowd does.
    const withSlab = freeplayWave(AUTHORED_ROUNDS + 5, new Rng(1));
    const plain = freeplayWave(AUTHORED_ROUNDS + 4, new Rng(1));
    const top = (w: typeof withSlab) => Math.max(...w.groups.map((g) => g.hpScale ?? 1));
    expect(top(withSlab)).toBeGreaterThan(top(plain));
  });

  it('never emits an empty or negative group', () => {
    for (let round = AUTHORED_ROUNDS + 1; round < AUTHORED_ROUNDS + 30; round++) {
      for (const g of freeplayWave(round, new Rng(round)).groups) {
        expect(g.count).toBeGreaterThan(0);
        expect(g.gap).toBeGreaterThan(0);
        expect(g.delay).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe('the seam at round 21', () => {
  // Freeplay used to open from a hardcoded 2.2 with a comment claiming it
  // started "near where the authored rounds finish" -- true when round 20
  // sat at hpScale ~2, false once round 20 grew to bulk groups at 16-17.
  // These pin the seam to round 20's own numbers so a future retune of the
  // campaign moves freeplay's floor with it instead of drifting again.
  //
  // Deliberately re-implemented rather than imported from `sim/stats.ts`: a
  // seam test that validated the source against its own helper would pass
  // for the wrong reason if that helper ever drifted.
  function median(values: number[]): number {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
  }

  it('opens no easier than round 20 finished, so a brutal last round is not a coast', () => {
    const round20Median = median(WAVES[WAVES.length - 1]!.groups.map((g) => g.hpScale ?? 1));
    for (const seed of [1, 2, 3, 4, 5]) {
      const round21Median = median(
        freeplayWave(AUTHORED_ROUNDS + 1, new Rng(seed)).groups.map((g) => g.hpScale ?? 1),
      );
      expect(round21Median, `seed ${seed}`).toBeGreaterThanOrEqual(round20Median);
      expect(round21Median, `seed ${seed}`).toBeLessThan(round20Median * 1.5);
    }
  });

  it('keeps the slab a comparable spike above the floor, not a trivially easier one', () => {
    const round20Groups = WAVES[WAVES.length - 1]!.groups.map((g) => g.hpScale ?? 1);
    const round20SlabRatio = Math.max(...round20Groups) / median(round20Groups);
    const slabRound = AUTHORED_ROUNDS + 5;
    const w = freeplayWave(slabRound, new Rng(1));
    const bulkFloor = median(w.groups.slice(1).map((g) => g.hpScale ?? 1));
    const slab = w.groups[0]!.hpScale ?? 1;
    expect(slab / bulkFloor).toBeGreaterThan(round20SlabRatio * 0.8);
    expect(slab / bulkFloor).toBeLessThan(round20SlabRatio * 1.5);
  });
});

describe('wave lookup', () => {
  it('returns the authored rounds untouched', () => {
    for (let i = 0; i < AUTHORED_ROUNDS; i++) {
      expect(waveAt(i, new Rng(1))).toBe(WAVES[i]);
    }
  });

  it('generates anything past them', () => {
    const w = waveAt(AUTHORED_ROUNDS, new Rng(1));
    expect(WAVES).not.toContain(w);
    expect(w.groups.length).toBeGreaterThan(0);
  });

  it('agrees with the authored count, so the campaign ends where it says', () => {
    expect(AUTHORED_ROUNDS).toBe(WAVES.length);
  });
});

describe('freeplayShape', () => {
  const round = AUTHORED_ROUNDS + 5;

  it('describes a round without drawing from the RNG', () => {
    // The whole reason it exists: the preview strip runs every frame, and a
    // roll spent there would desynchronise the browser from npm run sim.
    const rng = new Rng(7);
    freeplayShape(round);
    freeplayShape(round);
    expect(rng.range(0, 1)).toBe(new Rng(7).range(0, 1));
  });

  it('is the wave freeplayWave builds, minus the toughness jitter', () => {
    const shape = freeplayShape(round);
    const wave = freeplayWave(round, new Rng(3));
    const groups = [...(shape.slab ? [shape.slab] : []), ...shape.bulk];

    expect(wave.groups.map((g) => g.state)).toEqual(groups.map((g) => g.state));
    expect(wave.groups.map((g) => g.count)).toEqual(groups.map((g) => g.count));
    // The slab takes no roll, so its toughness is exact either way.
    expect(wave.groups[0]!.hpScale).toBe(shape.slab!.hpScale);
    // Every bulk group's real toughness lands inside the documented jitter.
    for (let i = 0; i < shape.bulk.length; i++) {
      const actual = wave.groups[i + 1]!.hpScale!;
      const base = shape.bulk[i]!.hpScale;
      expect(actual).toBeGreaterThanOrEqual(base * 0.9 - 0.01);
      expect(actual).toBeLessThanOrEqual(base * 1.2 + 0.01);
    }
  });

  it('has no slab except on every fifth round, matching the wave it feeds', () => {
    expect(freeplayShape(AUTHORED_ROUNDS + 5).slab).not.toBeNull();
    expect(freeplayShape(AUTHORED_ROUNDS + 4).slab).toBeNull();
  });
});
