import { ECONOMY } from './economy.ts';
import { PATH_LENGTH, isBuildableCell, cellCentre, pointAt } from './path.ts';
import { Rng } from './rng.ts';
import { isImmune, resolveResistance } from './resistance.ts';
import type { ResistanceOverrides } from './resistance.ts';
import { MAX_CHILL, RIDERS, perTick } from './riders.ts';
import { TOWERS } from './towers.ts';
import { UPGRADES, pathsFor, tiersOf } from './upgrades.ts';
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
import { AUTHORED_ROUNDS, waveAt } from './freeplay.ts';

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
  /** Index of the round now running, or the one about to start. */
  waveIndex: number;
  /** When set, rounds continue past the authored campaign instead of winning. */
  freeplay: boolean;
  spawnQueue: { at: number; state: State; scale: number }[];
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
    freeplay: false,
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
 * A tower's stats with its whole upgrade path folded in.
 *
 * Numeric tiers are a shallow patch over the tower's own def. Keeping this in
 * one place means firing code never has to know whether a tower is upgraded --
 * and it is exported so the upgrade panel can show a genuine before-and-after
 * rather than recomputing the fold and drifting from it.
 */
export function effective(t: Tower): { element: Element; damage: number; range: number; cooldown: number; splash: number; groundOnly: boolean; color: string } {
  const def = TOWERS[t.def];
  // Fold the path in order so a later tier wins over an earlier one. Tiers are
  // cumulative: tier 3 need not restate what tier 1 already changed.
  const stats: NonNullable<(typeof UPGRADES)[UpgradeId]['stats']> = {};
  for (const id of t.upgrades) Object.assign(stats, UPGRADES[id].stats ?? {});
  return {
    element: def.element,
    damage: stats.damage ?? def.damage,
    range: stats.range ?? def.range,
    cooldown: stats.cooldown ?? def.cooldown,
    splash: stats.splash ?? def.splash,
    groundOnly: def.groundOnly,
    color: def.color,
  };
}

/**
 * The table cells this tower rewrites, folded across its whole path.
 *
 * Exported because the Matter panel has to answer the same question the
 * simulation does -- what does this tower actually do to that cell -- and two
 * folds of the same upgrade list would be two chances to disagree.
 */
export function overridesOf(t: Pick<Tower, 'upgrades'>): ResistanceOverrides | undefined {
  if (t.upgrades.length === 0) return undefined;
  const out: ResistanceOverrides = {};
  for (const id of t.upgrades) {
    for (const [state, row] of Object.entries(UPGRADES[id].overrides ?? {})) {
      out[state as State] = { ...out[state as State], ...row };
    }
  }
  return out;
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
  w.towers.push({ id: w.nextId++, def, x: c.x, y: c.y, cooldown: 0, upgrades: [] });
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
  const up = UPGRADES[id];
  if (up.towerId !== t.def) return false;
  // Two rules, and only two: the next tier up, and never the other path.
  const taken = t.upgrades.map((u) => UPGRADES[u]);
  const path = taken[0]?.path;
  if (path !== undefined && path !== up.path) return false;
  if (up.tier !== taken.length + 1) return false;
  return w.gold >= up.cost;
}

export function upgradeTower(w: World, t: Tower, id: UpgradeId): boolean {
  if (!canUpgrade(w, t, id)) return false;
  w.gold -= UPGRADES[id].cost;
  t.upgrades.push(id);
  // Takes effect on the next shot rather than refunding the current cooldown.
  return true;
}

/**
 * What this tower could buy next: the following tier of the path it is on, or
 * the first tier of either path if it has not committed yet.
 */
export function availableUpgrades(t: Tower) {
  const taken = t.upgrades.map((u) => UPGRADES[u]);
  const path = taken[0]?.path;
  const paths = path !== undefined ? [path] : pathsFor(t.def);
  return paths
    .map((pth) => tiersOf(t.def, pth)[taken.length])
    .filter((u): u is NonNullable<typeof u> => u !== undefined);
}

/**
 * Continue past a finished campaign into freeplay.
 *
 * Gated on `'won'` because freeplay is a continuation of a completed run, not
 * a difficulty setting chosen up front -- the authored campaign has to stay
 * the thing that ends. `waveIndex` is already 20 by the time a run can be
 * `'won'`, and `waveAt` already answers round 21 for it, so there is nothing
 * else to touch.
 */
export function enterFreeplay(w: World): boolean {
  if (w.status !== 'won') return false;
  w.freeplay = true;
  w.status = 'idle';
  return true;
}

export function startWave(w: World): boolean {
  if (w.status !== 'idle') return false;
  if (!w.freeplay && w.waveIndex >= AUTHORED_ROUNDS) return false;
  const wave = waveAt(w.waveIndex, w.rng);
  w.spawnQueue = [];
  for (const g of wave.groups) {
    for (let i = 0; i < g.count; i++) {
      w.spawnQueue.push({ at: w.tick + g.delay + i * g.gap, state: g.state, scale: g.hpScale ?? 1 });
    }
  }
  w.spawnQueue.sort((a, b) => a.at - b.at);
  w.status = 'running';
  return true;
}

// --- simulation -------------------------------------------------------------

/**
 * Put one charge on the lane.
 *
 * Exported because it is the only place that knows the full shape of a
 * `Charge`. Tests used to build the literal themselves and drifted every time
 * a field was added; now there is one constructor and adding a rider field
 * cannot silently leave a test charge half-initialised.
 */
export function spawnCharge(w: World, state: State, dist: number, scale = 1): Charge {
  const c: Charge = {
    id: w.nextId++,
    state,
    dist,
    hp: STATES[state].hp * scale,
    scale,
    speedMult: 1,
    alive: true,
    flash: 0,
    chillTicks: 0,
    chillFactor: 0,
    burnTicks: 0,
    burnDamage: 0,
    corrodeTicks: 0,
    corrodeDamage: 0,
    shoveCd: 0,
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
  // A tougher charge is worth more, but sub-linearly: paying full multiples
  // meant a heavy round funded the towers that beat it, which is the same trap
  // that made wave size useless as a difficulty dial. Square root keeps a slab
  // worth killing without letting late rounds pay for themselves.
  award(w, Math.max(1, Math.round(def.bounty * Math.sqrt(c.scale))));
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
    const child = spawnCharge(w, inner, Math.max(0, c.dist + offset), c.scale);
    child.flash = FLASH_TICKS;
    // Corrosion is the one rider that survives a break. Solvent strips what it
    // touches all the way down, so a wash over a Crystal keeps eating both
    // Molten cores that climb out of it -- the Vat's payoff for depth, and the
    // only rider that knows the layer system exists. Chill and burn do not
    // transfer: they were applied to a shell that is now gone.
    //
    // The damage carried across is already resolved against the *parent's*
    // layer. Re-resolving it here would need a firing element this function
    // does not have, and snapshotting is the same rule projectiles follow.
    child.corrodeTicks = c.corrodeTicks;
    child.corrodeDamage = c.corrodeDamage;
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

  damageDirect(w, c, damage * mult);
  // The lingering half of the hit, at the same strength the table just gave
  // the damage. Applied after, so a charge the shot already broke does not
  // catch fire on its way out.
  if (c.alive) applyRider(w, c, element, mult);
}

/**
 * Take hp off a charge and break the layer if that finished it.
 *
 * Separated from `applyElement` because damage-over-time must never re-enter
 * the table: resolving a burn tick would re-apply Heat's rider, which would
 * refresh the burn, which would burn forever. Riders resolve once, when the
 * hit lands, and tick as flat numbers afterwards.
 *
 * Everything still funnels into `breakLayer`, so a charge finished by a burn
 * pays its bounty and emits its events exactly like one finished by a shot.
 */
function damageDirect(w: World, c: Charge, amount: number): void {
  if (!c.alive) return;
  c.hp -= amount;
  c.flash = FLASH_TICKS;
  if (c.hp <= 0) {
    breakLayer(w, c);
  } else {
    emit(w, 'hit', c);
  }
}

/**
 * Apply the element's rider, scaled by the resistance cell that scaled the hit.
 *
 * Only reached with `mult > 0`, so immunity blocks the rider as surely as it
 * blocks the damage -- Crystal is never chilled, Vapor is never shoved, and
 * neither needs a line of code saying so.
 *
 * None of the three timed riders stack. A second application takes the
 * stronger value and refreshes the clock, so massing one tower buys coverage
 * and rate, never a charge frozen solid or dissolving at ten times speed.
 */
function applyRider(w: World, c: Charge, element: Element, mult: number): void {
  const rider = RIDERS[element];
  switch (rider.kind) {
    case 'chill': {
      c.chillFactor = Math.min(MAX_CHILL, Math.max(c.chillFactor, rider.factor * mult));
      c.chillTicks = Math.max(c.chillTicks, rider.ticks);
      return;
    }
    case 'ignite': {
      c.burnDamage = Math.max(c.burnDamage, perTick(rider.dps) * mult);
      c.burnTicks = Math.max(c.burnTicks, rider.ticks);
      return;
    }
    case 'corrode': {
      c.corrodeDamage = Math.max(c.corrodeDamage, perTick(rider.dps) * mult);
      c.corrodeTicks = Math.max(c.corrodeTicks, rider.ticks);
      return;
    }
    case 'shove': {
      // Per *charge*, not per tower: a bank of Stamps cannot chain shoves into
      // a stall-lock however many of them have the target in range. Cold owns
      // throughput; Kinetic only owns position.
      if (c.shoveCd > 0) return;
      c.shoveCd = rider.cooldown;
      // Heavy things do not fly backwards. A slab that could be pushed around
      // is a slab that never arrives, and toughness is the dial every boss and
      // every freeplay round is built out of.
      c.dist = Math.max(0, c.dist - (rider.pixels * mult) / Math.sqrt(c.scale));
      return;
    }
  }
}

/**
 * Tick every rider in progress, before anything moves.
 *
 * Ordered first in `step()` so a chill applied last tick is already in
 * `speedMult` when `advanceCharges` reads it. Fixed rather than incidental:
 * the browser and the headless harness have to agree about balance, so the
 * order effects resolve in cannot be an accident of where a call sits.
 */
function advanceEffects(w: World): void {
  // Snapshot, because a burn or corrode tick that breaks a layer pushes the
  // children onto w.charges. Iterating the live array meant those children
  // took their own inherited corrode tick inside the same tick that created
  // them -- five breaks out of one step(). A rider resolves once per tick,
  // and a layer born this tick starts ticking on the next one.
  for (const c of [...w.charges]) {
    if (!c.alive) continue;
    if (c.shoveCd > 0) c.shoveCd--;

    // speedMult is derived, never assigned from outside. One owner, so there
    // is exactly one answer to "why is this thing walking at this speed".
    if (c.chillTicks > 0) {
      c.chillTicks--;
      c.speedMult = 1 - c.chillFactor;
      if (c.chillTicks === 0) c.chillFactor = 0;
    } else {
      c.speedMult = 1;
    }

    if (c.burnTicks > 0) {
      c.burnTicks--;
      damageDirect(w, c, c.burnDamage);
      if (!c.alive) continue;
    }

    if (c.corrodeTicks > 0) {
      c.corrodeTicks--;
      damageDirect(w, c, c.corrodeDamage);
    }
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

/**
 * The charge this tower should shoot, or none.
 *
 * Takes the resolved stats rather than resolving them, because `fireTowers`
 * needs the same two values for the same tower on the same tick and both
 * allocate -- `effective` a fresh object every call, `overridesOf` another
 * whenever the tower has upgrades. Resolving twice per tower per tick was most
 * of why `fireTowers` and the collector between them cost a fifth of the
 * simulation's time.
 */
function findTarget(
  w: World,
  t: Tower,
  def: ReturnType<typeof effective>,
  overrides: ResistanceOverrides | undefined,
): Charge | undefined {
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
    // Squared, both sides. This is a threshold, so the square root is thrown
    // away either way, and it is the single hottest comparison in the sim --
    // every tower against every charge, every tick, and a tower that finds no
    // legal target never takes a cooldown and so rescans forever.
    const dx = p.x - t.x;
    const dy = p.y - t.y;
    if (dx * dx + dy * dy > def.range * def.range) continue;
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
    const def = effective(t);
    const overrides = overridesOf(t);
    const target = findTarget(w, t, def, overrides);
    if (!target) continue;
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
    // Compared squared, then rooted only on the branch that actually needs the
    // distance -- the projectile's movement vector divides by it, the impact
    // test does not.
    const dSq = dx * dx + dy * dy;
    if (dSq <= IMPACT_RADIUS * IMPACT_RADIUS) {
      // Who this splash may hit is decided before the hit lands, and never
      // again. breakLayer pushes children onto w.charges, so walking the live
      // array meant a splash hit the very layers it had just exposed -- and
      // then theirs, and then theirs: one shot beside a Crystal produced seven
      // breaks and three kills, clearing the whole stack. That is the property
      // the nudge in breakLayer claims to protect and never could, at +-12px
      // against a splash of 36 to 64.
      //
      // Snapshotting also settles a determinism hazard the architecture test
      // cannot see: which charges a splash caught depended on where children
      // happened to land in the array mid-loop.
      const candidates = p.splash > 0 ? [...w.charges] : null;
      applyElement(w, target, p.element, p.damage, p.overrides);
      if (candidates) {
        for (const c of candidates) {
          if (!c.alive || c.id === target.id) continue;
          const cp = pointAt(c.dist);
          const sx = cp.x - tp.x;
          const sy = cp.y - tp.y;
          if (sx * sx + sy * sy <= p.splash * p.splash) {
            applyElement(w, c, p.element, p.damage, p.overrides);
          }
        }
      }
      p.speed = -1;
      continue;
    }
    const d = Math.sqrt(dSq);
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
    const next = w.spawnQueue.shift()!;
    spawnCharge(w, next.state, 0, next.scale);
  }

  advanceEffects(w);
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
    // Clearing the authored campaign is the win. Freeplay carries on past it
    // for depth rather than for victory, so the run has an ending as well as
    // a tail.
    const done = w.waveIndex >= AUTHORED_ROUNDS && !w.freeplay;
    w.status = done ? 'won' : 'idle';
  }
}
