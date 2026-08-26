import { beforeAll, describe, expect, it } from 'vitest';
import { MONSTER_ART, TOWER_ART, path, svgMarkup } from '../src/render/art.ts';
import { TOWER_IDS } from '../src/sim/towers.ts';
import { STATE_IDS } from '../src/sim/types.ts';

/**
 * Artwork gets the same treatment the resistance table gets: every tower and
 * every layer must have some, asserted here, so that adding a sixth tower
 * later cannot quietly ship as an invisible one. A missing icon is not a
 * crash, which is exactly why it needs a test.
 */
describe('artwork coverage', () => {
  it('draws every tower', () => {
    for (const id of TOWER_IDS) {
      expect(TOWER_ART[id], id).toBeDefined();
      expect(TOWER_ART[id].body.length, id).toBeGreaterThan(10);
    }
  });

  it('draws every layer as a creature with a face', () => {
    // Eyes are what separate a monster from a shape, and they are cheap enough
    // at this size that there is no reason for a layer to go without.
    for (const s of STATE_IDS) {
      expect(MONSTER_ART[s], s).toBeDefined();
      expect(MONSTER_ART[s].body.length, s).toBeGreaterThan(10);
      expect(MONSTER_ART[s].eyes, `${s} needs a face`).toBeDefined();
    }
  });

  it('gives towers a second colour and monsters none', () => {
    // Towers are machines with a lit part; monsters share one dark tone for
    // teeth and eyes. Keeping that split is what makes the two groups read as
    // different kinds of thing rather than as one set of shapes.
    for (const id of TOWER_IDS) expect(TOWER_ART[id].accentColor, id).toBeDefined();
    for (const s of STATE_IDS) expect(MONSTER_ART[s].accentColor, s).toBeUndefined();
  });

  it('never leaves a tower and a monster sharing a silhouette', () => {
    const all = [...TOWER_IDS.map((t) => TOWER_ART[t].body), ...STATE_IDS.map((s) => MONSTER_ART[s].body)];
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('path cache', () => {
  // Path2D is a browser API and the suite runs in Node. What is under test
  // here is the caching contract -- same data in, same object out -- not
  // anything canvas does with the result, so a stub is enough and avoids
  // pretending this test proves the drawing works. The browser is where that
  // gets checked.
  beforeAll(() => {
    if (typeof globalThis.Path2D === 'undefined') {
      (globalThis as unknown as { Path2D: unknown }).Path2D = class {
        constructor(readonly d: string) {}
      };
    }
  });

  it('returns the same Path2D for the same data', () => {
    // Rebuilding these per charge per frame is the difference between a smooth
    // board and a stuttering one at 3x speed with a full lane.
    const d = TOWER_ART.forge.body;
    expect(path(d)).toBe(path(d));
  });

  it('keeps distinct shapes distinct', () => {
    expect(path(TOWER_ART.forge.body)).not.toBe(path(TOWER_ART.vat.body));
  });
});

describe('svg markup', () => {
  it('renders the body and the accent at the requested size', () => {
    const svg = svgMarkup(TOWER_ART.lens, '#ffd166', 30);
    expect(svg).toContain('width="30"');
    expect(svg).toContain('viewBox="0 0 24 24"');
    expect(svg).toContain(TOWER_ART.lens.body);
    expect(svg).toContain(TOWER_ART.lens.accent!);
  });

  it('uses even-odd fill, because rings and mouths are holes', () => {
    // The Lens is a ring and the Forge has a mouth cut through it. Without
    // even-odd both fill solid and the shapes disappear.
    expect(svgMarkup(TOWER_ART.lens, '#fff', 24)).toContain('fill-rule="evenodd"');
  });
});
