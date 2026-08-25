import { describe, expect, it } from 'vitest';
import { TRANSMUTATION, outcomeFor } from '../src/sim/table.ts';
import { ELEMENT_IDS, STATE_IDS } from '../src/sim/types.ts';

/**
 * Every cell of the transmutation table is asserted explicitly.
 *
 * The point is not coverage for its own sake: the table IS the game, so a
 * change to any cell must be a deliberate act that also updates a test. An
 * accidental edit -- by a human or by an agent doing a balance pass -- fails
 * here instead of silently changing what the game is.
 */
describe('transmutation table', () => {
  it('defines an outcome for all 20 state/element pairs', () => {
    for (const s of STATE_IDS) {
      for (const e of ELEMENT_IDS) {
        expect(outcomeFor(s, e), `${s} + ${e}`).toBeDefined();
      }
    }
    expect(STATE_IDS.length * ELEMENT_IDS.length).toBe(20);
  });

  it('ORE: melts, resists cold, chips slowly, strips to slag', () => {
    expect(TRANSMUTATION.ORE.HEAT).toEqual({ kind: 'transmute', to: 'MOLTEN' });
    expect(TRANSMUTATION.ORE.COLD).toEqual({ kind: 'none' });
    expect(TRANSMUTATION.ORE.KINETIC).toEqual({ kind: 'damage', amount: 1 });
    expect(TRANSMUTATION.ORE.SOLVENT).toEqual({ kind: 'transmute', to: 'SLAG' });
  });

  it('SLAG: the cheap early kill', () => {
    expect(TRANSMUTATION.SLAG.HEAT).toEqual({ kind: 'transmute', to: 'MOLTEN' });
    expect(TRANSMUTATION.SLAG.COLD).toEqual({ kind: 'none' });
    expect(TRANSMUTATION.SLAG.KINETIC).toEqual({ kind: 'destroy', gold: 1 });
    expect(TRANSMUTATION.SLAG.SOLVENT).toEqual({ kind: 'none' });
  });

  it('MOLTEN: heat is a trap, kinetic splits, cold is the answer', () => {
    expect(TRANSMUTATION.MOLTEN.HEAT).toEqual({ kind: 'speed', mult: 1.4 });
    expect(TRANSMUTATION.MOLTEN.COLD).toEqual({ kind: 'transmute', to: 'CRYSTAL' });
    expect(TRANSMUTATION.MOLTEN.KINETIC).toEqual({ kind: 'split', into: 'MOLTEN', count: 3 });
    expect(TRANSMUTATION.MOLTEN.SOLVENT).toEqual({ kind: 'transmute', to: 'VAPOR' });
  });

  it('CRYSTAL: shattering is the payoff, heat undoes your work', () => {
    expect(TRANSMUTATION.CRYSTAL.HEAT).toEqual({ kind: 'transmute', to: 'MOLTEN' });
    expect(TRANSMUTATION.CRYSTAL.COLD).toEqual({ kind: 'none' });
    expect(TRANSMUTATION.CRYSTAL.KINETIC).toEqual({ kind: 'destroy', gold: 6, shatter: true });
    expect(TRANSMUTATION.CRYSTAL.SOLVENT).toEqual({ kind: 'none' });
  });

  it('VAPOR: ignores kinetic, condenses under cold', () => {
    expect(TRANSMUTATION.VAPOR.HEAT).toEqual({ kind: 'speed', mult: 1.8 });
    expect(TRANSMUTATION.VAPOR.COLD).toEqual({ kind: 'transmute', to: 'MOLTEN' });
    expect(TRANSMUTATION.VAPOR.KINETIC).toEqual({ kind: 'none' });
    expect(TRANSMUTATION.VAPOR.SOLVENT).toEqual({ kind: 'damage', amount: 1 });
  });

  it('keeps the intended kill line intact: HEAT -> COLD -> KINETIC', () => {
    const melted = TRANSMUTATION.ORE.HEAT;
    expect(melted).toEqual({ kind: 'transmute', to: 'MOLTEN' });
    const frozen = TRANSMUTATION.MOLTEN.COLD;
    expect(frozen).toEqual({ kind: 'transmute', to: 'CRYSTAL' });
    const shattered = TRANSMUTATION.CRYSTAL.KINETIC;
    expect(shattered.kind).toBe('destroy');
    // The payoff must stay strictly better than a plain kill, or the whole
    // three-tower line is pointless.
    if (shattered.kind === 'destroy') expect(shattered.gold).toBeGreaterThan(1);
  });
});
