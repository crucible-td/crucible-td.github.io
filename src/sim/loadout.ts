import { TOWER_IDS } from './towers.ts';
import { UPGRADES } from './upgrades.ts';
import type { TowerId, UpgradeId } from './types.ts';

/**
 * The loadout grammar shared by both harnesses.
 *
 * `npm run sim --loadout` and `npm run campaign --plan` take the same strings,
 * and used to parse them with two copies of the same function. They are one
 * function now, because a grammar that drifts between the two harnesses is a
 * grammar that silently measures two different games.
 *
 *   towerId@col,row            e.g. forge@5,4
 *   towerId@col,row+upgradeId  e.g. stamp@11,9+damp3
 *
 * Naming a tier-3 upgrade means "climb this path": tiers 1 and 2 are bought
 * first and paid for. The grammar stays about intent rather than bookkeeping.
 *
 * Upgrades are part of balance, so they have to be expressible here -- an
 * upgrade that can only be bought by clicking in the browser cannot be
 * measured, and unmeasurable balance is exactly what this project refuses.
 */
export interface Placement {
  def: TowerId;
  col: number;
  row: number;
  /** Bought immediately after the tower is placed, if given. */
  upgrade?: UpgradeId;
}

const ENTRY = /^([a-z]+)@(\d+),(\d+)(?:\+([a-zA-Z]+\d?))?$/;

export function parseLoadout(raw: string): Placement[] {
  if (!raw.trim()) return [];
  return raw
    .split(/[;\s]+/)
    .filter(Boolean)
    .map((entry) => {
      const m = ENTRY.exec(entry.trim());
      if (!m) throw new Error(`bad loadout entry "${entry}" -- expected e.g. forge@6,1 or stamp@11,9+dampened`);
      const def = m[1] as TowerId;
      if (!TOWER_IDS.includes(def)) {
        throw new Error(`unknown tower "${def}" -- known: ${TOWER_IDS.join(', ')}`);
      }
      const placement: Placement = { def, col: Number(m[2]), row: Number(m[3]) };
      if (m[4] !== undefined) {
        const up = m[4] as UpgradeId;
        const known = UPGRADES[up];
        if (!known) {
          const forThisTower = Object.values(UPGRADES)
            .filter((u) => u.towerId === def)
            .map((u) => u.id);
          throw new Error(`unknown upgrade "${m[4]}" -- ${def} branches: ${forThisTower.join(', ')}`);
        }
        if (known.towerId !== def) {
          throw new Error(`upgrade "${up}" belongs to ${known.towerId}, not ${def}`);
        }
        placement.upgrade = up;
      }
      return placement;
    });
}

/** How a placement reads back in a report. */
export function describePlacement(p: Placement): string {
  return `${p.def}@${p.col},${p.row}${p.upgrade ? `+${p.upgrade}` : ''}`;
}
