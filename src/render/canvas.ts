/**
 * Draws a World. Strictly read-only: rendering never mutates simulation state,
 * which is what lets the same World run identically with no canvas at all.
 */
import { BOARD, PATH_POINTS, cellCentre, isBuildableCell, pointAt } from '../sim/path.ts';
import { MONSTER_ART, MONSTER_SCALE, TOWER_ART, paintArt } from './art.ts';
import { TOWERS } from '../sim/towers.ts';
import { UPGRADES } from '../sim/upgrades.ts';
import { STATES } from '../sim/types.ts';
import type { Charge, SimEvent, Tower, TowerId, UpgradeId } from '../sim/types.ts';
import { towerAt } from '../sim/world.ts';
import type { World } from '../sim/world.ts';

interface Floater {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
}

interface Burst {
  x: number;
  y: number;
  color: string;
  life: number;
  max: number;
}

const FLOATER_LIFE = 46;
const BURST_LIFE = 18;

const EVENT_STYLE: Record<SimEvent['type'], string> = {
  hit: '#efe6dc',
  break: '#9ae66e',
  kill: '#7fd8ff',
  leak: '#ff5a5a',
  immune: '#ff9d5c',
};

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private floaters: Floater[] = [];
  private bursts: Burst[] = [];
  /**
   * Firing is detected here rather than announced by the simulation.
   *
   * A tower's cooldown counts down and is reset the moment it shoots, so a
   * cooldown that went *up* since the last frame means a shot was fired. The
   * alternative -- emitting a sim event per shot -- would be consistent with
   * how hits are reported, but it is thousands of throwaway objects per
   * headless campaign and `npm run diversity` runs hundreds of them.
   * Presentation stays in the render layer, as the speed control does.
   */
  private lastCooldown = new Map<number, number>();
  private recoil = new Map<number, number>();

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas 2d context unavailable');
    this.ctx = ctx;
  }

  /** Turn this tick's simulation events into visual feedback. */
  ingest(events: SimEvent[]): void {
    for (const e of events) {
      const color = EVENT_STYLE[e.type];
      if (e.text) this.floaters.push({ x: e.x, y: e.y, text: e.text, color, life: FLOATER_LIFE });
      // A plain hit is already shown by the charge's own flash; a burst for
      // every tick of damage would bury the events that matter.
      if (e.type !== 'hit') {
        this.bursts.push({ x: e.x, y: e.y, color, life: BURST_LIFE, max: BURST_LIFE });
      }
    }
  }

  draw(
    world: World,
    hover: { col: number; row: number } | null,
    selected: TowerId | null,
    inspected: Tower | null = null,
    previewUpgrade: UpgradeId | null = null,
  ): void {
    const { ctx } = this;
    ctx.clearRect(0, 0, BOARD.width, BOARD.height);
    ctx.fillStyle = '#14110f';
    ctx.fillRect(0, 0, BOARD.width, BOARD.height);

    this.drawBuildableCells();
    this.drawLane();
    if (hover && selected) this.drawPlacementPreview(world, hover, selected);

    // Show the reach of a tower that is already down: the one being inspected,
    // or whichever one the cursor is over. Range is the whole reason placement
    // matters, so it should not be visible only in the second before you
    // commit to a spot.
    const hovered = hover && !selected ? (towerAt(world, hover.col, hover.row) ?? null) : null;
    const showRange = inspected ?? hovered;
    if (showRange) this.drawRange(showRange, showRange === inspected ? previewUpgrade : null);

    for (const t of world.towers) {
      const was = this.lastCooldown.get(t.id) ?? 0;
      if (t.cooldown > was) this.recoil.set(t.id, 1);
      this.lastCooldown.set(t.id, t.cooldown);

      const kick = this.recoil.get(t.id) ?? 0;
      this.drawTower(t.x, t.y, t.def, 1, t.upgrades.length, t.id === inspected?.id, kick);
      if (kick > 0) this.recoil.set(t.id, Math.max(0, kick - 0.16));
    }
    for (const c of world.charges) this.drawCharge(c);
    this.drawProjectiles(world);
    this.drawEffects();
  }

  private drawBuildableCells(): void {
    const { ctx } = this;
    ctx.fillStyle = 'rgba(239, 230, 220, 0.05)';
    for (let col = 0; col < BOARD.cols; col++) {
      for (let row = 0; row < BOARD.rows; row++) {
        if (!isBuildableCell(col, row)) continue;
        const c = cellCentre(col, row);
        ctx.fillRect(c.x - 1.5, c.y - 1.5, 3, 3);
      }
    }
  }

  private drawLane(): void {
    const { ctx } = this;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.strokeStyle = '#2b2420';
    ctx.lineWidth = 46;
    this.tracePath();
    ctx.stroke();

    ctx.strokeStyle = '#221d19';
    ctx.lineWidth = 38;
    this.tracePath();
    ctx.stroke();

    // Direction of travel, so the ordering of towers reads at a glance.
    ctx.strokeStyle = 'rgba(255, 140, 66, 0.16)';
    ctx.lineWidth = 2;
    ctx.setLineDash([9, 16]);
    this.tracePath();
    ctx.stroke();
    ctx.setLineDash([]);

    const end = PATH_POINTS[PATH_POINTS.length - 1]!;
    ctx.fillStyle = 'rgba(255, 90, 90, 0.5)';
    ctx.fillRect(end.x - 26, end.y - 23, 26, 46);
  }

  private tracePath(): void {
    const { ctx } = this;
    ctx.beginPath();
    ctx.moveTo(PATH_POINTS[0]!.x, PATH_POINTS[0]!.y);
    for (let i = 1; i < PATH_POINTS.length; i++) ctx.lineTo(PATH_POINTS[i]!.x, PATH_POINTS[i]!.y);
  }

  /** The reach of a tower already on the board, in its own colour. */
  /**
   * The reach of a tower already on the board, in its own colour.
   *
   * When an upgrade is being hovered in the panel, the reach it *would* give is
   * drawn as a second ring with the gain shaded between them. Range is the one
   * upgrade effect that cannot be read from a line of text, so it is worth
   * showing before the player commits gold to a path they cannot refund.
   */
  private drawRange(t: Tower, preview: UpgradeId | null): void {
    const { ctx } = this;
    const def = TOWERS[t.def];
    let range = def.range;
    for (const id of t.upgrades) range = UPGRADES[id].stats?.range ?? range;
    const previewRange = preview ? (UPGRADES[preview].stats?.range ?? range) : range;

    ctx.save();
    ctx.fillStyle = def.color;
    ctx.strokeStyle = def.color;
    ctx.lineWidth = 1.5;

    // The gain, shaded as a ring between the two radii.
    if (previewRange > range) {
      ctx.globalAlpha = 0.1;
      ctx.beginPath();
      ctx.arc(t.x, t.y, previewRange, 0, Math.PI * 2);
      ctx.arc(t.x, t.y, range, 0, Math.PI * 2, true);
      ctx.fill('evenodd');

      ctx.globalAlpha = 0.75;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc(t.x, t.y, previewRange, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.globalAlpha = 0.5;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.arc(t.x, t.y, range, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 0.06;
    ctx.beginPath();
    ctx.arc(t.x, t.y, range, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private drawPlacementPreview(world: World, hover: { col: number; row: number }, selected: TowerId): void {
    const { ctx } = this;
    const def = TOWERS[selected];
    const c = cellCentre(hover.col, hover.row);
    const blocked = !isBuildableCell(hover.col, hover.row) || towerAt(world, hover.col, hover.row) !== undefined;
    const affordable = world.gold >= def.cost;
    const ok = !blocked && affordable;

    ctx.strokeStyle = ok ? 'rgba(154, 230, 110, 0.5)' : 'rgba(255, 90, 90, 0.5)';
    ctx.fillStyle = ok ? 'rgba(154, 230, 110, 0.07)' : 'rgba(255, 90, 90, 0.07)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(c.x, c.y, def.range, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.globalAlpha = 0.55;
    this.drawTower(c.x, c.y, selected, 0.55);
    ctx.globalAlpha = 1;
  }

  private drawTower(
    x: number,
    y: number,
    id: TowerId,
    alpha: number,
    tiers = 0,
    inspected = false,
    recoil = 0,
  ): void {
    const { ctx } = this;
    const def = TOWERS[id];
    const r = 15;

    // A ring around the tower whose panel is open, so the board and the panel
    // agree about which tower is being talked about.
    if (inspected) {
      ctx.strokeStyle = def.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(x - r - 4, y - r - 4, (r + 4) * 2, (r + 4) * 2, 7);
      ctx.stroke();
    }

    ctx.save();
    ctx.globalAlpha = alpha;
    // Firing kicks the tower back a little. Motion only where it carries
    // information -- the useful consequence is that a tower which never twitches
    // is visibly idle, which is exactly what a tower held up against a layer it
    // cannot hurt actually is.
    const size = 30 * (1 + recoil * 0.14);
    paintArt(ctx, TOWER_ART[id], x, y - recoil * 1.5, size, def.color);
    ctx.restore();

    // One pip per tier climbed, along the top edge. Paths are permanent and
    // three deep, so the board has to show how far each tower has committed --
    // not merely that it has.
    for (let i = 0; i < tiers; i++) {
      ctx.fillStyle = def.color;
      ctx.beginPath();
      ctx.arc(x + r - 3.5 - i * 7, y - r + 3.5, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** Each state gets its own silhouette, so a glance reads the whole lane. */
  private drawCharge(c: Charge): void {
    const { ctx } = this;
    const p = pointAt(c.dist);
    const s = STATES[c.state];

    // Size by toughness. A slab used to be drawn exactly like an ordinary
    // charge of the same layer, so the hardest thing in the game looked like
    // the easiest. Sub-linear and capped: a x14 slab must be unmistakable
    // without swallowing the lane.
    const toughness = Math.min(Math.sqrt(c.scale), 2.1);
    const size = s.radius * 2 * MONSTER_SCALE * toughness;
    const r = size / 2;

    if (c.state === 'MOLTEN') {
      const glow = ctx.createRadialGradient(p.x, p.y, 2, p.x, p.y, r * 1.8);
      glow.addColorStop(0, 'rgba(255, 107, 53, 0.42)');
      glow.addColorStop(1, 'rgba(255, 107, 53, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * 1.8, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.save();
    if (c.state === 'VAPOR') ctx.globalAlpha = 0.72;
    paintArt(ctx, MONSTER_ART[c.state], p.x, p.y, size, s.color, {
      outline: 'rgba(20, 17, 15, 0.85)',
      darkDetail: '#14110f',
    });
    ctx.restore();

    // Health bar, so wearing a layer down is visible progress -- and so a
    // tower plinking uselessly at something is visibly achieving nothing.
    const max = STATES[c.state].hp * c.scale;
    if (c.hp < max) {
      const w = r * 1.6;
      ctx.fillStyle = 'rgba(20, 17, 15, 0.8)';
      ctx.fillRect(p.x - w / 2, p.y - r - 6, w, 3);
      ctx.fillStyle = '#9ae66e';
      ctx.fillRect(p.x - w / 2, p.y - r - 6, (w * Math.max(0, c.hp)) / max, 3);
    }

    if (c.flash > 0) {
      ctx.strokeStyle = `rgba(255, 255, 255, ${c.flash / 8})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r + 4, 0, Math.PI * 2);
      ctx.stroke();
    }

    this.drawRiders(c, p.x, p.y, r);
  }

  /**
   * What is currently eating, freezing or burning this charge.
   *
   * Riders are invisible otherwise: a Molten core at half pace looks exactly
   * like a Molten core, and a player who cannot see the slow cannot learn that
   * putting a Chiller before the corner was the reason the round held. Each
   * tell borrows the colour of the tower that caused it, so the lane reads
   * back as which of your towers is doing the work.
   *
   * Read-only over the sim, like the rest of this file -- these fields tick in
   * `advanceEffects`, which is what keeps the browser and the headless harness
   * agreeing about what happened.
   */
  private drawRiders(c: Charge, x: number, y: number, r: number): void {
    const { ctx } = this;

    if (c.chillTicks > 0) {
      // A frost rim, opaque in proportion to how hard the charge is slowed --
      // so the difference between Cold on Molten and Cold on Ore is visible on
      // the lane rather than only in the resistance table.
      ctx.strokeStyle = `rgba(91, 200, 245, ${0.35 + c.chillFactor})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, r + 2, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (c.burnTicks > 0) {
      // Embers above the charge. Deterministic wobble from the charge id, not
      // Math.random: two runs of the same seed must draw the same frame.
      ctx.fillStyle = 'rgba(255, 140, 66, 0.85)';
      for (let i = 0; i < 3; i++) {
        const a = ((c.id * 37 + i * 120 + c.burnTicks * 4) % 360) * (Math.PI / 180);
        ctx.beginPath();
        ctx.arc(x + Math.cos(a) * (r + 1), y + Math.sin(a) * (r + 1) - 2, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (c.corrodeTicks > 0) {
      // A drip below. Sits under the charge so it never competes with the
      // health bar above it.
      ctx.fillStyle = 'rgba(154, 230, 110, 0.75)';
      ctx.beginPath();
      ctx.ellipse(x, y + r - 1, r * 0.5, r * 0.28, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }


  private drawProjectiles(world: World): void {
    const { ctx } = this;
    for (const p of world.projectiles) {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawEffects(): void {
    const { ctx } = this;

    for (const b of this.bursts) {
      const t = 1 - b.life / b.max;
      ctx.strokeStyle = b.color;
      ctx.globalAlpha = 1 - t;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(b.x, b.y, 6 + t * 22, 0, Math.PI * 2);
      ctx.stroke();
      b.life--;
    }
    ctx.globalAlpha = 1;
    this.bursts = this.bursts.filter((b) => b.life > 0);

    ctx.font = '600 12px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    for (const f of this.floaters) {
      const t = 1 - f.life / FLOATER_LIFE;
      ctx.globalAlpha = Math.max(0, 1 - t * 1.15);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y - 16 - t * 20);
      f.life--;
    }
    ctx.globalAlpha = 1;
    this.floaters = this.floaters.filter((f) => f.life > 0);
  }

  /** Canvas pixel coords from a mouse event, accounting for CSS scaling. */
  toBoard(ev: MouseEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: ((ev.clientX - rect.left) / rect.width) * BOARD.width,
      y: ((ev.clientY - rect.top) / rect.height) * BOARD.height,
    };
  }
}

