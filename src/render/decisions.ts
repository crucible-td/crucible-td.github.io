import { RESISTANCE } from '../sim/resistance.ts';
import { RIDERS } from '../sim/riders.ts';
import { TOWERS, TOWER_IDS } from '../sim/towers.ts';
import { UPGRADES } from '../sim/upgrades.ts';
import { STATES } from '../sim/types.ts';
import type { Element, State, Tower, TowerId, UpgradeId } from '../sim/types.ts';

/**
 * The decisions the interface makes, without the interface.
 *
 * These were tangled up in DOM code, which is the only reason they were
 * untestable -- none of them is complicated. Pulled out here they are ordinary
 * functions: `ui.ts` and `main.ts` render what these return rather than working
 * it out inline.
 *
 * That matters because presentation is where this project's bugs actually
 * come from. A selected tower that became unclickable once it was unaffordable,
 * an upgrade panel showing the tower clicked *before* the one under the cursor,
 * a panel that would not refresh after a purchase, and a board that ignored
 * every tap because it read the target cell from a mousemove -- all real, all
 * found by hand, none catchable while the logic lived inside an event handler.
 *
 * No `document`, no canvas, no imports from anything that touches them.
 */

/** What a click on a board cell should do. */
export type BoardAction = 'place' | 'disarm' | 'inspect' | 'close';

/**
 * The whole click handler's judgement, in one function.
 *
 * Note what is deliberately *not* an input: where the pointer last moved. The
 * cell comes from the click itself, because a touch device never sends a
 * mousemove and reading `hover` made every tap on a phone do nothing at all.
 */
export function boardAction(opts: { selected: boolean; towerHere: boolean }): BoardAction {
  if (!opts.selected) return opts.towerHere ? 'inspect' : 'close';
  // Armed over an occupied cell: the placement preview is already showing red,
  // so the click cannot mean "build". Clicking the tower you just placed is the
  // natural way to stop placing, and doing nothing was the old behaviour.
  return opts.towerHere ? 'disarm' : 'place';
}

/**
 * Which tower a number key selects, or null if that key means nothing.
 *
 * Derived from `TOWER_IDS` rather than a list written out here, because the
 * build menu is rendered from `TOWER_IDS` too and the two must not be able to
 * disagree. The old version hardcoded five ids in a keydown handler: adding a
 * sixth tower would have left key 6 silently dead, and reordering the roster
 * would have quietly pointed every key at the wrong tower with nothing to
 * catch it. The roster is planned to grow to eight.
 */
export function towerForKey(key: string): TowerId | null {
  if (!/^[0-9]$/.test(key)) return null;
  return TOWER_IDS[Number(key) - 1] ?? null;
}

/**
 * What arming a tower does to the current selection.
 *
 * Clicking a build card and pressing its number key are the same intent, so
 * they have to reach the same answer. They did not: the card toggled off when
 * you clicked the armed tower again and closed the upgrade panel, while the
 * number key did neither, so `2` after `2` left the Chiller armed and a panel
 * open behind it. One function, used by both.
 *
 * Returns the next selection and whether the inspect panel should close --
 * picking something to build is a different intent from inspecting something
 * already built.
 */
export function armTower(
  current: TowerId | null,
  pressed: TowerId,
): { selected: TowerId | null; closeInspect: boolean } {
  const selected = current === pressed ? null : pressed;
  return { selected, closeInspect: selected !== null };
}

export interface CardState {
  pressed: boolean;
  disabled: boolean;
  unaffordable: boolean;
}

/**
 * How a tower's card in the build menu should look.
 *
 * The armed tower stays enabled however poor the player is. Disabling it
 * stranded the selection: a disabled button fires no click, so the only ways
 * to disarm were Escape or right-click, neither of which is discoverable.
 * Affordability is shown by dimming instead, and placement is guarded by
 * `placeTower` regardless.
 */
export function cardState(opts: { gold: number; cost: number; isSelected: boolean }): CardState {
  const affordable = opts.gold >= opts.cost;
  return {
    pressed: opts.isSelected,
    disabled: !affordable && !opts.isSelected,
    unaffordable: !affordable,
  };
}

/**
 * The identity of what the upgrade panel is currently showing.
 *
 * The panel is rebuilt when this changes, so it has to include how far the path
 * has been climbed and not just which tower is open. Keyed on the tower alone,
 * buying a tier left the panel still offering the tier you had just bought.
 */
export function panelKey(tower: Pick<Tower, 'id' | 'upgrades'>): string {
  return `${tower.id}:${tower.upgrades.join('>')}`;
}

/** "HEAT" -> "Heat". */
export function elementLabel(e: Element): string {
  return e[0]! + e.slice(1).toLowerCase();
}

/**
 * A resistance cell in words.
 *
 * Zero gets a word rather than a number, because an immunity is a wall and the
 * player needs to read it as one at a glance.
 */
export function describeMultiplier(mult: number): string {
  if (mult <= 0) return 'immune';
  if (mult === 1) return '×1';
  return `×${mult}`;
}

/** Shots per second, which reads better than a cooldown in ticks. */
export function rate(cooldown: number): string {
  return (60 / cooldown).toFixed(1);
}

/** The numeric stats a branch moves, as "before → after" lines. */
export function describeStats(
  now: { damage: number; range: number; cooldown: number; splash: number },
  id: UpgradeId,
): string[] {
  const next = UPGRADES[id].stats;
  if (!next) return [];
  const out: string[] = [];
  if (next.damage !== undefined && next.damage !== now.damage) {
    out.push(`Damage ${now.damage} → ${next.damage}`);
  }
  if (next.cooldown !== undefined && next.cooldown !== now.cooldown) {
    out.push(`Fire rate ${rate(now.cooldown)} → ${rate(next.cooldown)} per second`);
  }
  if (next.range !== undefined && next.range !== now.range) {
    out.push(`Range ${now.range} → ${next.range}`);
  }
  if (next.splash !== undefined && next.splash !== now.splash) {
    out.push(`Splash ${now.splash} → ${next.splash}`);
  }
  return out;
}

/** The table cells a branch rewrites, as "new (was old)" lines. */
export function describeOverrides(id: UpgradeId): string[] {
  const out: string[] = [];
  for (const [state, row] of Object.entries(UPGRADES[id].overrides ?? {})) {
    for (const [element, mult] of Object.entries(row)) {
      const before = describeMultiplier(RESISTANCE[state as State][element as Element]);
      // New behaviour first, since that is what the player is deciding to buy.
      out.push(
        `${STATES[state as State].label} + ${elementLabel(element as Element)}: ` +
          `${describeMultiplier(mult)} (was ${before})`,
      );
    }
  }
  return out;
}

/**
 * An element's rider in words, for the tower card.
 *
 * The card already names the element and shows the table, so this says the one
 * thing neither of those can: what lingers after the hit. Kept here rather
 * than in `towers.ts` because a rider belongs to the element, and two towers
 * share Heat -- writing it into each tower's blurb would be two copies of one
 * fact, drifting apart the first time the dial moved.
 */
export function describeRider(element: Element): string {
  const rider = RIDERS[element];
  switch (rider.kind) {
    case 'chill':
      return 'Slows what it hurts';
    case 'ignite':
      return 'Sets fire to what it hurts';
    case 'corrode':
      return 'Corrodes, and the corrosion follows what breaks out';
    case 'shove':
      return 'Knocks what it hurts back down the lane';
  }
}

/** The verb form, for describing a cell an upgrade has just opened up. */
function riderVerb(element: Element): string {
  const rider = RIDERS[element];
  switch (rider.kind) {
    case 'chill':
      return 'slowed';
    case 'ignite':
      return 'set alight';
    case 'corrode':
      return 'corroded';
    case 'shove':
      return 'knocked back';
  }
}

/**
 * Cells this branch opens up for the tower's rider as well as its damage.
 *
 * Riders scale by the same multiplier the damage does, so a tier that lifts an
 * immunity does two things at once: an Absolute Zero Chiller does not merely
 * start hurting Crystal, it starts *slowing* Crystal. That is the best reason
 * in the game to climb a path and it was invisible -- `describeOverrides`
 * reports the new multiplier, which reads as a damage change and nothing more.
 *
 * Only wall-lifting counts. A cell going from 1.6 to 2.5 strengthens a rider
 * the player can already see working, and saying so on every tier would bury
 * the one line that is genuinely news.
 */
export function describeRiderGains(id: UpgradeId): string[] {
  const up = UPGRADES[id];
  const element = TOWERS[up.towerId].element;
  const out: string[] = [];
  for (const [state, row] of Object.entries(up.overrides ?? {})) {
    const next = row[element];
    if (next === undefined || next <= 0) continue;
    if (RESISTANCE[state as State][element] > 0) continue;
    out.push(`${STATES[state as State].label} can now be ${riderVerb(element)} too`);
  }
  return out;
}
