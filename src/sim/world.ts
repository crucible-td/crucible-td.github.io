import { ECONOMY } from './economy.ts';
import { PATH_LENGTH, isBuildableCell, cellCentre, pointAt } from './path.ts';
import { Rng } from './rng.ts';
import { isImmune, resolveResistance } from './resistance.ts';
import type { ResistanceOverrides } from './resistance.ts';
import { TOWERS } from './towers.ts';
import { UPGRADES, upgradesFor } from './upgrades.ts';
import { STATES } from './types.ts';
import type {
  Charge,
  Element,
  Projectile,
  SimEvent,
  State,
  Stats,
  Status,
  Tower,
  TowerId,
  UpgradeId,
} from './types.ts';
import { WAVES } from './waves.ts';

const PROJECTILE_SPEED = 9;
const IMPACT_RADIUS = 9;
const FLASH_TICKS = 8;

export interface World {
  tick: number;
  rng: Rng;
  gold: number;
  lives: number;
  status: Status;
  charges: Charge[];
  towers: Tower[];
  projectiles: Projectile[];
  /** Index into WAVES of the wave now running, or the one about to start. */
  waveIndex: number;
  spawnQueue: { at: number; state: State }[];
  stats: Stats;
  /** Cleared at the top of every step. Rendering reads these for feedback. */
  events: SimEvent[];
  nextId: number;
}

export function createWorld(seed = 1): World {
  return {
    tick: 0,
    rng: new Rng(seed),
    gold: ECONOMY.startGold,
    lives: ECONOMY.startLives,
    status: 'idle',
    charges: [],
    towers: [],
    projectiles: [],
    waveIndex: 0,
    spawnQueue: [],
    stats: {
      breaks: 0,
      wasted: 0,
      kills: 0,
      leaks: 0,
      leaksByState: { ORE: 0, SLAG: 0, MOLTEN: 0, CRYSTAL: 0, VAPOR: 0 },
      livesLost: 0,
      goldEarned: 0,
    },
    events: [],
    nextId: 1,
  };
}

// --- player actions ---------------------------------------------------------

/**
 * A tower's stats with its upgrade folded in.
 *
 * Numeric branches are a shallow patch over the tower's own def. Keeping this
 * in one place means firing code never has to know whether a tower is upgraded.
 */
function effective(t: Tower): { element: Element; damage: number; range: number; cooldown: number; splash: number; groundOnly: boolean; color: string } {
  const def = TOWERS[t.def];
  const stats = t.upgrade ? UPGRADES[t.upgrade].stats : undefined;
  return {
    element: def.element,
    damage: stats?.damage ?? def.damage,
    range: stats?.range ?? def.range,
    cooldown: stats?.cooldown ?? def.cooldown,
    splash: stats?.splash ?? def.splash,
    groundOnly: def.groundOnly,
    color: def.color,
  };
}

/** The table cells this tower rewrites, if its branch rewrites any. */
function overridesOf(t: Tower): ResistanceOverrides | undefined {
  return t.upgrade ? UPGRADES[t.upgrade].overrides : undefined;
}

export function towerAt(w: World, col: number, row: number): Tower | undefined {
  const c = cellCentre(col, row);
  return w.towers.find((t) => t.x === c.x && t.y === c.y);
}

export function canPlace(w: World, def: TowerId, col: number, row: number): boolean {
  if (!isBuildableCell(col, row)) return false;
  if (towerAt(w, col, row)) return false;
  return w.gold >= TOWERS[def].cost;
}

export function placeTower(w: World, def: TowerId, col: number, row: number): boolean {
  if (!canPlace(w, def, col, row)) return false;
  const c = cellCentre(col, row);
  w.gold -= TOWERS[def].cost;
  w.towers.push({ id: w.nextId++, def, x: c.x, y: c.y, cooldown: 0, upgrade: null });
  return true;
}

/**
 * Buy one upgrade branch for a placed tower.
 *
 * Mirrors placeTower: validate, deduct, mutate. Branches are exclusive and
 * there is no refund, so an already-upgraded tower is refused rather than
 * silently re-specced.
 */
export function canUpgrade(w: World, t: Tower, id: UpgradeId): boolean {
  if (t.upgrade !== null) return false;
  const up = UPGRADES[id];
  if (up.towerId !== t.def) return false;
  return w.gold >= up.cost;
}

export function upgradeTower(w: World, t: Tower, id: UpgradeId): boolean {
  if (!canUpgrade(w, t, id)) return false;
  w.gold -= UPGRADES[id].cost;
  t.upgrade = id;
  // Take effect on the next shot rather than refunding the current cooldown.
  return true;
}

/** The two branches a tower could still take. Empty once it has taken one. */
export function availableUpgrades(t: Tower) {
  return t.upgrade === null ? upgradesFor(t.def) : [];
}

export function startWave(w: World): boolean {
  if (w.status !== 'idle' || w.waveIndex >= WAVES.length) return false;
  const wave = WAVES[w.waveIndex]!;
  w.spawnQueue = [];
  for (const g of wave.groups) {
    for (let i = 0; i < g.count; i++) {
      w.spawnQueue.push({ at: w.tick + g.delay + i * g.gap, state: g.state });
    }
  }
  w.spawnQueue.sort((a, b) => a.at - b.at);
  w.status = 'running';
  return true;
}

// --- simulation -------------------------------------------------------------

function spawnCharge(w: World, state: State, dist: number): Charge {
  const c: Charge = {
    id: w.nextId++,
    state,
    dist,
    hp: STATES[state].hp,
    speedMult: 1,
    alive: true,
    flash: 0,
  };
  w.charges.push(c);
  return c;
}

function award(w: World, gold: number): void {
  w.gold += gold;
  w.stats.goldEarned += gold;
}

function emit(w: World, type: SimEvent['type'], c: Charge, text?: string): void {
  const p = pointAt(c.dist);
  w.events.push({ type, x: p.x, y: p.y, state: c.state, ...(text ? { text } : {}) });
}

/**
 * Break the layer a charge is currently wearing.
 *
 * Either the charge is finished, or what is underneath steps into its place at
 * the same point on the lane -- possibly more than one of them. This is the
 * whole cascade: a Crystal shell becomes two Molten cores, each of which
 * becomes a Slag remnant, so one charge is five payouts and three different
 * resistance profiles on its way down the lane.
 *
 * The chain is declared in STATES and is strictly inward, so this terminates
 * however it is called -- there is no cell anywhere that puts a layer back on.
 */
function breakLayer(w: World, c: Charge): void {
  const def = STATES[c.state];
  c.alive = false;
  award(w, def.bounty);
  w.stats.breaks++;
  emit(w, 'break', c, `+${def.bounty}`);

  const inner = def.breaksInto;
  if (inner === null) {
    w.stats.kills++;
    emit(w, 'kill', c);
    return;
  }

  for (let i = 0; i < def.childCount; i++) {
    // Children are nudged apart so a splash cannot clear a whole cascade with
    // one hit, and so the render does not stack them exactly on top of another.
    const offset = def.childCount === 1 ? 0 : w.rng.range(-12, 12);
    const child = spawnCharge(w, inner, Math.max(0, c.dist + offset));
    child.flash = FLASH_TICKS;
  }
}

/**
 * Land one hit on one charge.
 *
 * The only place damage is resolved. Every gameplay rule flows through the
 * resistance table and this function, which is why balance changes are table
 * edits rather than code edits -- do not special-case anything in tower code.
 */
export function applyElement(
  w: World,
  c: Charge,
  element: Element,
  damage: number,
  overrides?: ResistanceOverrides,
): void {
  if (!c.alive) return;
  const mult = resolveResistance(c.state, element, overrides);

  if (mult <= 0) {
    // Immunity. Counted rather than ignored: shots landing on something they
    // cannot hurt is the clearest signal that a build has no answer to a layer.
    w.stats.wasted++;
    emit(w, 'immune', c, 'immune');
    return;
  }

  c.hp -= damage * mult;
  c.flash = FLASH_TICKS;
  if (c.hp <= 0) {
    breakLayer(w, c);
  } else {
    emit(w, 'hit', c);
  }
}

function advanceCharges(w: World): void {
  for (const c of w.charges) {
    if (!c.alive) continue;
    if (c.flash > 0) c.flash--;
    c.dist += STATES[c.state].speed * c.speedMult;
    if (c.dist >= PATH_LENGTH) {
      c.alive = false;
      const cost = STATES[c.state].leakCost;
      w.lives -= cost;
      w.stats.leaks++;
      w.stats.leaksByState[c.state]++;
      w.stats.livesLost += cost;
      emit(w, 'leak', c, `-${cost}`);
    }
  }
}

function findTarget(w: World, t: Tower): Charge | undefined {
  const def = effective(t);
  const overrides = overridesOf(t);
  let best: Charge | undefined;
  for (const c of w.charges) {
    if (!c.alive) continue;
    if (def.groundOnly && STATES[c.state].floats) continue;
    // Towers hold fire rather than waste shots where the table says nothing
    // happens. Traps (speed, split) are NOT filtered -- those are the player's
    // mistake to notice.
    //
    // Resolved through the upgrade, so a branch that turns a cell into 'none'
    // also stops the tower shooting at it -- that is how the Kiln Forge stops
    // melting the player's own Crystal -- and one that turns 'none' into a
    // real outcome starts it.
    if (isImmune(c.state, def.element, overrides)) continue;
    const p = pointAt(c.dist);
    if (Math.hypot(p.x - t.x, p.y - t.y) > def.range) continue;
    // Target the charge furthest along the lane -- the most urgent one.
    if (!best || c.dist > best.dist) best = c;
  }
  return best;
}

function fireTowers(w: World): void {
  for (const t of w.towers) {
    if (t.cooldown > 0) {
      t.cooldown--;
      continue;
    }
    const target = findTarget(w, t);
    if (!target) continue;
    const def = effective(t);
    const overrides = overridesOf(t);
    t.cooldown = def.cooldown;
    w.projectiles.push({
      id: w.nextId++,
      x: t.x,
      y: t.y,
      targetId: target.id,
      element: def.element,
      damage: def.damage,
      speed: PROJECTILE_SPEED,
      splash: def.splash,
      color: def.color,
      ...(overrides ? { overrides } : {}),
    });
  }
}

function advanceProjectiles(w: World): void {
  for (const p of w.projectiles) {
    const target = w.charges.find((c) => c.id === p.targetId && c.alive);
    if (!target) {
      p.speed = -1; // marked for removal
      continue;
    }
    const tp = pointAt(target.dist);
    const dx = tp.x - p.x;
    const dy = tp.y - p.y;
    const d = Math.hypot(dx, dy);
    if (d <= IMPACT_RADIUS) {
      applyElement(w, target, p.element, p.damage, p.overrides);
      if (p.splash > 0) {
        for (const c of w.charges) {
          if (!c.alive || c.id === target.id) continue;
          const cp = pointAt(c.dist);
          if (Math.hypot(cp.x - tp.x, cp.y - tp.y) <= p.splash) applyElement(w, c, p.element, p.damage, p.overrides);
        }
      }
      p.speed = -1;
      continue;
    }
    p.x += (dx / d) * p.speed;
    p.y += (dy / d) * p.speed;
  }
  w.projectiles = w.projectiles.filter((p) => p.speed > 0);
}

/**
 * Advance the simulation exactly one tick (1/60 s).
 *
 * Takes no delta: rendering framerate must never influence outcomes, or the
 * headless sim and the browser would disagree about balance.
 */
export function step(w: World): void {
  if (w.status === 'won' || w.status === 'lost') return;
  w.events.length = 0;
  w.tick++;

  while (w.spawnQueue.length > 0 && w.spawnQueue[0]!.at <= w.tick) {
    spawnCharge(w, w.spawnQueue.shift()!.state, 0);
  }

  advanceCharges(w);
  fireTowers(w);
  advanceProjectiles(w);
  w.charges = w.charges.filter((c) => c.alive);

  if (w.lives <= 0) {
    w.lives = 0;
    w.status = 'lost';
    return;
  }

  if (w.status === 'running' && w.spawnQueue.length === 0 && w.charges.length === 0) {
    award(w, ECONOMY.roundClearBonus(w.waveIndex + 1));
    w.waveIndex++;
    w.status = w.waveIndex >= WAVES.length ? 'won' : 'idle';
  }
}
