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
 */
export const TOWERS: Record<TowerId, TowerDef> = {
  forge: {
    id: 'forge',
    name: 'Forge',
    element: 'HEAT',
    cost: 46,
    damage: 4,
    range: 92,
    cooldown: 30,
    groundOnly: false,
    splash: 0,
    color: '#ff8c42',
    blurb: 'Cheap and constant. Strong against Ore, useless against Molten.',
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
    blurb: 'The answer to Molten, and the only reach that troubles Vapor.',
  },
  stamp: {
    id: 'stamp',
    name: 'Stamp',
    element: 'KINETIC',
    cost: 45,
    damage: 9,
    range: 90,
    cooldown: 42,
    groundOnly: true,
    splash: 0,
    color: '#d8d8d8',
    blurb: 'Heavy hits at fair reach. Shatters Crystal; cannot touch Vapor.',
  },
  vat: {
    id: 'vat',
    name: 'Vat',
    element: 'SOLVENT',
    cost: 52,
    damage: 5,
    range: 100,
    cooldown: 60,
    groundOnly: false,
    splash: 36,
    color: '#9ae66e',
    blurb: 'Splashes a crowd. Never the best answer, never a useless one.',
  },
  lens: {
    id: 'lens',
    name: 'Lens',
    element: 'HEAT',
    cost: 64,
    damage: 14,
    range: 260,
    cooldown: 74,
    groundOnly: false,
    splash: 0,
    color: '#ffd166',
    blurb: 'Reaches most of the lane and hits hard, but rarely.',
  },
};

export const TOWER_IDS: TowerId[] = ['forge', 'chiller', 'stamp', 'vat', 'lens'];
