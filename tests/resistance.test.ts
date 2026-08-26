import { describe, expect, it } from 'vitest';
import { RESISTANCE, isImmune, resistanceFor, resolveResistance } from '../src/sim/resistance.ts';
import { ELEMENT_IDS, STATE_IDS } from '../src/sim/types.ts';

/**
 * Every cell of the resistance table is asserted explicitly.
 *
 * The point is not coverage for its own sake: the table IS the game, so a
 * change to any cell must be a deliberate act that also updates a test. An
 * accidental edit -- by a human or by an agent doing a balance pass -- fails
 * here instead of silently changing what the game is.
 */
describe('resistance table', () => {
  it('defines a multiplier for all 20 state/element pairs', () => {
    for (const s of STATE_IDS) {
      for (const e of ELEMENT_IDS) {
        expect(resistanceFor(s, e), `${s} + ${e}`).toBeTypeOf('number');
      }
    }
    expect(STATE_IDS.length * ELEMENT_IDS.length).toBe(20);
  });

  it('ORE: soft to heat, shrugs off cold, open to everything else', () => {
    expect(RESISTANCE.ORE).toEqual({ HEAT: 1.5, COLD: 0.5, KINETIC: 1.25, SOLVENT: 1.0 });
  });

  it('SLAG: the layer under everything, brittle to a solid hit', () => {
    expect(RESISTANCE.SLAG).toEqual({ HEAT: 1.0, COLD: 1.0, KINETIC: 1.5, SOLVENT: 1.25 });
  });

  it('MOLTEN: heat does nothing; chill it or dissolve it', () => {
    expect(RESISTANCE.MOLTEN).toEqual({ HEAT: 0, COLD: 2.0, KINETIC: 0.75, SOLVENT: 1.25 });
  });

  it('CRYSTAL: inert to cold and solvent; shatter it or melt it', () => {
    expect(RESISTANCE.CRYSTAL).toEqual({ HEAT: 1.25, COLD: 0, KINETIC: 2.0, SOLVENT: 0 });
  });

  it('VAPOR: kinetic passes through; dissolve it or chill it', () => {
    expect(RESISTANCE.VAPOR).toEqual({ HEAT: 0.5, COLD: 1.5, KINETIC: 0, SOLVENT: 2.0 });
  });
});

/**
 * These are the structural rules the numbers have to keep obeying. They are
 * what stop the game drifting back to having one right answer, so they are
 * asserted as properties rather than left as intentions in a comment.
 */
describe('the shape the table has to keep', () => {
  it('gives every element exactly one wall', () => {
    // An element that beats everything becomes the answer to everything: the
    // Vat was briefly mandatory in every winning build for precisely this
    // reason, because Solvent had no zero anywhere in its column.
    for (const e of ELEMENT_IDS) {
      const walls = STATE_IDS.filter((s) => RESISTANCE[s][e] <= 0);
      expect(walls, `${e} should be useless against exactly one layer`).toHaveLength(1);
    }
  });

  it('gives every layer at least two real counters', () => {
    // One counter would make that tower mandatory whenever the layer appears.
    for (const s of STATE_IDS) {
      const counters = ELEMENT_IDS.filter((e) => RESISTANCE[s][e] > 1);
      expect(counters.length, `${s} needs more than one answer`).toBeGreaterThanOrEqual(2);
    }
  });

  it('leaves the opening round open to every element', () => {
    // Round 1 is bare Ore. Nothing may be immune to it, or the choice of
    // opening tower stops being a choice.
    for (const e of ELEMENT_IDS) expect(RESISTANCE.ORE[e], `ORE vs ${e}`).toBeGreaterThan(0);
  });
});

describe('resolveResistance', () => {
  it('is exactly the base table when nothing is upgraded', () => {
    for (const s of STATE_IDS) {
      for (const e of ELEMENT_IDS) {
        expect(resolveResistance(s, e)).toBe(RESISTANCE[s][e]);
      }
    }
  });

  it('replaces only the overridden cell', () => {
    const o = { MOLTEN: { HEAT: 0.75 } };
    expect(resolveResistance('MOLTEN', 'HEAT', o)).toBe(0.75);
    expect(resolveResistance('MOLTEN', 'COLD', o)).toBe(RESISTANCE.MOLTEN.COLD);
    expect(resolveResistance('ORE', 'HEAT', o)).toBe(RESISTANCE.ORE.HEAT);
  });

  it('reports immunity, including through an upgrade that lifts one', () => {
    expect(isImmune('MOLTEN', 'HEAT')).toBe(true);
    expect(isImmune('MOLTEN', 'HEAT', { MOLTEN: { HEAT: 0.75 } })).toBe(false);
  });
});
