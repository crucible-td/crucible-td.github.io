import { describe, expect, it } from 'vitest';
import { MAX_CHILL, RIDERS, perTick } from '../src/sim/riders.ts';
import type { Rider } from '../src/sim/riders.ts';
import { ELEMENT_IDS, STATES } from '../src/sim/types.ts';
import type { State } from '../src/sim/types.ts';
import { applyElement, createWorld, spawnCharge, step } from '../src/sim/world.ts';
import type { World } from '../src/sim/world.ts';

/**
 * Riders: the lingering half of a hit.
 *
 * The rule these all defend is one sentence -- *every element carries exactly
 * one rider, and its magnitude is scaled by the same resistance cell that
 * scales its damage*. Almost everything below is a consequence of that rather
 * than a rule of its own, which is the point: a slowing Chiller that ignores
 * Crystal needs no code saying so, because the table already says Cold does
 * nothing to Crystal.
 *
 * The exceptions -- the ones that are genuinely decisions, and are therefore
 * the ones that can rot -- are the caps and the carry-over. Each has a test
 * named after the degenerate build it exists to prevent.
 */

function world(): World {
  return createWorld(1);
}

function seed(w: World, state: State, dist = 0, scale = 1) {
  return spawnCharge(w, state, dist, scale);
}

/**
 * The dials, read rather than restated.
 *
 * These four numbers are balance, and balance moves. A test that hardcodes
 * 0.22 fails the next time someone tunes the Chiller, which trains people to
 * edit tests until they go green -- exactly the habit that lets a real
 * regression through. What must not move is the *shape*: that chill scales
 * with the table, that shove is divided by toughness. That is what is asserted.
 */
const CHILL = RIDERS.COLD as Extract<Rider, { kind: 'chill' }>;
const IGNITE = RIDERS.HEAT as Extract<Rider, { kind: 'ignite' }>;
const SHOVE = RIDERS.KINETIC as Extract<Rider, { kind: 'shove' }>;

describe('the rider rule', () => {
  it('gives every element exactly one rider', () => {
    // The mirror of "every element has exactly one wall". An element with two
    // riders, or none, is an element whose identity has stopped being legible.
    expect(Object.keys(RIDERS).sort()).toEqual([...ELEMENT_IDS].sort());
    const kinds = ELEMENT_IDS.map((e) => RIDERS[e].kind);
    expect(new Set(kinds).size).toBe(ELEMENT_IDS.length);
  });

  it('scales the rider by the same table cell that scales the damage', () => {
    // The headline property. Molten takes Cold at x2.0 and Ore at x0.5, so
    // Molten is slowed four times as hard -- from the table, not from a list.
    const w = world();
    const molten = seed(w, 'MOLTEN');
    const ore = seed(w, 'ORE');
    applyElement(w, molten, 'COLD', 1);
    applyElement(w, ore, 'COLD', 1);

    expect(molten.chillFactor).toBeCloseTo(CHILL.factor * 2.0, 5);
    expect(ore.chillFactor).toBeCloseTo(CHILL.factor * 0.5, 5);
    expect(molten.chillFactor).toBeGreaterThan(ore.chillFactor);
  });

  it('applies no rider where the element is immune', () => {
    // "At least some monsters walk slow" comes from here. Cold does nothing to
    // Crystal, so a Chiller neither damages nor slows it -- and `findTarget`
    // will not even fire at it.
    const w = world();
    const crystal = seed(w, 'CRYSTAL');
    const before = crystal.hp;
    applyElement(w, crystal, 'COLD', 20);

    expect(crystal.hp).toBe(before);
    expect(crystal.chillTicks).toBe(0);
    expect(crystal.chillFactor).toBe(0);
    expect(w.stats.wasted).toBe(1);
  });

  it('moves the rider when an upgrade rewrites the cell, with no rider data touched', () => {
    // depo3 -- Absolute Zero -- lifts Crystal's immunity to Cold to x1.75. The
    // Chiller therefore *starts slowing Crystal*, and nothing in riders.ts
    // knows that happened. This emergent reach is most of the depth in the
    // feature and it is free, so it is worth a test that would notice it
    // quietly being special-cased back out.
    const w = world();
    const bare = seed(w, 'CRYSTAL');
    const chilled = seed(w, 'CRYSTAL');

    applyElement(w, bare, 'COLD', 4);
    applyElement(w, chilled, 'COLD', 4, { CRYSTAL: { COLD: 1.75 } });

    expect(bare.chillFactor).toBe(0);
    expect(chilled.chillFactor).toBeCloseTo(CHILL.factor * 1.75, 5);
  });
});

describe('chill', () => {
  it('drives speedMult, so a chilled charge actually walks slower', () => {
    const w = world();
    const slowed = seed(w, 'MOLTEN', 100);
    const free = seed(w, 'MOLTEN', 100);
    applyElement(w, slowed, 'COLD', 1);

    step(w);

    expect(slowed.speedMult).toBeCloseTo(1 - CHILL.factor * 2.0, 5);
    expect(free.speedMult).toBe(1);
    expect(slowed.dist).toBeLessThan(free.dist);
  });

  it('refreshes rather than stacks, so massing Chillers cannot freeze the lane', () => {
    // Ten Chillers should buy coverage and rate, never a charge standing still.
    const w = world();
    const c = seed(w, 'MOLTEN');
    for (let i = 0; i < 10; i++) applyElement(w, c, 'COLD', 1);
    expect(c.chillFactor).toBeCloseTo(CHILL.factor * 2.0, 5);
  });

  it('keeps the stronger chill when a weaker one lands on top of it', () => {
    const w = world();
    const c = seed(w, 'MOLTEN');
    applyElement(w, c, 'COLD', 1);
    const strong = c.chillFactor;
    // A Chiller whose upgrade path made it *worse* against Molten must not
    // undo a full-strength chill already on the target.
    applyElement(w, c, 'COLD', 1, { MOLTEN: { COLD: 0.25 } });
    expect(c.chillFactor).toBeCloseTo(strong, 5);
  });

  it('caps however good the table gets, so the lane is never frozen solid', () => {
    const w = world();
    const c = seed(w, 'MOLTEN');
    // Padded, because a x20 cell would otherwise break the layer outright and
    // a broken layer is never chilled -- that ordering is deliberate too.
    c.hp = 9999;
    applyElement(w, c, 'COLD', 1, { MOLTEN: { COLD: 20 } });
    expect(c.chillFactor).toBe(MAX_CHILL);
    step(w);
    expect(c.speedMult).toBeCloseTo(1 - MAX_CHILL, 5);
    expect(c.speedMult).toBeGreaterThan(0);
  });

  it('wears off, and hands speedMult back', () => {
    const w = world();
    const c = seed(w, 'MOLTEN');
    applyElement(w, c, 'COLD', 1);
    for (let i = 0; i < CHILL.ticks + 1; i++) step(w);
    expect(c.chillTicks).toBe(0);
    expect(c.chillFactor).toBe(0);
    expect(c.speedMult).toBe(1);
  });
});

describe('ignite and corrode', () => {
  it('burns for damage over time after the shot has landed', () => {
    const w = world();
    const c = seed(w, 'ORE');
    applyElement(w, c, 'HEAT', 1);
    const afterHit = c.hp;

    step(w);

    // One tick of Heat's dps at Ore's x2.0.
    expect(afterHit - c.hp).toBeCloseTo(perTick(IGNITE.dps) * 2.0, 5);
  });

  it('pays the bounty when a rider finishes a layer, exactly like a shot would', () => {
    // Damage-over-time does not bypass `breakLayer`, so a burn that kills is
    // still income and still emits its events.
    const w = world();
    const c = seed(w, 'ORE');
    applyElement(w, c, 'HEAT', 1);
    c.hp = 0.001;
    const gold = w.gold;

    step(w);

    expect(c.alive).toBe(false);
    expect(w.gold).toBe(gold + STATES.ORE.bounty);
    expect(w.stats.breaks).toBe(1);
  });

  it('does not refresh itself: a burn ends instead of burning forever', () => {
    // The trap this design had to avoid. If a tick of burn re-entered the
    // resistance table it would re-apply Heat's rider and reset its own timer.
    const w = world();
    const c = seed(w, 'SLAG');
    c.hp = 9999;
    applyElement(w, c, 'HEAT', 1);
    for (let i = 0; i < IGNITE.ticks + 5; i++) step(w);
    expect(c.burnTicks).toBe(0);
  });

  it('lets burn die with the layer, because it was applied to a shell now gone', () => {
    const w = world();
    const c = seed(w, 'ORE');
    applyElement(w, c, 'HEAT', 1);
    expect(c.burnTicks).toBeGreaterThan(0);
    applyElement(w, c, 'KINETIC', 999);

    const slag = w.charges.find((x) => x.state === 'SLAG' && x.alive)!;
    expect(slag).toBeDefined();
    expect(slag.burnTicks).toBe(0);
  });

  it('carries corrosion onto both cores that climb out of a Crystal', () => {
    // The Vat's payoff for depth, and the only rider that knows the layer
    // system exists. Reached here through recl3's override, which is the only
    // thing in the game that lets Solvent touch Crystal at all.
    const w = world();
    const c = seed(w, 'CRYSTAL');
    applyElement(w, c, 'SOLVENT', 1, { CRYSTAL: { SOLVENT: 0.6 } });
    expect(c.corrodeTicks).toBeGreaterThan(0);
    const carried = c.corrodeDamage;

    applyElement(w, c, 'KINETIC', 999);

    const cores = w.charges.filter((x) => x.state === 'MOLTEN' && x.alive);
    expect(cores).toHaveLength(2);
    for (const core of cores) {
      expect(core.corrodeTicks).toBeGreaterThan(0);
      expect(core.corrodeDamage).toBeCloseTo(carried, 5);
    }
  });

  it('terminates: corrosion cascading through a stack is still bounded', () => {
    // Same guarantee splash has. The layer chain only ever runs inward, so one
    // Crystal is at most five entities however it is taken apart.
    const w = world();
    const c = seed(w, 'CRYSTAL');
    applyElement(w, c, 'SOLVENT', 1, { CRYSTAL: { SOLVENT: 0.6 } });
    c.hp = 0.001;

    const idBefore = w.nextId;
    for (let i = 0; i < 4000; i++) step(w);

    expect(w.charges.length).toBe(0);
    // Shell, two cores, two remnants: four ids issued after the shell itself.
    expect(w.nextId - idBefore).toBeLessThanOrEqual(4);
  });
});

describe('shove', () => {
  it('pushes a charge back down the lane', () => {
    const w = world();
    const c = seed(w, 'ORE', 200);
    applyElement(w, c, 'KINETIC', 1);
    // One shove at Ore's x1.5.
    expect(c.dist).toBeCloseTo(200 - SHOVE.pixels * 1.5, 5);
  });

  it('cannot be chained, however many Stamps have the target in range', () => {
    // The guard that keeps Kinetic about position and Cold about throughput.
    // Without it, a bank of Stamps is a stall-lock and the two riders collapse
    // into the same effect.
    const w = world();
    const c = seed(w, 'ORE', 200);
    applyElement(w, c, 'KINETIC', 1);
    const once = c.dist;
    for (let i = 0; i < 8; i++) applyElement(w, c, 'KINETIC', 1);
    expect(c.dist).toBeCloseTo(once, 5);
    expect(c.shoveCd).toBeGreaterThan(0);
  });

  it('shoves again once that charge has come off its own cooldown', () => {
    const w = world();
    const c = seed(w, 'ORE', 400);
    applyElement(w, c, 'KINETIC', 1);
    const once = c.dist;
    for (let i = 0; i < SHOVE.cooldown + 1; i++) step(w);
    const drifted = c.dist;
    applyElement(w, c, 'KINETIC', 1);
    expect(c.dist).toBeLessThan(drifted);
    expect(once).toBeLessThan(400);
  });

  it('barely moves a slab, because heavy things do not fly backwards', () => {
    // A boss that can be pushed around is a boss that never arrives, and
    // toughness is the dial every late round is built out of.
    const w = world();
    const light = seed(w, 'ORE', 300, 1);
    const slab = seed(w, 'ORE', 300, 16);
    applyElement(w, light, 'KINETIC', 1);
    applyElement(w, slab, 'KINETIC', 1);

    expect(300 - slab.dist).toBeCloseTo((300 - light.dist) / 4, 5);
  });

  it('never shoves a charge back past the start of the lane', () => {
    const w = world();
    const c = seed(w, 'ORE', 3);
    applyElement(w, c, 'KINETIC', 1);
    expect(c.dist).toBe(0);
  });

  it('does not shove what Kinetic cannot touch', () => {
    const w = world();
    const c = seed(w, 'VAPOR', 200);
    applyElement(w, c, 'KINETIC', 1);
    expect(c.dist).toBe(200);
  });
});
