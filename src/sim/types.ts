/** Matter states. See DESIGN.md for the design rationale behind each. */
export type State = 'ORE' | 'SLAG' | 'MOLTEN' | 'CRYSTAL' | 'VAPOR';

/** What towers apply. Towers never deal damage directly -- they apply an element. */
export type Element = 'HEAT' | 'COLD' | 'KINETIC' | 'SOLVENT';

export const STATE_IDS: State[] = ['ORE', 'SLAG', 'MOLTEN', 'CRYSTAL', 'VAPOR'];
export const ELEMENT_IDS: Element[] = ['HEAT', 'COLD', 'KINETIC', 'SOLVENT'];

export interface StateDef {
  label: string;
  /** Pixels travelled per tick at speedMult 1. The sim runs at 60 ticks/sec. */
  speed: number;
  /** Lives lost if a charge in this state reaches the end. */
  leakCost: number;
  /** Floating states ignore ground-only towers entirely. */
  floats: boolean;
  /** Hits absorbed by 'damage' outcomes (chipping Ore, dissolving Vapor). */
  integrity: number;
  color: string;
  /** Drawn radius in px. */
  radius: number;
}

export const STATES: Record<State, StateDef> = {
  ORE: { label: 'Ore', speed: 1.1, leakCost: 1, floats: false, integrity: 8, color: '#8c7b6b', radius: 11 },
  SLAG: { label: 'Slag', speed: 1.0, leakCost: 1, floats: false, integrity: 3, color: '#5f5a55', radius: 10 },
  MOLTEN: { label: 'Molten', speed: 2.2, leakCost: 2, floats: false, integrity: 3, color: '#ff6b35', radius: 9 },
  CRYSTAL: { label: 'Crystal', speed: 0.65, leakCost: 1, floats: false, integrity: 4, color: '#7fd8ff', radius: 12 },
  VAPOR: { label: 'Vapor', speed: 2.5, leakCost: 3, floats: true, integrity: 4, color: '#c9b6ff', radius: 13 },
};

export interface Charge {
  id: number;
  state: State;
  /** Distance travelled along the path, in pixels. */
  dist: number;
  integrity: number;
  speedMult: number;
  /**
   * How many more times this charge's lineage may split. Spawned charges get 1;
   * their children get 0. Without this bound a Stamp parked on a Molten stream
   * would multiply enemies exponentially and headless runs would never finish.
   */
  splits: number;
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
}

export type TowerId = 'forge' | 'chiller' | 'stamp' | 'vat';

export interface TowerDef {
  id: TowerId;
  name: string;
  element: Element;
  cost: number;
  /** Pixels. */
  range: number;
  /** Ticks between shots. */
  cooldown: number;
  /** Ground-only towers cannot target floating states. */
  groundOnly: boolean;
  /** If set, the element is applied to every charge within this radius of impact. */
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
  speed: number;
  splash: number;
  color: string;
}

export type SimEventType = 'transmute' | 'destroy' | 'shatter' | 'split' | 'leak' | 'nothing';

export interface SimEvent {
  type: SimEventType;
  x: number;
  y: number;
  state: State;
  text?: string;
}

export type Status = 'idle' | 'running' | 'won' | 'lost';

export interface Stats {
  transmutes: number;
  splits: number;
  shatters: number;
  kills: number;
  leaks: number;
  livesLost: number;
  goldEarned: number;
}
