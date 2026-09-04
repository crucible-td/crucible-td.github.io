import { MONSTER_SCALE } from './art.ts';
import { RESISTANCE, resolveResistance } from '../sim/resistance.ts';
import { RIDERS } from '../sim/riders.ts';
import { TOWERS, TOWER_IDS } from '../sim/towers.ts';
import { UPGRADES } from '../sim/upgrades.ts';
import { ELEMENT_IDS, STATES, STATE_IDS } from '../sim/types.ts';
import type { Charge, Element, State, Status, Stats, Tower, TowerId, UpgradeId } from '../sim/types.ts';
import { AUTHORED_ROUNDS, freeplayShape } from '../sim/freeplay.ts';
import { WAVES } from '../sim/waves.ts';
import { overridesOf } from '../sim/world.ts';

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

/** One line of the round preview: a layer, how many of it, and how tough. */
export interface PreviewRow {
  state: State;
  count: number;
  /** Toughness multiplier. 1 means a layer at its printed HP. */
  hpScale: number;
  /** True when the real toughness is jittered around this figure at spawn. */
  approx: boolean;
}

/**
 * What the coming round contains: the strip above Start wave.
 *
 * `roundHint` gives the round an adjective; this gives it a composition. The
 * three things a player plans against are what is coming, how many, and how
 * tough, and none of them used to be on screen -- the only way to learn what
 * round 17 held was to lose to it once.
 *
 * Never builds a freeplay wave. `freeplayWave` draws from the seeded RNG, and
 * this runs while the interface is merely sitting there, so a roll spent here
 * would desynchronise the browser from `npm run sim`. It reads `freeplayShape`
 * instead, which is the same composition with the toughness jitter left off --
 * hence `approx` on those rows, and not on the slab, which takes no roll.
 *
 * Groups sharing a layer *and* a toughness are summed, so the strip stays a few
 * lines. Toughness is deliberately not folded together: round 20's x55 Crystal
 * slab standing as its own row beside x17 Ore is the entire point, because the
 * board draws them at the same size.
 */
export function roundPreview(opts: { waveIndex: number; freeplay: boolean }): PreviewRow[] {
  const groups: PreviewRow[] = [];
  if (opts.waveIndex < AUTHORED_ROUNDS) {
    for (const g of WAVES[opts.waveIndex]?.groups ?? []) {
      groups.push({ state: g.state, count: g.count, hpScale: g.hpScale ?? 1, approx: false });
    }
  } else if (opts.freeplay) {
    const { slab, bulk } = freeplayShape(opts.waveIndex + 1);
    // Spawn order, so the strip reads in the order the lane will.
    if (slab) groups.push({ state: slab.state, count: slab.count, hpScale: slab.hpScale ?? 1, approx: false });
    for (const g of bulk) {
      groups.push({ state: g.state, count: g.count, hpScale: g.hpScale ?? 1, approx: true });
    }
  }

  const rows: PreviewRow[] = [];
  for (const g of groups) {
    const merged = rows.find(
      (r) => r.state === g.state && Math.round(r.hpScale) === Math.round(g.hpScale),
    );
    if (merged) {
      merged.count += g.count;
      merged.approx = merged.approx || g.approx;
    } else {
      rows.push({ ...g });
    }
  }
  return rows;
}

/**
 * A reading of the counters that will not change under the reader.
 *
 * `Stats` holds `leaksByState`, an object, so a shallow spread of `world.stats`
 * hands back the live counter rather than a copy of it. The dev console handle
 * did exactly that: three `crucible.advance()` readings taken across a session
 * all reported the final numbers, because all three were the same object. A
 * debugging tool that lies is the worst kind.
 *
 * `src/campaign.ts` already copies the map inline everywhere it records a
 * round; this is that move with a name, in a file a test can reach --
 * `src/main.ts`, where the defect lived, is excluded from coverage as an entry
 * point, which is why nothing caught it.
 */
export function statsSnapshot(stats: Stats): Stats {
  return { ...stats, leaksByState: { ...stats.leaksByState } };
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
 * How large a charge is drawn, in pixels of radius.
 *
 * Lives here rather than inside the drawing code because two callers need to
 * agree about it: the renderer, which paints the creature, and the picking
 * that decides which creature the pointer is over. Two copies of this would
 * mean a charge you could see but not point at, and the discrepancy would grow
 * with toughness, so it would look fine in testing and break on the bosses.
 */
export function chargeRadius(state: State, scale: number): number {
  // Sub-linear and capped, so a x14 slab is unmistakable without swallowing
  // the lane. Raising the cap was tried and rejected by looking at it: at 2.4
  // a Crystal is 39px of radius on a lane 40px wide, and round 20 draws as a
  // solid column of overlapping bodies. Toughness past this point is carried
  // by `toughnessTier` instead, because size has run out of board.
  const toughness = Math.min(Math.sqrt(scale), 2.1);
  return STATES[state].radius * MONSTER_SCALE * toughness;
}

/**
 * How heavily armoured a charge is drawn, 0 to 4.
 *
 * `hpScale` is the whole late-game difficulty curve -- rounds 16 to 20 run at
 * 12 to 55, and freeplay turns no other dial -- and until this existed the
 * board was the one place it could not be seen. Size cannot say it: everything
 * from x4.4 upward is drawn at the same capped radius, so a x55 slab and the
 * x17 Ore walking beside it were the same creature at a glance.
 *
 * A ladder rather than a curve, because the question a player asks is "is that
 * one worse than these" and not "by how much". The thresholds sit where the
 * game's own numbers sit: rounds 1-4 carry no `hpScale` at all and stay bare,
 * round 20's x17 bulk lands a tier below its x55 slab, and tier 4 exists
 * because freeplay compounds without bound and the ladder has to stop
 * somewhere.
 */
export function toughnessTier(scale: number): number {
  if (scale >= 100) return 4;
  if (scale >= 32) return 3;
  if (scale >= 10) return 2;
  if (scale >= 3) return 1;
  return 0;
}

export interface PickTarget {
  id: number;
  x: number;
  y: number;
  r: number;
}

/**
 * Which charge the pointer is over, or null.
 *
 * Takes resolved positions rather than a `World`, which keeps it a plain
 * geometry function with nothing to stub in a test. Nearest-centre wins, so
 * the answer is stable where two charges overlap -- and they overlap
 * constantly, since a Crystal breaks into two Lava at the same point on the
 * lane.
 *
 * The four pixels of slop are for the small layers: an Ash is ten pixels
 * across and asking a player to land inside that while it moves is asking too
 * much.
 */
export function pickCharge(targets: PickTarget[], point: { x: number; y: number }): number | null {
  let best: number | null = null;
  let bestDist = Infinity;
  for (const t of targets) {
    const d = Math.hypot(t.x - point.x, t.y - point.y);
    if (d > t.r + 4 || d >= bestDist) continue;
    best = t.id;
    bestDist = d;
  }
  return best;
}

export interface ChargeReadout {
  label: string;
  /** This charge's real HP, toughness included -- not the layer's base. */
  hp: number;
  leakCost: number;
  floats: boolean;
  /** Everything above x1, strongest first. The table guarantees at least two. */
  counters: { element: Element; label: string; mult: number }[];
  immunities: { element: Element; label: string }[];
  breaksInto: { state: State; label: string; count: number } | null;
}

/**
 * Everything worth knowing about a layer, for the tag shown on hover.
 *
 * One source for two surfaces: the tag drawn beside the charge on the lane and
 * the row lit up in the Matter panel are the same facts, and they must not be
 * able to disagree about them.
 *
 * Takes the charge rather than its state, because toughness is not a property
 * of the layer. Reading `hp` straight out of `STATES` made the tag quote the
 * base number while the health bar drawn beside it multiplied by `scale`, so a
 * round 20 slab carrying 1139 hp announced itself as 22 -- two surfaces on the
 * same screen disagreeing by a factor of fifty-two about the one variable that
 * is the entire late-game difficulty curve.
 *
 * Counters come out strongest first because that is the order the player wants
 * to read them in -- "what is my best answer, and what else will do". Ties fall
 * back to `ELEMENT_IDS` order so the tag never reorders itself between frames.
 */
export function chargeReadout(c: Pick<Charge, 'state' | 'scale'>): ChargeReadout {
  const def = STATES[c.state];
  const row = RESISTANCE[c.state];

  const counters = ELEMENT_IDS.filter((e) => row[e] > 1)
    .sort((a, b) => row[b] - row[a] || ELEMENT_IDS.indexOf(a) - ELEMENT_IDS.indexOf(b))
    .map((e) => ({ element: e, label: elementLabel(e), mult: row[e] }));

  const immunities = ELEMENT_IDS.filter((e) => row[e] <= 0).map((e) => ({
    element: e,
    label: elementLabel(e),
  }));

  const child = def.breaksInto;
  return {
    label: def.label,
    hp: Math.round(def.hp * c.scale),
    leakCost: def.leakCost,
    floats: def.floats,
    counters,
    immunities,
    breaksInto: child
      ? { state: child, label: STATES[child].label, count: def.childCount }
      : null,
  };
}

/**
 * The resistance table as the player's own board actually resolves it.
 *
 * The Matter panel used to render `RESISTANCE` once, at startup, and so it went
 * on describing the game as it shipped rather than the game being played. That
 * made it wrong about the most expensive thing anyone can buy: Absolute Zero
 * costs 445 gold across three tiers and lifts Crystal/Cold from immune to
 * x1.75, and the panel kept drawing that cell as a wall. Blast Furnace,
 * Universal Acid and Full Spectrum all lift a wall the same way. The player
 * paid, and the interface denied it happened.
 *
 * Each cell is the best the player owns for that element -- the maximum over
 * every placed tower that throws it -- falling back to the base table where
 * they own nothing that throws it, because an element nobody has brought is
 * still worth teaching. Only a tower's own element is folded in: a tower throws
 * one element and one only, so an override sitting on another element's cell is
 * unreachable and must not be counted as owned.
 *
 * It also answers the question the panel could not answer at all -- given what
 * I have built, what am I still blind to -- which is close to the question the
 * whole game is about.
 */
export function ownedResistance(
  towers: Pick<Tower, 'def' | 'upgrades'>[],
): Record<State, Record<Element, number>> {
  const table = Object.fromEntries(
    STATE_IDS.map((s) => [s, { ...RESISTANCE[s] }]),
  ) as Record<State, Record<Element, number>>;

  for (const t of towers) {
    const element = TOWERS[t.def].element;
    const overrides = overridesOf(t);
    if (!overrides) continue;
    for (const state of STATE_IDS) {
      const owned = resolveResistance(state, element, overrides);
      if (owned > table[state][element]) table[state][element] = owned;
    }
  }
  return table;
}

/**
 * The identity of the table above, so the panel is rebuilt only on change.
 *
 * Sorted, so that placing two towers in the other order is not a change: the
 * panel is about what is owned, never about where it stands. Coordinates are
 * left out for the same reason.
 */
export function matterKey(towers: Pick<Tower, 'def' | 'upgrades'>[]): string {
  return towers
    .map((t) => `${t.def}:${t.upgrades.join('>')}`)
    .sort()
    .join('|');
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
      return 'Keeps eating, and follows what breaks out';
    case 'shove':
      return 'Knocks it back down the lane';
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
