import type { TowerDef, TowerId } from './types.ts';

/**
 * Tower stats are data. A tower is nothing but "apply element E every N ticks
 * to the furthest charge in range" -- all the interesting behaviour comes from
 * the transmutation table, not from here.
 */
export const TOWERS: Record<TowerId, TowerDef> = {
  forge: {
    id: 'forge',
    name: 'Forge',
    element: 'HEAT',
    cost: 40,
    range: 92,
    cooldown: 36,
    groundOnly: false,
    splash: 0,
    color: '#ff8c42',
    blurb: 'Melts Ore. Speeds up anything already molten.',
  },
  chiller: {
    id: 'chiller',
    name: 'Chiller',
    element: 'COLD',
    cost: 65,
    range: 110,
    cooldown: 54,
    groundOnly: false,
    splash: 0,
    color: '#5bc8f5',
    blurb: 'Freezes Molten into brittle Crystal. Useless against Ore.',
  },
  stamp: {
    id: 'stamp',
    name: 'Stamp',
    element: 'KINETIC',
    cost: 50,
    range: 74,
    cooldown: 42,
    groundOnly: true,
    splash: 0,
    color: '#d8d8d8',
    blurb: 'Shatters Crystal for bonus gold. Splits Molten into three.',
  },
  vat: {
    id: 'vat',
    name: 'Vat',
    element: 'SOLVENT',
    cost: 55,
    range: 100,
    cooldown: 78,
    groundOnly: false,
    splash: 46,
    color: '#9ae66e',
    blurb: 'Strips Ore to Slag in a splash. Dissolves Vapor slowly.',
  },
};

export const TOWER_IDS: TowerId[] = ['forge', 'chiller', 'stamp', 'vat'];
