import { describe, expect, it } from 'vitest';
import { ECONOMY } from '../src/sim/economy.ts';
import { PATH_LENGTH, isBuildableCell } from '../src/sim/path.ts';
import { STATES } from '../src/sim/types.ts';
import type { State } from '../src/sim/types.ts';
import { applyElement, createWorld, placeTower, spawnCharge, startWave, step } from '../src/sim/world.ts';
import type { World } from '../src/sim/world.ts';

/**
 * Drop a single charge onto the lane without running a wave.
 *
 * Goes through the sim's own constructor rather than building the literal
 * here. Riders added seven fields to `Charge`, and a hand-rolled test charge
 * would have gone on compiling with none of them set.
 */
function seedCharge(w: World, state: State, dist = 0) {
  return spawnCharge(w, state, dist);
}

/** Hit a charge hard enough to take the layer off in one go. */
function breakOnce(w: World, c: ReturnType<typeof seedCharge>, element: Parameters<typeof applyElement>[2]) {
  applyElement(w, c, element, 999);
}

describe('determinism', () => {
  it('produces identical outcomes from identical seeds', () => {
    const run = () => {
      const w = createWorld(1234);
      placeTower(w, 'vat', 4, 1);
      placeTower(w, 'stamp', 8, 1);
      startWave(w);
      for (let i = 0; i < 3000 && w.status === 'running'; i++) step(w);
      return { tick: w.tick, gold: w.gold, lives: w.lives, stats: w.stats };
    };
    expect(run()).toEqual(run());
  });

  it('produces different outcomes from different seeds once splitting occurs', () => {
    const run = (seed: number) => {
      const w = createWorld(seed);
      seedCharge(w, 'CRYSTAL', 100);
      // Breaking a Crystal scatters two Molten cores; the offsets are the only
      // randomness in the sim, so this is where seeds must actually diverge.
      applyElement(w, w.charges[0]!, 'KINETIC', 999);
      return w.charges.filter((c) => c.alive).map((c) => c.dist);
    };
    expect(run(1)).not.toEqual(run(999));
  });
});

describe('the damage economy', () => {
  it('pays the layer bounty when a layer breaks', () => {
    const w = createWorld(1);
    const c = seedCharge(w, 'ORE');
    const before = w.gold;
    breakOnce(w, c, 'HEAT');
    expect(w.gold).toBe(before + STATES.ORE.bounty);
    expect(w.stats.breaks).toBe(1);
  });

  it('pays for depth: one Crystal is five payouts on its way down', () => {
    // Shell, two Molten cores, two Slag remnants. Depth of enemy rather than
    // number of enemies is what makes a late round lucrative.
    const w = createWorld(1);
    breakOnce(w, seedCharge(w, 'CRYSTAL'), 'KINETIC');
    for (const core of [...w.charges.filter((c) => c.alive)]) breakOnce(w, core, 'COLD');
    for (const rem of [...w.charges.filter((c) => c.alive)]) breakOnce(w, rem, 'KINETIC');
    expect(w.charges.filter((c) => c.alive)).toHaveLength(0);
    expect(w.stats.breaks).toBe(5);
    const expected = STATES.CRYSTAL.bounty + 2 * STATES.MOLTEN.bounty + 2 * STATES.SLAG.bounty;
    expect(w.gold).toBe(ECONOMY.startGold + expected);
  });

  it('pays nothing and counts a wasted shot when the element is useless', () => {
    const w = createWorld(1);
    const c = seedCharge(w, 'MOLTEN');
    applyElement(w, c, 'HEAT', 999);
    expect(c.alive).toBe(true);
    expect(c.hp).toBe(STATES.MOLTEN.hp);
    expect(w.gold).toBe(ECONOMY.startGold);
    expect(w.stats.wasted).toBe(1);
  });
});

describe('layers', () => {
  it('breaks a Crystal shell into two Molten cores', () => {
    const w = createWorld(7);
    const c = seedCharge(w, 'CRYSTAL', 200);
    breakOnce(w, c, 'KINETIC');
    expect(c.alive).toBe(false);
    const children = w.charges.filter((x) => x.alive);
    expect(children).toHaveLength(2);
    expect(children.every((x) => x.state === 'MOLTEN')).toBe(true);
  });

  it('terminates: the chain only ever runs inward', () => {
    // Slag is the floor. Nothing anywhere puts a layer back on, which is what
    // bounds a cascade at five entities however it is triggered.
    const w = createWorld(1);
    const c = seedCharge(w, 'SLAG');
    breakOnce(w, c, 'KINETIC');
    expect(w.charges.filter((x) => x.alive)).toHaveLength(0);
    expect(w.stats.kills).toBe(1);
  });

  it('applies the resistance multiplier to incoming damage', () => {
    const w = createWorld(1);
    const c = seedCharge(w, 'CRYSTAL');
    applyElement(w, c, 'KINETIC', 4);
    // Kinetic doubles against Crystal.
    expect(c.hp).toBe(STATES.CRYSTAL.hp - 8);
  });

  it('lets vapor ignore kinetic entirely', () => {
    const w = createWorld(1);
    const c = seedCharge(w, 'VAPOR');
    applyElement(w, c, 'KINETIC', 999);
    expect(c.alive).toBe(true);
    expect(c.hp).toBe(STATES.VAPOR.hp);
  });
});

describe('leaks and lives', () => {
  it('charges lives according to the state that leaks', () => {
    const w = createWorld(1);
    seedCharge(w, 'VAPOR', PATH_LENGTH - 1);
    step(w);
    expect(w.lives).toBe(ECONOMY.startLives - STATES.VAPOR.leakCost);
    expect(w.stats.leaks).toBe(1);
  });

  it('ends the run when lives run out', () => {
    const w = createWorld(1);
    w.lives = 1;
    seedCharge(w, 'MOLTEN', PATH_LENGTH - 1);
    step(w);
    expect(w.status).toBe('lost');
  });
});

describe('building', () => {
  it('refuses to build on the lane', () => {
    const w = createWorld(1);
    // Cell (2,3) sits on the first straight of the lane.
    expect(isBuildableCell(2, 3)).toBe(false);
    expect(placeTower(w, 'forge', 2, 3)).toBe(false);
    expect(w.towers).toHaveLength(0);
    expect(w.gold).toBe(ECONOMY.startGold);
  });

  it('refuses to stack two towers on one cell and charges only once', () => {
    const w = createWorld(1);
    expect(placeTower(w, 'forge', 1, 6)).toBe(true);
    const afterFirst = w.gold;
    expect(placeTower(w, 'stamp', 1, 6)).toBe(false);
    expect(w.gold).toBe(afterFirst);
    expect(w.towers).toHaveLength(1);
  });

  it('refuses to build without the gold', () => {
    const w = createWorld(1);
    w.gold = 10;
    expect(placeTower(w, 'chiller', 1, 6)).toBe(false);
  });
});

describe('wave flow', () => {
  it('clears a wave, pays the bonus, and returns to idle', () => {
    const w = createWorld(3);
    placeTower(w, 'forge', 4, 1);
    placeTower(w, 'stamp', 7, 1);
    startWave(w);
    for (let i = 0; i < 5000 && w.status === 'running'; i++) step(w);
    expect(w.status).toBe('idle');
    expect(w.waveIndex).toBe(1);
    expect(w.stats.goldEarned).toBeGreaterThan(ECONOMY.roundClearBonus(1));
  });
});
