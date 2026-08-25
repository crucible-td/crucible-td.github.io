import { describe, expect, it } from 'vitest';
import { ECONOMY } from '../src/sim/economy.ts';
import { PATH_LENGTH, isBuildableCell } from '../src/sim/path.ts';
import { STATES } from '../src/sim/types.ts';
import type { State } from '../src/sim/types.ts';
import { applyElement, createWorld, placeTower, startWave, step } from '../src/sim/world.ts';
import type { World } from '../src/sim/world.ts';

/** Drop a single charge onto the lane without running a wave. */
function seedCharge(w: World, state: State, dist = 0) {
  w.charges.push({
    id: w.nextId++,
    state,
    dist,
    integrity: STATES[state].integrity,
    speedMult: 1,
    splits: 1,
    alive: true,
    flash: 0,
  });
  return w.charges[w.charges.length - 1]!;
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
      seedCharge(w, 'MOLTEN', 100);
      applyElement(w, w.charges[0]!, 'KINETIC');
      return w.charges.map((c) => c.dist);
    };
    // Split offsets are the only randomness in the sim, so this is where seeds
    // must actually diverge.
    expect(run(1)).not.toEqual(run(999));
  });
});

describe('the transmutation economy', () => {
  it('pays per transmute, not per kill', () => {
    const w = createWorld(1);
    const c = seedCharge(w, 'ORE');
    const before = w.gold;
    applyElement(w, c, 'HEAT');
    expect(c.state).toBe('MOLTEN');
    expect(w.gold).toBe(before + ECONOMY.goldPerTransmute);
    expect(w.stats.transmutes).toBe(1);
  });

  it('pays a premium for the full HEAT -> COLD -> KINETIC line', () => {
    const w = createWorld(1);
    const c = seedCharge(w, 'ORE');
    applyElement(w, c, 'HEAT');
    applyElement(w, c, 'COLD');
    expect(c.state).toBe('CRYSTAL');
    applyElement(w, c, 'KINETIC');
    expect(c.alive).toBe(false);
    expect(w.stats.shatters).toBe(1);
    // 2 transmutes + shatter bonus, versus 1 gold for chipping it to death.
    expect(w.gold).toBe(ECONOMY.startGold + 2 * ECONOMY.goldPerTransmute + 6);
    expect(w.gold).toBeGreaterThan(ECONOMY.startGold + ECONOMY.goldPerKill);
  });

  it('awards nothing when an element bounces off', () => {
    const w = createWorld(1);
    const c = seedCharge(w, 'ORE');
    applyElement(w, c, 'COLD');
    expect(c.state).toBe('ORE');
    expect(w.gold).toBe(ECONOMY.startGold);
  });
});

describe('the traps', () => {
  it('splits molten into three under kinetic', () => {
    const w = createWorld(7);
    const c = seedCharge(w, 'MOLTEN', 200);
    applyElement(w, c, 'KINETIC');
    expect(c.alive).toBe(false);
    const children = w.charges.filter((x) => x.alive);
    expect(children).toHaveLength(3);
    expect(children.every((x) => x.state === 'MOLTEN')).toBe(true);
  });

  it('bounds splitting so a lineage cannot multiply forever', () => {
    const w = createWorld(7);
    applyElement(w, seedCharge(w, 'MOLTEN', 200), 'KINETIC');
    for (const child of [...w.charges]) applyElement(w, child, 'KINETIC');
    // Children carry splits: 0, so the second wave of hits does nothing.
    expect(w.charges.filter((c) => c.alive)).toHaveLength(3);
  });

  it('accelerates molten under heat and resets that speed on transmute', () => {
    const w = createWorld(1);
    const c = seedCharge(w, 'MOLTEN');
    applyElement(w, c, 'HEAT');
    expect(c.speedMult).toBeCloseTo(1.4);
    applyElement(w, c, 'COLD');
    expect(c.state).toBe('CRYSTAL');
    expect(c.speedMult).toBe(1);
  });

  it('lets vapor ignore kinetic entirely', () => {
    const w = createWorld(1);
    const c = seedCharge(w, 'VAPOR');
    applyElement(w, c, 'KINETIC');
    expect(c.alive).toBe(true);
    expect(c.state).toBe('VAPOR');
    expect(c.integrity).toBe(STATES.VAPOR.integrity);
  });

  it('chips ore slowly enough that kinetic alone is a bad plan', () => {
    const w = createWorld(1);
    const c = seedCharge(w, 'ORE');
    for (let i = 0; i < STATES.ORE.integrity - 1; i++) applyElement(w, c, 'KINETIC');
    expect(c.alive).toBe(true);
    applyElement(w, c, 'KINETIC');
    expect(c.alive).toBe(false);
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
    placeTower(w, 'vat', 4, 1);
    placeTower(w, 'stamp', 7, 1);
    startWave(w);
    for (let i = 0; i < 5000 && w.status === 'running'; i++) step(w);
    expect(w.status).toBe('idle');
    expect(w.waveIndex).toBe(1);
    expect(w.stats.goldEarned).toBeGreaterThan(ECONOMY.waveClearBonus(1));
  });
});
