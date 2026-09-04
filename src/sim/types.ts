import type { ResistanceOverrides } from './resistance.ts';

/** Matter states. Each is a layer an enemy can be wearing. See DESIGN.md. */
export type State = 'ORE' | 'SLAG' | 'MOLTEN' | 'CRYSTAL' | 'VAPOR';

/** What towers apply. A tower's element decides what it is good against. */
export type Element = 'HEAT' | 'COLD' | 'KINETIC' | 'SOLVENT';

export const STATE_IDS: State[] = ['ORE', 'SLAG', 'MOLTEN', 'CRYSTAL', 'VAPOR'];
export const ELEMENT_IDS: Element[] = ['HEAT', 'COLD', 'KINETIC', 'SOLVENT'];

export interface StateDef {
  label: string;
  /** Pixels travelled per tick at speedMult 1. The sim runs at 60 ticks/sec. */
  speed: number;
  /** Lives lost if a charge wearing this layer reaches the end. */
  leakCost: number;
  /** Floating layers ignore ground-only towers entirely. */
  floats: boolean;
  /** Damage this layer absorbs before it breaks. */
  hp: number;
  /** Paid when this layer breaks. */
  bounty: number;
  /**
   * What is underneath. Breaking a layer reveals the next one at the same
   * point on the lane rather than killing the charge -- a Crystal shell breaks
   * to a Molten core, which cools to Slag, which is the last of it.
   *
   * The chain is finite and declared here, so a charge can never regress or
   * loop: five entities is the most one Crystal can ever become.
   */
  breaksInto: State | null;
  /** How many of the inner layer appear. More than one gives the cascade. */
  childCount: number;
  /**
   * The colour this layer is drawn in.
   *
   * Presentational, but it obeys a rule that comes from the resistance table:
   * **a layer is never painted in the hue of an element it is immune to.**
   * Colour is the fastest thing the eye reads, so a Molten drawn in Heat's own
   * orange and a Crystal drawn in Cold's own cyan -- both of which shipped for
   * a long time -- taught the exact opposite of the truth. Matching the
   * element that *beats* the layer is fine, and even useful.
   *
   * `tests/palette.test.ts` enforces it against RESISTANCE, so reintroducing
   * the bug fails rather than merely looking wrong.
   */
  color: string;
  /** Drawn radius in px. */
  radius: number;
}

export const STATES: Record<State, StateDef> = {
  ORE: {
    label: 'Ore',
    speed: 1.0,
    leakCost: 1,
    floats: false,
    hp: 12,
    bounty: 2,
    breaksInto: 'SLAG',
    childCount: 1,
    color: '#a3866a',
    radius: 11,
  },
  SLAG: {
    label: 'Ash',
    speed: 1.4,
    leakCost: 1,
    floats: false,
    hp: 6,
    bounty: 1,
    breaksInto: null,
    childCount: 0,
    color: '#9aa7ad',
    radius: 10,
  },
  MOLTEN: {
    label: 'Lava',
    speed: 1.8,
    leakCost: 2,
    floats: false,
    hp: 14,
    bounty: 3,
    breaksInto: 'SLAG',
    childCount: 1,
    color: '#e42a18',
    radius: 9,
  },
  CRYSTAL: {
    label: 'Crystal',
    speed: 0.9,
    leakCost: 2,
    floats: false,
    hp: 22,
    bounty: 4,
    // The cascade: one Crystal is 22 hp of shell over two Molten cores, each
    // with its own Slag underneath. Five entities and three resistance
    // profiles out of a single charge.
    breaksInto: 'MOLTEN',
    childCount: 2,
    color: '#b183ff',
    radius: 12,
  },
  VAPOR: {
    label: 'Gas',
    speed: 2.4,
    leakCost: 3,
    floats: true,
    hp: 10,
    bounty: 3,
    breaksInto: null,
    childCount: 0,
    color: '#f5e07a',
    radius: 13,
  },
};

export interface Charge {
  id: number;
  /** The layer currently showing. Resistances and speed come from this. */
  state: State;
  /** Distance travelled along the path, in pixels. */
  dist: number;
  /**
   * Where `dist` puts this charge on the lane -- derived, never a source of
   * truth. Kept because `pointAt` was being called per charge per tower in
   * findTarget, then again per projectile, per splash candidate and per
   * emitted event, and it scans the lane's segments and allocates a fresh
   * point on every call.
   *
   * Maintained wherever `dist` is written, which is exactly three places:
   * `spawnCharge`, `advanceCharges` and the Kinetic shove in `applyRider`.
   * The shove is the awkward one -- it moves a charge mid-tick, after towers
   * have fired, so the splash loop later in the same tick has to see the new
   * position. `tests/sim.test.ts` asserts the invariant every tick of a whole
   * campaign rather than trusting this comment.
   */
  x: number;
  y: number;
  /** Damage this layer can still absorb. */
  hp: number;
  /**
   * Toughness multiplier, inherited by every layer underneath.
   *
   * One dial serves two purposes: a boss is a deep stack at a high scale, and
   * freeplay past the authored rounds is the same dial turned by a formula.
   * Scaling HP rather than adding enemy types keeps the resistance table at
   * exactly twenty cells.
   */
  scale: number;
  /**
   * Movement multiplier, derived from `chillTicks` every tick.
   *
   * Never written directly. `advanceEffects()` owns it, so there is one place
   * that decides how fast anything walks.
   */
  speedMult: number;
  alive: boolean;
  /** Ticks of visual highlight remaining. Render-only, but kept deterministic. */
  flash: number;

  /**
   * Riders in progress. See `riders.ts` for what applies them.
   *
   * Flat numbers rather than nested objects, matching `flash` and `speedMult`:
   * a charge stays a plain record that a test can read a field off, and the
   * sim stays free of allocation per hit.
   *
   * Damage is stored already resolved against the table, snapshotted when the
   * hit landed -- the same discipline `Projectile.overrides` uses. A tick of
   * burn must never re-enter the table, or it would re-apply its own rider and
   * refresh itself forever.
   */
  chillTicks: number;
  /** Fraction of speed removed while chilled, capped at MAX_CHILL. */
  chillFactor: number;
  burnTicks: number;
  /** Resolved damage per tick. */
  burnDamage: number;
  corrodeTicks: number;
  /** Resolved damage per tick. Inherited by children when the layer breaks. */
  corrodeDamage: number;
  /** Ticks until this charge may be shoved again, whatever hits it. */
  shoveCd: number;
}

export interface Tower {
  id: number;
  def: TowerId;
  /** Pixel centre. */
  x: number;
  y: number;
  /** Ticks until this tower may fire again. */
  cooldown: number;
  /**
   * The path this tower has climbed, lowest tier first.
   *
   * A tower commits to one of its two paths and then walks up it; it can never
   * take a tier from the other. Stored as the history rather than just the top
   * tier so that stats and table overrides can be folded in order, with later
   * tiers winning.
   */
  upgrades: UpgradeId[];
}

export type TowerId = 'forge' | 'chiller' | 'stamp' | 'vat' | 'lens';

/**
 * Upgrade ids: two paths of three tiers per tower.
 *
 * Declared here rather than in upgrades.ts so that `Tower` can name one
 * without dragging the upgrade data into the type layer.
 */
export type UpgradeId =
  | 'kiln1' | 'kiln2' | 'kiln3'
  | 'bellows1' | 'bellows2' | 'bellows3'
  | 'depo1' | 'depo2' | 'depo3'
  | 'super1' | 'super2' | 'super3'
  | 'damp1' | 'damp2' | 'damp3'
  | 'die1' | 'die2' | 'die3'
  | 'recl1' | 'recl2' | 'recl3'
  | 'cat1' | 'cat2' | 'cat3'
  | 'focus1' | 'focus2' | 'focus3'
  | 'prism1' | 'prism2' | 'prism3';

export interface TowerDef {
  id: TowerId;
  name: string;
  element: Element;
  cost: number;
  /** Damage per hit, before the target's resistance multiplier. */
  damage: number;
  /** Pixels. */
  range: number;
  /** Ticks between shots. */
  cooldown: number;
  /** Ground-only towers cannot target floating layers. */
  groundOnly: boolean;
  /** If set, the hit also lands on every charge within this radius. */
  splash: number;
  color: string;
  blurb: string;
}

export interface Projectile {
  id: number;
  x: number;
  y: number;
  targetId: number;
  element: Element;
  damage: number;
  speed: number;
  splash: number;
  color: string;
  /**
   * The firing tower's resistance overrides, snapshotted at fire time.
   *
   * Damage application never learns which tower fired -- a projectile already
   * carries copies of its element, damage, splash and colour rather than a
   * reference back to its tower. Overrides follow that pattern, which keeps a
   * shot's behaviour fixed at the moment it was fired and survives the tower
   * being removed mid-flight.
   */
  overrides?: ResistanceOverrides;
}

export type SimEventType = 'hit' | 'break' | 'kill' | 'leak' | 'immune';

export interface SimEvent {
  type: SimEventType;
  x: number;
  y: number;
  state: State;
  text?: string;
}

export type Status = 'idle' | 'running' | 'won' | 'lost';

export interface Stats {
  /** Layers broken, including the final one. */
  breaks: number;
  /** Charges fully destroyed -- the last layer gone. */
  kills: number;
  /** Shots that landed on something immune to that element. */
  wasted: number;
  leaks: number;
  /** Which layers got through -- the single most useful balance diagnostic. */
  leaksByState: Record<State, number>;
  livesLost: number;
  goldEarned: number;
}
