import { RESISTANCE } from '../sim/resistance.ts';
import { RIDERS } from '../sim/riders.ts';
import { TOWERS, TOWER_IDS } from '../sim/towers.ts';
import { UPGRADES } from '../sim/upgrades.ts';
import { STATES, STATE_IDS } from '../sim/types.ts';
import type { Element, State, Status, Stats, Tower, TowerId, UpgradeId } from '../sim/types.ts';
import { WAVES } from '../sim/waves.ts';

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
 * There is nowhere to pass hover state here even if someone wanted to, and the
 * type signature is what keeps it that way.
 *
 * `buildable` is the mirror of that omission -- a fact that has to be *present*
 * rather than absent. Without it this function could not tell a legal empty
 * cell from the lane, so a click on the road fell through to `place`, and
 * `placeTower` refused it silently. The tower stayed armed with no feedback and
 * no discoverable way to put it down, which is the same "selected tower that
 * could not be deselected" this module's header already lists once.
 */
export function boardAction(opts: {
  selected: boolean;
  towerHere: boolean;
  /** False for the lane and anything off the board -- see `isBuildableCell`. */
  buildable: boolean;
}): BoardAction {
  if (!opts.selected) return opts.towerHere ? 'inspect' : 'close';
  // Armed over a cell that cannot take a tower, whether that is because one
  // already stands there or because it is lane. Either way the click cannot
  // mean "build", and putting the tower down is the only reading left.
  //
  // Deliberately keyed on the *cell*, not on whether `placeTower` succeeded.
  // Placement also fails when the player cannot afford the tower, and disarming
  // then would strand the selection exactly as `cardState` below refuses to --
  // being poor on a legal cell has to keep the tower armed.
  return opts.towerHere || !opts.buildable ? 'disarm' : 'place';
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

/**
 * The wave readout: "7/20" for an authored round, "21+" once freeplay opens.
 *
 * Freeplay drops the denominator rather than printing one past the total,
 * because there is no total to count towards -- that is the whole point of
 * the mode.
 */
export function waveLabel(opts: { waveIndex: number; freeplay: boolean }): string {
  if (opts.freeplay) return `${opts.waveIndex + 1}+`;
  return `${Math.min(opts.waveIndex + 1, WAVES.length)}/${WAVES.length}`;
}

/**
 * The line under the board naming the round in play.
 *
 * Built from the round number by string interpolation, never by calling
 * `freeplayWave`: that function calls `rng.range()` to build its wave, and
 * spending a roll of the seeded RNG just to fetch a hint string would
 * desynchronise the browser from `npm run sim` on every frame this runs.
 *
 * Both branches name their round -- an authored round as "Wave N: ...", a
 * freeplay one as "Freeplay round N." -- so the two modes read as one
 * consistent shape rather than one that mentions the round and one that
 * assumes the reader already knows it.
 */
export function roundHint(opts: { waveIndex: number; freeplay: boolean }): string {
  if (opts.freeplay) return `Freeplay round ${opts.waveIndex + 1}. It does not stop.`;
  const hint = WAVES[opts.waveIndex]?.hint;
  return hint ? `Wave ${opts.waveIndex + 1}: ${hint}` : '';
}

/**
 * What the end-of-run overlay says, and whether it offers freeplay.
 *
 * `canContinue` is true only on a win: a lost run never offers freeplay, and a
 * run already in freeplay can never be `'won'` again, so that one condition
 * covers both cases the overlay has to distinguish.
 */
export function endOverlay(opts: {
  status: Status;
  waveIndex: number;
  stats: Stats;
}): { title: string; body: string; canContinue: boolean } | null {
  if (opts.status === 'won') {
    return {
      title: 'Furnace cold',
      body: `All ${WAVES.length} rounds held. ${opts.stats.breaks} layers broken, ${opts.stats.kills} charges destroyed, ${opts.stats.goldEarned} gold earned.`,
      canContinue: true,
    };
  }
  if (opts.status === 'lost') {
    return {
      title: 'Breach',
      body: `The line failed on round ${opts.waveIndex + 1}. ${opts.stats.leaks} charges got through, and ${opts.stats.wasted} shots landed on something immune to them.`,
      canContinue: false,
    };
  }
  return null;
}

/**
 * What an element is called on screen.
 *
 * This used to be `e[0] + e.slice(1).toLowerCase()`, which worked only while
 * every element happened to be named after its own id. Two are not: KINETIC
 * reads as "Impact" and SOLVENT as "Acid", because the ids are physics and
 * chemistry vocabulary and the interface has to be readable by someone who has
 * never met either word.
 *
 * The ids themselves are deliberately untouched. They key the resistance
 * table, so renaming them would edit the one file this project treats as the
 * game itself, and every reference loadout in BALANCE.md with them.
 */
const ELEMENT_LABELS: Record<Element, string> = {
  HEAT: 'Heat',
  COLD: 'Cold',
  KINETIC: 'Impact',
  SOLVENT: 'Acid',
};

export function elementLabel(e: Element): string {
  return ELEMENT_LABELS[e];
}

/**
 * How many layers this charge still has, counting the one it is wearing.
 *
 * Ore 2, Slag 1, Molten 2, Crystal 3, Vapor 1. Layers are the mechanic the
 * board could never show: a Crystal and a Vapor of the same size look equally
 * finished, and only one of them is about to become four more creatures. The
 * health bar says how close this layer is to breaking and says nothing at all
 * about what is under it.
 *
 * Walked from `breaksInto` rather than written out as five numbers, because a
 * literal would be a second copy of the chain and would quietly disagree with
 * it the first time the chain moved. The walk terminates by construction --
 * `STATES` only ever runs inward and nothing may put a layer back on -- but it
 * is guarded anyway, since a cycle here would hang the render loop rather than
 * fail a test.
 */
export function layersRemaining(state: State): number {
  let depth = 0;
  let at: State | null = state;
  while (at !== null && depth <= STATE_IDS.length) {
    depth++;
    at = STATES[at].breaksInto;
  }
  return depth;
}

/**
 * The order the layers are listed in, deepest stack first.
 *
 * The reference panel is trying to teach two things at once -- what beats a
 * layer, and what the layer becomes -- so reading it top to bottom should walk
 * the cascade rather than an arbitrary order. Crystal is three deep and heads
 * the list; the two single layers that are the end of a chain sit at the
 * bottom, which is where a player looks last.
 *
 * Ties fall back to `STATE_IDS` order, so the result is stable and a sixth
 * layer cannot make the panel reshuffle itself unpredictably.
 */
export function matterRows(): State[] {
  return [...STATE_IDS].sort((a, b) => {
    const depth = layersRemaining(b) - layersRemaining(a);
    return depth !== 0 ? depth : STATE_IDS.indexOf(a) - STATE_IDS.indexOf(b);
  });
}

/**
 * A resistance cell as a number of filled bars, 0 to 4.
 *
 * The bars are the half of the panel that works without English, so they carry
 * the coarse reading -- nothing, poor, fair, good, specialist -- and the
 * numeral beside them carries the exact one. Zero is reserved: it means
 * immunity and is drawn as a wall rather than as an empty meter, because "does
 * nothing" is a different kind of fact from "does very little".
 *
 * Capped at four, since an upgraded cell can reach 3.5 and a fifth bar would
 * mean the panel disagreed with itself about what full looks like.
 */
export function barsFor(mult: number): number {
  if (mult <= 0) return 0;
  if (mult <= 0.75) return 1;
  if (mult <= 1.25) return 2;
  if (mult < 2) return 3;
  return 4;
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
      return 'Keeps eating it, and follows whatever breaks out';
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
      return 'eaten away';
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
