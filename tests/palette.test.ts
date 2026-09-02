import { describe, expect, it } from 'vitest';
import { ELEMENT_ART, ELEMENT_COLOR } from '../src/render/art.ts';
import { RESISTANCE } from '../src/sim/resistance.ts';
import { TOWERS, TOWER_IDS } from '../src/sim/towers.ts';
import { ELEMENT_IDS, STATES, STATE_IDS } from '../src/sim/types.ts';
import type { Element } from '../src/sim/types.ts';

/**
 * Colour is information here, not decoration, and this file is what stops it
 * drifting back into decoration.
 *
 * The bug it exists for shipped and survived a long time: Molten was drawn in
 * `#ff6b35`, which is Heat's own orange -- and Heat is the one element Molten
 * is completely immune to. Crystal was drawn in Cold's cyan, and Crystal is
 * immune to Cold. Colour is the fastest thing a player reads, faster than the
 * name and far faster than the table, so in both cases the board was teaching
 * the exact opposite of the rule it was built on.
 */

function rgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

/**
 * Plain Euclidean distance in RGB, which is crude but honest about what it is
 * measuring: "would these two read as the same colour at 30px on a dark
 * background". A perceptual space would be more correct and would need a
 * dependency to say the same thing about colours this far apart.
 */
function distance(a: string, b: string): number {
  const [r1, g1, b1] = rgb(a);
  const [r2, g2, b2] = rgb(b);
  return Math.hypot(r1 - r2, g1 - g2, b1 - b2);
}

/**
 * Two thresholds, because the two rules they serve are not equally strong.
 *
 * `MISLEADING` guards the immunity law, and it is strict: a layer wearing the
 * colour of an element that does nothing to it is worse than a layer with no
 * colour at all, so this has to clear the real failures by a margin. They sat
 * at 27 (Molten against Heat) and 61 (Crystal against Cold).
 *
 * `MUDDLED` guards layers against each other and is deliberately looser,
 * because colour is not carrying that job alone -- every layer already has its
 * own silhouette and body plan, which is what `art.ts` exists for. It only has
 * to stop two layers reading as one at a glance.
 *
 * Both caught something on the way in: the first pass of this palette put Lava
 * at 84 from Heat and Ash at 33 from Ore, and the colours moved rather than
 * the numbers.
 */
const MISLEADING = 90;
const MUDDLED = 55;

describe('the colour law', () => {
  it('never paints a layer in the hue of an element it is immune to', () => {
    for (const state of STATE_IDS) {
      for (const element of ELEMENT_IDS) {
        if (RESISTANCE[state][element] > 0) continue;
        const d = distance(STATES[state].color, ELEMENT_COLOR[element]);
        expect(
          d,
          `${STATES[state].label} (${STATES[state].color}) is immune to ` +
            `${element} (${ELEMENT_COLOR[element]}) and is drawn in almost that ` +
            `colour. A player reads the colour before the name.`,
        ).toBeGreaterThan(MISLEADING);
      }
    }
  });

  it('keeps the five layers apart from each other', () => {
    // The law above pushes colours around, and the obvious way to satisfy it
    // is to collide two layers instead. Silhouette carries most of the load,
    // but two layers a shade apart would undo the point of colouring them.
    for (const a of STATE_IDS) {
      for (const b of STATE_IDS) {
        if (a >= b) continue;
        expect(distance(STATES[a].color, STATES[b].color), `${a} vs ${b}`).toBeGreaterThan(
          MUDDLED,
        );
      }
    }
  });

  it('gives a tower the hue of the element it throws', () => {
    // Two towers throw Heat, so this cannot demand equality -- the Burner and
    // the Beam are two lightnesses of one hue on purpose, because same hue is
    // how the board says "same column of the resistance table". What it can
    // demand is that neither of them wanders off it.
    for (const id of TOWER_IDS) {
      const def = TOWERS[id];
      const own = distance(def.color, ELEMENT_COLOR[def.element]);
      for (const other of ELEMENT_IDS) {
        if (other === def.element) continue;
        expect(
          own,
          `${def.name} throws ${def.element} but is closer to ${other}`,
        ).toBeLessThan(distance(def.color, ELEMENT_COLOR[other]));
      }
    }
  });
});

describe('element glyphs', () => {
  it('draws every element', () => {
    // Same contract the tower and monster artwork already has: a missing glyph
    // is not a crash, which is exactly why it needs asserting.
    for (const e of ELEMENT_IDS) {
      expect(ELEMENT_ART[e], e).toBeDefined();
      expect(ELEMENT_ART[e].body.length, e).toBeGreaterThan(10);
    }
  });

  it('gives every element its own mark', () => {
    const bodies = ELEMENT_IDS.map((e: Element) => ELEMENT_ART[e].body);
    expect(new Set(bodies).size).toBe(bodies.length);
  });
});
