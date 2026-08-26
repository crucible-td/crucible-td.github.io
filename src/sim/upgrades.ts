import type { OutcomeOverrides } from './table.ts';
import type { TowerId, UpgradeId } from './types.ts';

/**
 * Upgrade branches, as flat data -- the same shape as `towers.ts`.
 *
 * Each tower has exactly two, and taking one rules out the other. The
 * interesting ones rewrite a cell of the transmutation table, which is the
 * whole point: DESIGN.md asks for upgrades that let the player break an
 * ordering rule at a price, not upgrades that add 8% range. Five of the eight
 * change behaviour and three are numeric, keeping the boring half a minority.
 *
 * Two of these branches were tried during balancing as *global* table rules and
 * reverted for being too strong: deposition flattened the game by making Cold
 * the answer to everything, and reclaimer was a difficulty change nobody had
 * asked for. Priced and opt-in, they are exactly right -- the player buys the
 * rule break, and a player who does not buy it sees the game unchanged.
 */
export interface UpgradeDef {
  id: UpgradeId;
  towerId: TowerId;
  name: string;
  cost: number;
  blurb: string;
  /** Table cells this branch rewrites. Absent for the numeric branches. */
  overrides?: OutcomeOverrides;
  /** Numeric tweaks to the tower's own stats. */
  stats?: { range?: number; cooldown?: number; splash?: number };
}

export const UPGRADES: Record<UpgradeId, UpgradeDef> = {
  // -- Forge ----------------------------------------------------------------
  kiln: {
    id: 'kiln',
    towerId: 'forge',
    name: 'Kiln',
    cost: 55,
    blurb: 'Heat no longer melts Crystal. A late Forge stops ruining your own work.',
    overrides: { CRYSTAL: { HEAT: { kind: 'none' } } },
  },
  bellows: {
    id: 'bellows',
    towerId: 'forge',
    name: 'Bellows',
    cost: 45,
    blurb: 'Fires considerably faster. More Ore melted per second.',
    stats: { cooldown: 24 },
  },

  // -- Chiller --------------------------------------------------------------
  deposition: {
    id: 'deposition',
    towerId: 'chiller',
    name: 'Deposition Coil',
    cost: 90,
    blurb: 'Cold turns Vapor straight to Crystal instead of back to Molten.',
    overrides: { VAPOR: { COLD: { kind: 'transmute', to: 'CRYSTAL' } } },
  },
  supercooled: {
    id: 'supercooled',
    towerId: 'chiller',
    name: 'Supercooled Jets',
    cost: 60,
    blurb: 'Longer reach, so one Chiller can cover two stretches of lane.',
    stats: { range: 142 },
  },

  // -- Stamp ----------------------------------------------------------------
  dampened: {
    id: 'dampened',
    towerId: 'stamp',
    name: 'Dampened Press',
    cost: 95,
    blurb: 'Kinetic chips Molten instead of splitting it. Breaks the ordering rule.',
    // The game's signature trap, made optional. Priced high and paired with a
    // slower press, because a Stamp that never splits removes the reason
    // placement order matters -- it should cost real throughput to switch off.
    overrides: { MOLTEN: { KINETIC: { kind: 'damage', amount: 1 } } },
    stats: { cooldown: 58 },
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
    blurb: 'Solvent dissolves Vapor twice as fast, so two Vats finish one.',
    overrides: { VAPOR: { SOLVENT: { kind: 'damage', amount: 2 } } },
  },
  catalyst: {
    id: 'catalyst',
    towerId: 'vat',
    name: 'Catalyst Bath',
    cost: 70,
    blurb: 'Solvent destroys Slag outright, so the Vat no longer needs a Stamp.',
    overrides: { SLAG: { SOLVENT: { kind: 'destroy', gold: 1 } } },
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
];

/** The two branches available to a tower, in menu order. */
export function upgradesFor(towerId: TowerId): UpgradeDef[] {
  return UPGRADE_IDS.map((id) => UPGRADES[id]).filter((u) => u.towerId === towerId);
}
