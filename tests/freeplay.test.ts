import { describe, expect, it } from 'vitest';
import { AUTHORED_ROUNDS, freeplayWave, waveAt } from '../src/sim/freeplay.ts';
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
