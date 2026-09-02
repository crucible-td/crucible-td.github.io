import type { TowerDef, TowerId } from './types.ts';

/**
 * Tower stats are data. A tower is nothing but "throw element E for D damage
 * every N ticks at the furthest charge in range" -- what makes that good or
 * useless comes from the resistance table, not from here.
 *
 * Two towers share the Heat element on purpose. The interesting axis is not
 * only which element you bring but what shape of tower carries it: the Forge
 * is cheap, short and constant, the Lens is expensive, distant and slow, and
 * they play nothing alike despite reading the same column of the table.
 *
 * A tower's lingering effect is deliberately NOT here. It belongs to the
 * element, in `riders.ts`, scaled by the same resistance cell that scales the
 * damage -- so the Chiller slows because Cold slows, and it slows Molten four
 * times as hard as Ore because that is what the table already said about Cold.
 * A rider keyed on `TowerId` would be the special case that rule exists to
 * prevent, and it would put the Forge and the Lens out of step for no reason.
 *
 * These numbers are unchanged by riders. Riders were a straight power gain and
 * something had to pay for them, but the bill went to `upgrades.ts` -- a
 * rider's strength is a table cell times a constant, and tiers are what push
 * cells up, so the gain concentrates in upgraded towers. Cutting rate here was
 * measured and rejected: it taxed the thin early board hardest and put leaks
 * into rounds 4 and 5, which teach immunities and must not bite.
 */
export const TOWERS: Record<TowerId, TowerDef> = {
  forge: {
    id: 'forge',
    name: 'Burner',
    element: 'HEAT',
    cost: 46,
    damage: 4,
    range: 92,
    cooldown: 30,
    groundOnly: false,
    splash: 0,
    color: '#ff8c42',
    blurb: 'Cheap and constant, and what it hits keeps burning. Nothing at all to Lava.',
  },
  chiller: {
    id: 'chiller',
    name: 'Chiller',
    element: 'COLD',
    cost: 58,
    damage: 6,
    range: 110,
    cooldown: 48,
    groundOnly: false,
    splash: 0,
    color: '#5bc8f5',
    blurb: 'Lava crawls at half pace under it. Crystal does not feel it at all.',
  },
  stamp: {
    id: 'stamp',
    name: 'Hammer',
    element: 'KINETIC',
    cost: 45,
    damage: 9,
    range: 90,
    cooldown: 42,
    groundOnly: true,
    splash: 0,
    color: '#dfe3e8',
    blurb: 'Heavy hits that shove a charge back. Shatters Crystal; Gas floats over.',
  },
  vat: {
    id: 'vat',
    name: 'Acid Tank',
    element: 'SOLVENT',
    cost: 52,
    damage: 5,
    range: 100,
    cooldown: 60,
    groundOnly: false,
    splash: 36,
    color: '#9ae66e',
    blurb: 'Splashes a crowd, and the acid follows whatever breaks out of it.',
  },
  lens: {
    id: 'lens',
    name: 'Beam',
    element: 'HEAT',
    cost: 64,
    damage: 14,
    range: 260,
    cooldown: 74,
    groundOnly: false,
    splash: 0,
    color: '#ffb45c',
    blurb: 'Reaches most of the lane and leaves it alight, but fires rarely.',
  },
};

export const TOWER_IDS: TowerId[] = ['forge', 'chiller', 'stamp', 'vat', 'lens'];
