import type { ResistanceOverrides } from './resistance.ts';
import type { TowerId, UpgradeId } from './types.ts';

/**
 * Upgrade paths, as flat data -- the same shape as `towers.ts`.
 *
 * Each tower has two paths of three tiers, and taking one path rules out the
 * other. The interesting tiers rewrite a cell of the resistance table, and the
 * most interesting rewrite a **zero**: an immunity is the hardest wall in the
 * game, so lifting one is the strongest thing a player can buy and the
 * clearest way a build covers a gap it was not designed for. More ways to
 * answer a layer is more builds that work, which is what this game is judged
 * on.
 *
 * Tier 3 is where a path commits. It is priced so that a run reaches perhaps
 * two or three of them, which makes "which tower do I take all the way" the
 * central late-game decision rather than a formality.
 *
 * A path is opt-in and paid for, which makes it the safest home for a rule
 * change that would be too strong applied to everyone.
 */
export interface UpgradeDef {
  id: UpgradeId;
  towerId: TowerId;
  /** Which of the tower's two paths. Unique within a tower. */
  path: string;
  tier: 1 | 2 | 3;
  name: string;
  cost: number;
  blurb: string;
  /** Resistance cells this tier rewrites. Later tiers win over earlier ones. */
  overrides?: ResistanceOverrides;
  /** Numeric tweaks to the tower's own stats. Later tiers win. */
  stats?: { damage?: number; range?: number; cooldown?: number; splash?: number };
}

export const UPGRADES: Record<UpgradeId, UpgradeDef> = {
  // -- Forge: Kiln lifts Heat's wall against Molten -------------------------
  kiln1: {
    id: 'kiln1', towerId: 'forge', path: 'kiln', tier: 1,
    name: 'Kiln Lining', cost: 55,
    blurb: 'Heat stops doing nothing to Molten. Barely, but it is a start.',
    overrides: { MOLTEN: { HEAT: 0.5 } },
  },
  kiln2: {
    id: 'kiln2', towerId: 'forge', path: 'kiln', tier: 2,
    name: 'Reverberatory Kiln', cost: 110,
    blurb: 'A real bite on Molten now, and a hotter throw.',
    overrides: { MOLTEN: { HEAT: 0.9 } }, stats: { damage: 6 },
  },
  kiln3: {
    id: 'kiln3', towerId: 'forge', path: 'kiln', tier: 3,
    name: 'Blast Furnace', cost: 230,
    blurb: 'Molten is no longer a wall to Heat at all. It is a target.',
    overrides: { MOLTEN: { HEAT: 1.4 } }, stats: { damage: 9, cooldown: 26 },
  },
  bellows1: {
    id: 'bellows1', towerId: 'forge', path: 'bellows', tier: 1,
    name: 'Bellows', cost: 45,
    blurb: 'Fires half again as often.',
    stats: { cooldown: 22 },
  },
  bellows2: {
    id: 'bellows2', towerId: 'forge', path: 'bellows', tier: 2,
    name: 'Double Bellows', cost: 95,
    blurb: 'Faster still, and each throw lands heavier.',
    stats: { cooldown: 17, damage: 6 },
  },
  bellows3: {
    id: 'bellows3', towerId: 'forge', path: 'bellows', tier: 3,
    name: 'Forced Draught', cost: 200,
    blurb: 'A continuous roar. Nothing in the game clears Ore faster.',
    stats: { cooldown: 11, damage: 8 },
  },

  // -- Chiller: Deposition lifts Cold's wall against Crystal ----------------
  depo1: {
    id: 'depo1', towerId: 'chiller', path: 'depo', tier: 1,
    name: 'Deposition Coil', cost: 70,
    blurb: 'Cold stops sliding off Crystal.',
    overrides: { CRYSTAL: { COLD: 0.5 } },
  },
  depo2: {
    id: 'depo2', towerId: 'chiller', path: 'depo', tier: 2,
    name: 'Frost Lattice', cost: 130,
    blurb: 'Crystal cracks under cold about as well as anything else.',
    overrides: { CRYSTAL: { COLD: 1.0 } }, stats: { damage: 8 },
  },
  depo3: {
    id: 'depo3', towerId: 'chiller', path: 'depo', tier: 3,
    name: 'Absolute Zero', cost: 245,
    blurb: 'Cold answers every layer in the game, and Crystal worst of all.',
    overrides: { CRYSTAL: { COLD: 1.75 } }, stats: { damage: 11 },
  },
  super1: {
    id: 'super1', towerId: 'chiller', path: 'super', tier: 1,
    name: 'Supercooled Jets', cost: 55,
    blurb: 'Longer reach, so one Chiller covers two stretches of lane.',
    stats: { range: 132 },
  },
  super2: {
    id: 'super2', towerId: 'chiller', path: 'super', tier: 2,
    name: 'Cryo Cannon', cost: 105,
    blurb: 'Further again, and colder.',
    stats: { range: 152, damage: 8 },
  },
  super3: {
    id: 'super3', towerId: 'chiller', path: 'super', tier: 3,
    name: 'Glacier', cost: 205,
    blurb: 'Covers a quarter of the lane on its own.',
    stats: { range: 185, damage: 11, cooldown: 40 },
  },

  // -- Stamp: Dampened trades the Crystal specialism for general weight -----
  damp1: {
    id: 'damp1', towerId: 'stamp', path: 'damp', tier: 1,
    name: 'Dampened Press', cost: 60,
    blurb: 'Heavy enough to stop glancing off Molten.',
    overrides: { MOLTEN: { KINETIC: 1.25 } },
  },
  damp2: {
    id: 'damp2', towerId: 'stamp', path: 'damp', tier: 2,
    name: 'Drop Hammer', cost: 120,
    blurb: 'Molten is now a good target rather than a poor one.',
    overrides: { MOLTEN: { KINETIC: 1.75 } }, stats: { damage: 12 },
  },
  damp3: {
    id: 'damp3', towerId: 'stamp', path: 'damp', tier: 3,
    name: 'Pile Driver', cost: 235,
    blurb: 'Crushes anything it can reach. Vapor still floats over it.',
    overrides: { MOLTEN: { KINETIC: 2.25 }, ORE: { KINETIC: 1.75 } },
    stats: { damage: 16 },
  },
  die1: {
    id: 'die1', towerId: 'stamp', path: 'die', tier: 1,
    name: 'Wide Die', cost: 50,
    blurb: 'Wider reach. Still ground-only, so Vapor still floats past.',
    stats: { range: 104 },
  },
  die2: {
    id: 'die2', towerId: 'stamp', path: 'die', tier: 2,
    name: 'Shatter Die', cost: 110,
    blurb: 'Shaped to split Crystal along its faults.',
    overrides: { CRYSTAL: { KINETIC: 2.75 } }, stats: { range: 116, damage: 12 },
  },
  die3: {
    id: 'die3', towerId: 'stamp', path: 'die', tier: 3,
    name: 'Fracture Press', cost: 220,
    blurb: 'Crystal simply comes apart. Nothing else shatters like it.',
    overrides: { CRYSTAL: { KINETIC: 3.5 } }, stats: { range: 130, damage: 17 },
  },

  // -- Vat: Reclaimer ends with Solvent's own wall lifted -------------------
  recl1: {
    id: 'recl1', towerId: 'vat', path: 'recl', tier: 1,
    name: 'Reclaimer', cost: 60,
    blurb: 'Solvent tears through Vapor faster.',
    overrides: { VAPOR: { SOLVENT: 2.5 } },
  },
  recl2: {
    id: 'recl2', towerId: 'vat', path: 'recl', tier: 2,
    name: 'Scrubber Tower', cost: 115,
    blurb: 'A dedicated answer to a gas round.',
    overrides: { VAPOR: { SOLVENT: 3.25 } }, stats: { damage: 7 },
  },
  recl3: {
    id: 'recl3', towerId: 'vat', path: 'recl', tier: 3,
    name: 'Universal Solvent', cost: 250,
    blurb: 'Even Crystal dissolves now. Slowly, but it dissolves.',
    // Lifts Solvent's own wall -- the Vat's whole limitation, undone at a
    // price, and only at the very top of the path.
    overrides: { VAPOR: { SOLVENT: 4.0 }, CRYSTAL: { SOLVENT: 0.6 } },
    stats: { damage: 9 },
  },
  cat1: {
    id: 'cat1', towerId: 'vat', path: 'cat', tier: 1,
    name: 'Catalyst Bath', cost: 55,
    blurb: 'Eats Slag remnants before they scatter.',
    overrides: { SLAG: { SOLVENT: 1.75 } },
  },
  cat2: {
    id: 'cat2', towerId: 'vat', path: 'cat', tier: 2,
    name: 'Wide Bath', cost: 100,
    blurb: 'A broader splash, and harder on the softer layers.',
    overrides: { SLAG: { SOLVENT: 2.5 }, ORE: { SOLVENT: 1.4 } },
    stats: { splash: 48 },
  },
  cat3: {
    id: 'cat3', towerId: 'vat', path: 'cat', tier: 3,
    name: 'Flood Tank', cost: 210,
    blurb: 'Drowns a whole stretch of lane in one slow wash.',
    overrides: { SLAG: { SOLVENT: 3.0 }, ORE: { SOLVENT: 1.8 } },
    stats: { splash: 64, damage: 8 },
  },

  // -- Lens: Focus is raw power, Prism is spread ----------------------------
  focus1: {
    id: 'focus1', towerId: 'lens', path: 'focus', tier: 1,
    name: 'Focusing Array', cost: 70,
    blurb: 'A markedly heavier beam, at the same slow cadence.',
    stats: { damage: 20 },
  },
  focus2: {
    id: 'focus2', towerId: 'lens', path: 'focus', tier: 2,
    name: 'Collimator', cost: 135,
    blurb: 'Heavier and a little quicker.',
    stats: { damage: 28, cooldown: 66 },
  },
  focus3: {
    id: 'focus3', towerId: 'lens', path: 'focus', tier: 3,
    name: 'Solar Lance', cost: 255,
    blurb: 'One shot removes most things outright, from anywhere on the map.',
    stats: { damage: 44, cooldown: 58 },
  },
  prism1: {
    id: 'prism1', towerId: 'lens', path: 'prism', tier: 1,
    name: 'Prism', cost: 65,
    blurb: 'Splits the beam: better against Ore.',
    overrides: { ORE: { HEAT: 2.0 } },
  },
  prism2: {
    id: 'prism2', towerId: 'lens', path: 'prism', tier: 2,
    name: 'Spectrometer', cost: 120,
    blurb: 'Finds a weakness in Crystal as well.',
    overrides: { ORE: { HEAT: 2.5 }, CRYSTAL: { HEAT: 1.75 } },
    stats: { damage: 18 },
  },
  prism3: {
    id: 'prism3', towerId: 'lens', path: 'prism', tier: 3,
    name: 'Full Spectrum', cost: 240,
    blurb: 'Every layer has a wavelength that hurts it, including Vapor.',
    overrides: { ORE: { HEAT: 3.0 }, CRYSTAL: { HEAT: 2.5 }, VAPOR: { HEAT: 1.5 } },
    stats: { damage: 24 },
  },
};

export const UPGRADE_IDS: UpgradeId[] = Object.keys(UPGRADES) as UpgradeId[];

/** Every branch belonging to a tower, in menu order. */
export function upgradesFor(towerId: TowerId): UpgradeDef[] {
  return UPGRADE_IDS.map((id) => UPGRADES[id]).filter((u) => u.towerId === towerId);
}

/** The two path names a tower offers, in menu order. */
export function pathsFor(towerId: TowerId): string[] {
  return [...new Set(upgradesFor(towerId).map((u) => u.path))];
}

/** One path's tiers, lowest first. */
export function tiersOf(towerId: TowerId, path: string): UpgradeDef[] {
  return upgradesFor(towerId)
    .filter((u) => u.path === path)
    .sort((a, b) => a.tier - b.tier);
}

/**
 * Everything that must be bought to own `id`, lowest tier first.
 *
 * Naming a tier-3 upgrade in a loadout means "climb this path", which keeps
 * the loadout grammar about intent rather than bookkeeping.
 */
export function chainTo(id: UpgradeId): UpgradeDef[] {
  const target = UPGRADES[id];
  return tiersOf(target.towerId, target.path).filter((u) => u.tier <= target.tier);
}

export function chainCost(id: UpgradeId): number {
  return chainTo(id).reduce((n, u) => n + u.cost, 0);
}
