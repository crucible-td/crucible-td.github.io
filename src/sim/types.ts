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
    color: '#8c7b6b',
    radius: 11,
  },
  SLAG: {
    label: 'Slag',
    speed: 1.4,
    leakCost: 1,
    floats: false,
    hp: 6,
    bounty: 1,
    breaksInto: null,
    childCount: 0,
    color: '#5f5a55',
    radius: 10,
  },
  MOLTEN: {
    label: 'Molten',
    speed: 1.8,
    leakCost: 2,
    floats: false,
    hp: 14,
    bounty: 3,
    breaksInto: 'SLAG',
    childCount: 1,
    color: '#ff6b35',
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
    color: '#7fd8ff',
    radius: 12,
  },
  VAPOR: {
    label: 'Vapor',
    speed: 2.4,
    leakCost: 3,
    floats: true,
    hp: 10,
    bounty: 3,
    breaksInto: null,
    childCount: 0,
    color: '#c9b6ff',
    radius: 13,
  },
};

export interface Charge {
  id: number;
  /** The layer currently showing. Resistances and speed come from this. */
  state: State;
  /** Distance travelled along the path, in pixels. */
  dist: number;
  /** Damage this layer can still absorb. */
  hp: number;
  speedMult: number;
  alive: boolean;
  /** Ticks of visual highlight remaining. Render-only, but kept deterministic. */
  flash: number;
}

export interface Tower {
  id: number;
  def: TowerId;
  /** Pixel centre. */
  x: number;
  y: number;
  /** Ticks until this tower may fire again. */
  cooldown: number;
  /** The one branch this tower has taken, if any. Branches are exclusive. */
  upgrade: UpgradeId | null;
}

export type TowerId = 'forge' | 'chiller' | 'stamp' | 'vat' | 'lens';

/** Upgrade branch ids. Two per tower, mutually exclusive. */
export type UpgradeId =
  | 'kiln'
  | 'bellows'
  | 'deposition'
  | 'supercooled'
  | 'dampened'
  | 'wideDie'
  | 'reclaimer'
  | 'catalyst'
  | 'focus'
  | 'prism';

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
