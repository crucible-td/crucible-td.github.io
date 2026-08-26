import { describe, expect, it } from 'vitest';
import { describePlacement, parseLoadout } from '../src/sim/loadout.ts';
import { chainTo } from '../src/sim/upgrades.ts';

/**
 * The grammar both harnesses read.
 *
 * Every balance number in this project comes from a string parsed here. A
 * loadout that parses into something other than what was written would not
 * fail loudly -- it would measure a different game and report a confident
 * figure for it. None of these rejections had a test.
 */
describe('parsing a loadout', () => {
  it('reads a bare placement', () => {
    expect(parseLoadout('forge@5,4')).toEqual([{ def: 'forge', col: 5, row: 4 }]);
  });

  it('reads a placement with an upgrade', () => {
    expect(parseLoadout('stamp@11,9+damp3')).toEqual([
      { def: 'stamp', col: 11, row: 9, upgrade: 'damp3' },
    ]);
  });

  it('accepts spaces, newlines and semicolons between entries', () => {
    expect(parseLoadout('forge@1,1; chiller@2,2\n stamp@3,3')).toHaveLength(3);
  });

  it('treats an empty string as an empty loadout rather than an error', () => {
    expect(parseLoadout('')).toEqual([]);
    expect(parseLoadout('   ')).toEqual([]);
  });

  it('rejects malformed syntax', () => {
    expect(() => parseLoadout('forge')).toThrow(/bad loadout entry/);
    expect(() => parseLoadout('forge@5')).toThrow(/bad loadout entry/);
    expect(() => parseLoadout('forge:5,4')).toThrow(/bad loadout entry/);
  });

  it('rejects a tower that does not exist, and says which ones do', () => {
    expect(() => parseLoadout('trebuchet@5,4')).toThrow(/unknown tower/);
    expect(() => parseLoadout('trebuchet@5,4')).toThrow(/forge/);
  });

  it('rejects an upgrade that does not exist, and lists that tower branches', () => {
    expect(() => parseLoadout('forge@5,4+turbo')).toThrow(/unknown upgrade/);
    expect(() => parseLoadout('forge@5,4+turbo')).toThrow(/kiln1/);
  });

  it('rejects an upgrade belonging to a different tower', () => {
    // The subtle one: 'kiln1' is real, just not a Stamp's. Without this check
    // the harness would silently measure a tower that cannot exist.
    expect(() => parseLoadout('stamp@5,4+kiln1')).toThrow(/belongs to forge/);
  });
});

describe('describing a placement', () => {
  it('round-trips through the parser', () => {
    for (const entry of ['forge@5,4', 'stamp@11,9+damp3', 'lens@18,3+prism2']) {
      expect(describePlacement(parseLoadout(entry)[0]!)).toBe(entry);
    }
  });
});

describe('naming a tier means climbing to it', () => {
  it('expands a tier-3 target into the whole path', () => {
    // Both harnesses depend on this: the plan says where you are going and the
    // chain is what actually gets bought.
    const p = parseLoadout('forge@5,4+kiln3')[0]!;
    expect(chainTo(p.upgrade!).map((u) => u.id)).toEqual(['kiln1', 'kiln2', 'kiln3']);
  });

  it('leaves a tier-1 target as a single purchase', () => {
    const p = parseLoadout('forge@5,4+kiln1')[0]!;
    expect(chainTo(p.upgrade!).map((u) => u.id)).toEqual(['kiln1']);
  });
});
