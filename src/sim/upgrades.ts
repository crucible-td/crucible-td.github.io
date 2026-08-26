import type { ResistanceOverrides } from './resistance.ts';
import type { TowerId, UpgradeId } from './types.ts';

/**
 * Upgrade branches, as flat data -- the same shape as `towers.ts`.
 *
 * Each tower has exactly two, and taking one rules out the other. The
 * interesting ones rewrite a cell of the resistance table, and the most
 * interesting of those rewrite a **zero**: an immunity is the hardest wall in
 * the game, so a branch that partly lifts one is the strongest thing a player
 * can buy, and the clearest way a build can cover a gap it was not designed
 * for. That is the point -- more ways to answer a layer is more builds that
 * work.
 *
 * A branch is opt-in and paid for, which makes it the safest home for a rule
 * change that would be too strong applied to everyone.
 */
export interface UpgradeDef {
  id: UpgradeId;
  towerId: TowerId;
  name: string;
  cost: number;
  blurb: string;
  /** Resistance cells this branch rewrites. Absent for the numeric branches. */
  overrides?: ResistanceOverrides;
  /** Numeric tweaks to the tower's own stats. */
  stats?: { damage?: number; range?: number; cooldown?: number; splash?: number };
}

export const UPGRADES: Record<UpgradeId, UpgradeDef> = {
  // -- Forge ----------------------------------------------------------------
  kiln: {
    id: 'kiln',
    towerId: 'forge',
    name: 'Kiln',
    cost: 60,
    blurb: 'Heat finally bites on Molten -- weakly, but it is no longer nothing.',
    overrides: { MOLTEN: { HEAT: 0.75 } },
  },
  bellows: {
    id: 'bellows',
    towerId: 'forge',
    name: 'Bellows',
    cost: 45,
    blurb: 'Fires half again as often.',
    stats: { cooldown: 20 },
  },

  // -- Chiller --------------------------------------------------------------
  deposition: {
    id: 'deposition',
    towerId: 'chiller',
    name: 'Deposition Coil',
    cost: 75,
    blurb: 'Cold stops sliding off Crystal and starts cracking it.',
    overrides: { CRYSTAL: { COLD: 1.0 } },
  },
  supercooled: {
    id: 'supercooled',
    towerId: 'chiller',
    name: 'Supercooled Jets',
    cost: 55,
    blurb: 'Longer reach, so one Chiller covers two stretches of lane.',
    stats: { range: 145 },
  },

  // -- Stamp ----------------------------------------------------------------
  dampened: {
    id: 'dampened',
    towerId: 'stamp',
    name: 'Dampened Press',
    cost: 70,
    blurb: 'Heavy enough to crush Molten rather than glance off it.',
    overrides: { MOLTEN: { KINETIC: 1.75 } },
  },
  wideDie: {
    id: 'wideDie',
    towerId: 'stamp',
    name: 'Wide Die',
    cost: 50,
    blurb: 'Wider reach. Still ground-only, so Vapor still floats past.',
    stats: { range: 104 },
  },

  // -- Vat ------------------------------------------------------------------
  reclaimer: {
    id: 'reclaimer',
    towerId: 'vat',
    name: 'Reclaimer',
    cost: 65,
    blurb: 'Solvent tears through Vapor. The dedicated answer to a gas round.',
    overrides: { VAPOR: { SOLVENT: 3.0 } },
  },
  catalyst: {
    id: 'catalyst',
    towerId: 'vat',
    name: 'Catalyst Bath',
    cost: 60,
    blurb: 'Eats Slag remnants before they scatter.',
    overrides: { SLAG: { SOLVENT: 2.5 } },
  },

  // -- Lens -----------------------------------------------------------------
  focus: {
    id: 'focus',
    towerId: 'lens',
    name: 'Focusing Array',
    cost: 80,
    blurb: 'A markedly heavier beam, at the same slow cadence.',
    stats: { damage: 22 },
  },
  prism: {
    id: 'prism',
    towerId: 'lens',
    name: 'Prism',
    cost: 85,
    blurb: 'Splits the beam across the spectrum: far better on Ore and Crystal.',
    overrides: { ORE: { HEAT: 2.5 }, CRYSTAL: { HEAT: 2.0 } },
  },
};

export const UPGRADE_IDS: UpgradeId[] = [
  'kiln',
  'bellows',
  'deposition',
  'supercooled',
  'dampened',
  'wideDie',
  'reclaimer',
  'catalyst',
  'focus',
  'prism',
];

/** The two branches available to a tower, in menu order. */
export function upgradesFor(towerId: TowerId): UpgradeDef[] {
  return UPGRADE_IDS.map((id) => UPGRADES[id]).filter((u) => u.towerId === towerId);
}
