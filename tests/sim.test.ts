import { describe, expect, it } from 'vitest';
import { ECONOMY } from '../src/sim/economy.ts';
import { AUTHORED_ROUNDS } from '../src/sim/freeplay.ts';
import { PATH_LENGTH, isBuildableCell } from '../src/sim/path.ts';
import { STATES } from '../src/sim/types.ts';
import type { State } from '../src/sim/types.ts';
import {
  applyElement,
  createWorld,
  enterFreeplay,
  placeTower,
  spawnCharge,
  startWave,
  step,
} from '../src/sim/world.ts';
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

/**
 * Put a world at the end of a won campaign, driven by hand rather than by
 * playing all twenty rounds -- the same shortcut headless.ts and
 * tests/upgrades.test.ts take to reach an arbitrary round without simulating
 * every one before it.
 */
function markWon(w: World): void {
  w.waveIndex = AUTHORED_ROUNDS;
  w.status = 'won';
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

describe('entering freeplay', () => {
  it('refuses while idle, since there is no finished run to continue', () => {
    const w = createWorld(1);
    expect(enterFreeplay(w)).toBe(false);
    expect(w.freeplay).toBe(false);
    expect(w.status).toBe('idle');
  });

  it('refuses mid-wave, since freeplay is a choice made after winning', () => {
    const w = createWorld(1);
    startWave(w);
    expect(w.status).toBe('running');
    expect(enterFreeplay(w)).toBe(false);
    expect(w.freeplay).toBe(false);
    expect(w.status).toBe('running');
  });

  it('accepts once the campaign is won, and reopens the idle state', () => {
    const w = createWorld(1);
    markWon(w);
    expect(enterFreeplay(w)).toBe(true);
    expect(w.freeplay).toBe(true);
    expect(w.status).toBe('idle');
  });

  it('lets the round after 20 start and finish without re-declaring a win', () => {
    const w = createWorld(1);
    markWon(w);
    enterFreeplay(w);
    // No towers are placed, so every charge in round 21 walks off the lane and
    // leaks rather than being killed. Lives are padded out so that leaking
    // fifty-odd charges cannot itself end the run -- this test is only about
    // whether `step` re-wins at this waveIndex, not about surviving combat.
    w.lives = 1_000_000;
    expect(startWave(w)).toBe(true);
    for (let i = 0; i < 20000 && w.status === 'running'; i++) step(w);
    expect(w.status).toBe('idle');
    expect(w.waveIndex).toBe(AUTHORED_ROUNDS + 1);
  });
});

describe('a hit resolves once per charge per tick', () => {
  /**
   * The property `breakLayer` has always claimed and never held.
   *
   * Both `advanceProjectiles` and `advanceEffects` walked `w.charges` while
   * `breakLayer` pushed children onto that same array, so a layer born mid-loop
   * was hit by the very splash -- or ticked by the very corrosion -- that had
   * just exposed it. One shot beside a Crystal produced seven breaks and three
   * kills: the whole stack, from a single projectile.
   *
   * Stated as a count rather than as a scenario, because the scenario is not
   * the bug: a charge breaks at most once per tick, so no `step()` can ever
   * break more layers than there were charges alive when it began. That holds
   * for splash, for burn, for corrode and for anything added later, and it is
   * the assertion the comment in `breakLayer` was standing in for.
   */
  function assertOneBreakPerChargePerTick(w: World, ticks: number): void {
    for (let i = 0; i < ticks; i++) {
      const alive = w.charges.filter((c) => c.alive).length;
      const before = w.stats.breaks;
      step(w);
      const broke = w.stats.breaks - before;
      expect(broke, `tick ${w.tick}: ${broke} breaks from ${alive} charges`).toBeLessThanOrEqual(alive);
    }
  }

  it('never lets one splash clear a cascade it just created', () => {
    const w = createWorld(7);
    // Acid Tanks, because they are the only tower that splashes, and Lava --
    // which Solvent beats at x1.6 and whose Ash remnant it beats at x1.25, so
    // a break and the child's break are both reachable from one shot.
    placeTower(w, 'vat', 5, 9);
    placeTower(w, 'vat', 6, 9);
    for (let i = 0; i < 8; i++) seedCharge(w, 'MOLTEN', 300 + i * 10);
    assertOneBreakPerChargePerTick(w, 600);
    expect(w.stats.breaks).toBeGreaterThan(0);
  });

  it('never lets a corrode tick tick the layer it just uncovered', () => {
    const w = createWorld(11);
    for (const c of [seedCharge(w, 'CRYSTAL', 320), seedCharge(w, 'CRYSTAL', 330)]) {
      // Corrosion is the one rider that survives a break, so it is the tick
      // that can chain: it follows both Lava cores out of the shell it ate.
      c.corrodeTicks = 400;
      c.corrodeDamage = 40;
    }
    assertOneBreakPerChargePerTick(w, 400);
    expect(w.stats.breaks).toBeGreaterThan(0);
  });
});
