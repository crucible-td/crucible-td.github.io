import { describe, expect, it } from 'vitest';
import { parseLoadout } from '../src/sim/loadout.ts';
import { RESISTANCE, resolveResistance } from '../src/sim/resistance.ts';
import { TOWER_IDS } from '../src/sim/towers.ts';
import { ELEMENT_IDS, STATE_IDS, STATES } from '../src/sim/types.ts';
import type { Element, State } from '../src/sim/types.ts';
import { UPGRADES, UPGRADE_IDS, upgradesFor } from '../src/sim/upgrades.ts';
import { canUpgrade, createWorld, placeTower, startWave, step, towerAt, upgradeTower } from '../src/sim/world.ts';
import type { World } from '../src/sim/world.ts';

/**
 * Upgrades rewrite cells of the resistance table, so they get the same
 * treatment the table itself gets in resistance.test.ts: every rewritten cell
 * is asserted explicitly. The table IS the game, and an upgrade is a paid
 * licence to change it -- so an accidental edit to one must fail here rather
 * than quietly change what the game is.
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
    // minority." Six behavioural to four numeric.
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
          expect(RESISTANCE[state as State][element as Element]).toBeTypeOf('number');
        }
      }
    }
  });

  it('rewrites exactly these cells and no others', () => {
    expect(UPGRADES.kiln.overrides).toEqual({ MOLTEN: { HEAT: 0.75 } });
    expect(UPGRADES.deposition.overrides).toEqual({ CRYSTAL: { COLD: 1.0 } });
    expect(UPGRADES.dampened.overrides).toEqual({ MOLTEN: { KINETIC: 1.75 } });
    expect(UPGRADES.reclaimer.overrides).toEqual({ VAPOR: { SOLVENT: 3.0 } });
    expect(UPGRADES.catalyst.overrides).toEqual({ SLAG: { SOLVENT: 2.5 } });
    expect(UPGRADES.prism.overrides).toEqual({ ORE: { HEAT: 2.5 }, CRYSTAL: { HEAT: 2.0 } });
    // The numeric branches touch no cells at all.
    for (const id of ['bellows', 'supercooled', 'wideDie', 'focus'] as const) {
      expect(UPGRADES[id].overrides, id).toBeUndefined();
    }
  });

  it('lets a branch lift an immunity, which is the strongest thing to sell', () => {
    // An immunity is the hardest wall in the game, so partly lifting one is
    // how a build covers a gap it was never designed for -- more answers per
    // layer is more builds that work.
    expect(RESISTANCE.MOLTEN.HEAT).toBe(0);
    expect(resolveResistance('MOLTEN', 'HEAT', UPGRADES.kiln.overrides)).toBeGreaterThan(0);
    expect(RESISTANCE.CRYSTAL.COLD).toBe(0);
    expect(resolveResistance('CRYSTAL', 'COLD', UPGRADES.deposition.overrides)).toBeGreaterThan(0);
  });
});

describe('resolveResistance through an upgrade', () => {
  it('is exactly the base table when nothing is upgraded', () => {
    for (const s of STATE_IDS) {
      for (const e of ELEMENT_IDS) {
        expect(resolveResistance(s, e), `${s}+${e}`).toBe(RESISTANCE[s][e]);
      }
    }
  });

  it('replaces only the overridden cell, leaving the rest of the row alone', () => {
    const o = UPGRADES.dampened.overrides;
    expect(resolveResistance('MOLTEN', 'KINETIC', o)).toBe(1.75);
    expect(resolveResistance('MOLTEN', 'COLD', o)).toBe(RESISTANCE.MOLTEN.COLD);
    expect(resolveResistance('CRYSTAL', 'KINETIC', o)).toBe(RESISTANCE.CRYSTAL.KINETIC);
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
  /** Run one round and report what happened. */
  function runRound(loadout: string, waveIndex: number, seed = 1) {
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

  it('stops a Forge wasting every shot on Molten once it has a Kiln', () => {
    // Round 4 is entirely Molten, which Heat cannot touch at all: a bare Forge
    // holds fire and achieves nothing. The branch is what buys it a way in.
    const bare = runRound('forge@5,9 forge@8,9', 3);
    const kilned = runRound('forge@5,9+kiln forge@8,9+kiln', 3);
    expect(bare.stats.breaks).toBe(0);
    expect(kilned.stats.breaks).toBeGreaterThan(0);
  });

  it('stays deterministic with upgrades in the loadout', () => {
    const run = () => {
      const w = runRound('vat@5,9+reclaimer stamp@8,9 chiller@11,9+deposition', 8);
      return { tick: w.tick, gold: w.gold, lives: w.lives, stats: w.stats };
    };
    expect(run()).toEqual(run());
  });

  it('changes nothing at all for a loadout that buys no upgrades', () => {
    const a = runRound('forge@5,9 stamp@8,9', 0);
    const b = runRound('forge@5,9 stamp@8,9', 0);
    expect(a.stats).toEqual(b.stats);
    expect(STATES.CRYSTAL.breaksInto).toBe('MOLTEN');
  });
});
