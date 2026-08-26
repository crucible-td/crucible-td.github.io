import { describe, expect, it } from 'vitest';
import { parseLoadout } from '../src/sim/loadout.ts';
import { TRANSMUTATION, resolveOutcome } from '../src/sim/table.ts';
import { TOWER_IDS } from '../src/sim/towers.ts';
import { ELEMENT_IDS, STATE_IDS, STATES } from '../src/sim/types.ts';
import type { Element, State } from '../src/sim/types.ts';
import { UPGRADES, UPGRADE_IDS, upgradesFor } from '../src/sim/upgrades.ts';
import { canUpgrade, createWorld, placeTower, startWave, step, towerAt, upgradeTower } from '../src/sim/world.ts';
import type { World } from '../src/sim/world.ts';

/**
 * Upgrades rewrite cells of the transmutation table, so they get the same
 * treatment the table itself gets in table.test.ts: every rewritten cell is
 * asserted explicitly. The table IS the game, and an upgrade is a paid licence
 * to change it -- so an accidental edit to one must fail here rather than
 * quietly change what the game is.
 */
describe('upgrade branches', () => {
  it('gives every tower exactly two mutually exclusive branches', () => {
    for (const t of TOWER_IDS) expect(upgradesFor(t), t).toHaveLength(2);
    expect(UPGRADE_IDS).toHaveLength(TOWER_IDS.length * 2);
  });

  it('keeps every id self-consistent', () => {
    for (const id of UPGRADE_IDS) expect(UPGRADES[id].id).toBe(id);
  });

  it('keeps behaviour-changing branches in the majority', () => {
    // DESIGN.md: "numeric-only upgrades are the boring half; keep them a
    // minority." Five behavioural to three numeric.
    const behavioural = UPGRADE_IDS.filter((id) => UPGRADES[id].overrides !== undefined);
    expect(behavioural.length).toBeGreaterThan(UPGRADE_IDS.length - behavioural.length);
  });

  it('only ever rewrites cells that already exist', () => {
    // An override may replace a cell, never invent a new state or element.
    for (const id of UPGRADE_IDS) {
      for (const [state, row] of Object.entries(UPGRADES[id].overrides ?? {})) {
        expect(STATE_IDS, `${id} state`).toContain(state as State);
        for (const element of Object.keys(row)) {
          expect(ELEMENT_IDS, `${id} element`).toContain(element as Element);
          expect(TRANSMUTATION[state as State][element as Element]).toBeDefined();
        }
      }
    }
  });

  it('rewrites exactly these cells and no others', () => {
    expect(UPGRADES.kiln.overrides).toEqual({ CRYSTAL: { HEAT: { kind: 'none' } } });
    expect(UPGRADES.deposition.overrides).toEqual({ VAPOR: { COLD: { kind: 'transmute', to: 'CRYSTAL' } } });
    expect(UPGRADES.dampened.overrides).toEqual({ MOLTEN: { KINETIC: { kind: 'damage', amount: 1 } } });
    expect(UPGRADES.reclaimer.overrides).toEqual({ VAPOR: { SOLVENT: { kind: 'damage', amount: 2 } } });
    expect(UPGRADES.catalyst.overrides).toEqual({ SLAG: { SOLVENT: { kind: 'destroy', gold: 1 } } });
    // The numeric three touch no cells at all.
    for (const id of ['bellows', 'supercooled', 'wideDie'] as const) {
      expect(UPGRADES[id].overrides, id).toBeUndefined();
    }
  });
});

describe('resolveOutcome', () => {
  it('is exactly the base table when nothing is upgraded', () => {
    for (const s of STATE_IDS) {
      for (const e of ELEMENT_IDS) {
        expect(resolveOutcome(s, e), `${s}+${e}`).toEqual(TRANSMUTATION[s][e]);
      }
    }
  });

  it('replaces only the overridden cell, leaving the rest of the row alone', () => {
    const o = UPGRADES.dampened.overrides;
    expect(resolveOutcome('MOLTEN', 'KINETIC', o)).toEqual({ kind: 'damage', amount: 1 });
    expect(resolveOutcome('MOLTEN', 'COLD', o)).toEqual(TRANSMUTATION.MOLTEN.COLD);
    expect(resolveOutcome('CRYSTAL', 'KINETIC', o)).toEqual(TRANSMUTATION.CRYSTAL.KINETIC);
  });
});

describe('buying an upgrade', () => {
  const placed = (gold: number): [World, ReturnType<typeof towerAt>] => {
    const w = createWorld(1);
    placeTower(w, 'stamp', 11, 9);
    w.gold = gold;
    return [w, towerAt(w, 11, 9)];
  };

  it('deducts the cost and records the branch', () => {
    const [w, t] = placed(500);
    expect(upgradeTower(w, t!, 'dampened')).toBe(true);
    expect(t!.upgrade).toBe('dampened');
    expect(w.gold).toBe(500 - UPGRADES.dampened.cost);
  });

  it('refuses a branch belonging to a different tower', () => {
    const [w, t] = placed(500);
    expect(canUpgrade(w, t!, 'kiln')).toBe(false);
    expect(upgradeTower(w, t!, 'kiln')).toBe(false);
    expect(w.gold).toBe(500);
  });

  it('refuses a second branch, since there is no refund', () => {
    const [w, t] = placed(500);
    upgradeTower(w, t!, 'dampened');
    expect(upgradeTower(w, t!, 'wideDie')).toBe(false);
    expect(t!.upgrade).toBe('dampened');
  });

  it('refuses when the player cannot pay', () => {
    const [w, t] = placed(UPGRADES.dampened.cost - 1);
    expect(upgradeTower(w, t!, 'dampened')).toBe(false);
    expect(t!.upgrade).toBeNull();
  });
});

describe('upgrades in play', () => {
  /** Run one wave and report what happened. */
  function runWave(loadout: string, waveIndex: number, seed = 1) {
    const w = createWorld(seed);
    w.waveIndex = waveIndex;
    w.gold = Number.MAX_SAFE_INTEGER;
    for (const p of parseLoadout(loadout)) {
      placeTower(w, p.def, p.col, p.row);
      if (p.upgrade) upgradeTower(w, towerAt(w, p.col, p.row)!, p.upgrade);
    }
    startWave(w);
    for (let i = 0; i < 20000 && w.status === 'running'; i++) step(w);
    return w;
  }

  it('lets a Dampened Press break the ordering rule it normally enforces', () => {
    // Wave 1 with a Stamp ahead of the Chiller is the canonical disaster: the
    // Stamp meets Molten and splits it. The branch is what makes that
    // survivable, which is the entire point of buying it.
    const trap = runWave('forge@5,4 stamp@1,8 chiller@8,10', 0);
    expect(trap.stats.splits).toBeGreaterThan(0);

    const fixed = runWave('forge@5,4 stamp@1,8+dampened chiller@8,10', 0);
    expect(fixed.stats.splits).toBe(0);
    expect(fixed.status).not.toBe('lost');
  });

  it('makes a Kiln Forge hold fire on Crystal instead of melting it back', () => {
    // CRYSTAL/HEAT becomes 'none', and towers already decline to fire where the
    // resolved outcome is 'none' -- so the upgrade shows up as restraint.
    const plain = runWave('chiller@5,9 forge@11,9 stamp@18,3', 6);
    const kiln = runWave('chiller@5,9 forge@11,9+kiln stamp@18,3', 6);
    expect(kiln.stats.shatters).toBeGreaterThanOrEqual(plain.stats.shatters);
  });

  it('stays deterministic with upgrades in the loadout', () => {
    const run = () => {
      const w = runWave('vat@5,1+reclaimer stamp@5,5 chiller@14,9+deposition', 5);
      return { tick: w.tick, gold: w.gold, lives: w.lives, stats: w.stats };
    };
    expect(run()).toEqual(run());
  });

  it('changes nothing at all for a loadout that buys no upgrades', () => {
    const a = runWave('forge@5,4 chiller@1,8 stamp@8,10', 0);
    expect(a.stats.shatters).toBe(6);
    expect(a.stats.leaks).toBe(0);
    expect(STATES.CRYSTAL.leakCost).toBe(1);
  });
});
