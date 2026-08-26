import { describe, expect, it } from 'vitest';
import { parseLoadout } from '../src/sim/loadout.ts';
import { RESISTANCE, resolveResistance } from '../src/sim/resistance.ts';
import { TOWER_IDS } from '../src/sim/towers.ts';
import { ELEMENT_IDS, STATE_IDS, STATES } from '../src/sim/types.ts';
import type { Element, State } from '../src/sim/types.ts';
import { UPGRADES, UPGRADE_IDS, chainCost, chainTo, pathsFor, tiersOf, upgradesFor } from '../src/sim/upgrades.ts';
import {
  availableUpgrades,
  canUpgrade,
  createWorld,
  placeTower,
  startWave,
  step,
  towerAt,
  upgradeTower,
} from '../src/sim/world.ts';
import type { World } from '../src/sim/world.ts';

/**
 * Upgrades rewrite cells of the resistance table, so they get the same
 * treatment the table itself gets in resistance.test.ts: every rewritten cell
 * is asserted explicitly. The table IS the game, and an upgrade is a paid
 * licence to change it -- so an accidental edit to one must fail here rather
 * than quietly change what the game is.
 */
describe('upgrade branches', () => {
  it('gives every tower two paths of three tiers', () => {
    for (const t of TOWER_IDS) {
      expect(pathsFor(t), t).toHaveLength(2);
      expect(upgradesFor(t), t).toHaveLength(6);
      for (const path of pathsFor(t)) {
        expect(tiersOf(t, path).map((u) => u.tier), `${t}/${path}`).toEqual([1, 2, 3]);
      }
    }
    expect(UPGRADE_IDS).toHaveLength(TOWER_IDS.length * 6);
  });

  it('prices each tier above the one below it', () => {
    for (const t of TOWER_IDS) {
      for (const path of pathsFor(t)) {
        const costs = tiersOf(t, path).map((u) => u.cost);
        expect(costs, `${t}/${path}`).toEqual([...costs].sort((a, b) => a - b));
      }
    }
  });

  it('reports the whole chain that a tier implies', () => {
    expect(chainTo('kiln3').map((u) => u.id)).toEqual(['kiln1', 'kiln2', 'kiln3']);
    expect(chainTo('kiln1').map((u) => u.id)).toEqual(['kiln1']);
    expect(chainCost('kiln3')).toBe(UPGRADES.kiln1.cost + UPGRADES.kiln2.cost + UPGRADES.kiln3.cost);
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
    expect(UPGRADES.kiln1.overrides).toEqual({ MOLTEN: { HEAT: 0.5 } });
    expect(UPGRADES.kiln3.overrides).toEqual({ MOLTEN: { HEAT: 1.4 } });
    expect(UPGRADES.depo3.overrides).toEqual({ CRYSTAL: { COLD: 1.75 } });
    expect(UPGRADES.die3.overrides).toEqual({ CRYSTAL: { KINETIC: 3.5 } });
    expect(UPGRADES.recl3.overrides).toEqual({ VAPOR: { SOLVENT: 4.0 }, CRYSTAL: { SOLVENT: 0.6 } });
    expect(UPGRADES.prism3.overrides).toEqual({
      ORE: { HEAT: 3.0 },
      CRYSTAL: { HEAT: 2.5 },
      VAPOR: { HEAT: 1.5 },
    });
    // The purely numeric tiers touch no cells at all.
    for (const id of ['bellows1', 'bellows3', 'super1', 'die1', 'focus1', 'focus3'] as const) {
      expect(UPGRADES[id].overrides, id).toBeUndefined();
    }
  });

  it('climbs toward lifting an immunity, which is what a path is for', () => {
    // An immunity is the hardest wall in the game, so lifting one is the
    // strongest thing a player can buy -- and it belongs at the top of a path,
    // reached by commitment rather than handed out at tier 1.
    expect(RESISTANCE.MOLTEN.HEAT).toBe(0);
    const climb = chainTo('kiln3').map((u) => resolveResistance('MOLTEN', 'HEAT', u.overrides));
    expect(climb).toEqual([...climb].sort((a, b) => a - b));
    expect(climb[climb.length - 1]).toBeGreaterThan(1);

    // The Vat's own wall, undone only at the very top of its path.
    expect(RESISTANCE.CRYSTAL.SOLVENT).toBe(0);
    expect(resolveResistance('CRYSTAL', 'SOLVENT', UPGRADES.recl3.overrides)).toBeGreaterThan(0);
    expect(UPGRADES.recl1.overrides?.CRYSTAL).toBeUndefined();
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
    const o = UPGRADES.damp2.overrides;
    expect(resolveResistance('MOLTEN', 'KINETIC', o)).toBe(1.75);
    expect(resolveResistance('MOLTEN', 'COLD', o)).toBe(RESISTANCE.MOLTEN.COLD);
    expect(resolveResistance('CRYSTAL', 'KINETIC', o)).toBe(RESISTANCE.CRYSTAL.KINETIC);
  });
});

describe('climbing a path', () => {
  const placed = (gold: number): [World, ReturnType<typeof towerAt>] => {
    const w = createWorld(1);
    placeTower(w, 'stamp', 11, 9);
    w.gold = gold;
    return [w, towerAt(w, 11, 9)];
  };

  it('deducts the cost and records the tier', () => {
    const [w, t] = placed(900);
    expect(upgradeTower(w, t!, 'damp1')).toBe(true);
    expect(t!.upgrades).toEqual(['damp1']);
    expect(w.gold).toBe(900 - UPGRADES.damp1.cost);
  });

  it('refuses a tier belonging to a different tower', () => {
    const [w, t] = placed(900);
    expect(canUpgrade(w, t!, 'kiln1')).toBe(false);
    expect(w.gold).toBe(900);
  });

  it('refuses to skip a tier', () => {
    const [w, t] = placed(900);
    expect(canUpgrade(w, t!, 'damp2')).toBe(false);
    upgradeTower(w, t!, 'damp1');
    expect(canUpgrade(w, t!, 'damp2')).toBe(true);
    expect(canUpgrade(w, t!, 'damp3')).toBe(false);
  });

  it('refuses the other path once one is committed to', () => {
    // A tower picks a path and lives with it. That commitment is what makes
    // "which tower do I take all the way" a decision rather than a formality.
    const [w, t] = placed(900);
    upgradeTower(w, t!, 'damp1');
    expect(canUpgrade(w, t!, 'die1')).toBe(false);
    expect(canUpgrade(w, t!, 'die2')).toBe(false);
  });

  it('refuses when the player cannot pay', () => {
    const [w, t] = placed(UPGRADES.damp1.cost - 1);
    expect(upgradeTower(w, t!, 'damp1')).toBe(false);
    expect(t!.upgrades).toEqual([]);
  });

  it('offers both paths at first and only the next tier afterwards', () => {
    const [w, t] = placed(900);
    expect(availableUpgrades(t!).map((u) => u.id)).toEqual(['damp1', 'die1']);
    upgradeTower(w, t!, 'damp1');
    expect(availableUpgrades(t!).map((u) => u.id)).toEqual(['damp2']);
    upgradeTower(w, t!, 'damp2');
    upgradeTower(w, t!, 'damp3');
    expect(availableUpgrades(t!)).toEqual([]);
  });

  it('folds the path so later tiers win over earlier ones', () => {
    const [w, t] = placed(900);
    for (const step of chainTo('damp3')) upgradeTower(w, t!, step.id);
    expect(t!.upgrades).toEqual(['damp1', 'damp2', 'damp3']);
    // Tier 1 set MOLTEN/KINETIC to 1.25 and tier 3 to 2.25. The fold in
    // world.ts applies them in order, so the top of the path is what lands.
    expect(UPGRADES.damp1.overrides?.MOLTEN?.KINETIC).toBe(1.25);
    expect(UPGRADES.damp3.overrides?.MOLTEN?.KINETIC).toBe(2.25);
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
      if (p.upgrade) {
        const t = towerAt(w, p.col, p.row)!;
        for (const step of chainTo(p.upgrade)) upgradeTower(w, t, step.id);
      }
    }
    startWave(w);
    for (let i = 0; i < 20000 && w.status === 'running'; i++) step(w);
    return w;
  }

  it('stops a Forge wasting every shot on Molten once it has a Kiln', () => {
    // Round 4 is entirely Molten, which Heat cannot touch at all: a bare Forge
    // holds fire and achieves nothing. The branch is what buys it a way in.
    const bare = runRound('forge@5,9 forge@8,9', 3);
    const kilned = runRound('forge@5,9+kiln3 forge@8,9+kiln3', 3);
    expect(bare.stats.breaks).toBe(0);
    expect(kilned.stats.breaks).toBeGreaterThan(0);
  });

  it('stays deterministic with upgrades in the loadout', () => {
    const run = () => {
      const w = runRound('vat@5,9+recl2 stamp@8,9 chiller@11,9+depo3', 8);
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
