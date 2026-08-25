/**
 * Draws a World. Strictly read-only: rendering never mutates simulation state,
 * which is what lets the same World run identically with no canvas at all.
 */
import { BOARD, PATH_POINTS, cellCentre, isBuildableCell, pointAt } from '../sim/path.ts';
import { TOWERS } from '../sim/towers.ts';
import { STATES } from '../sim/types.ts';
import type { Charge, SimEvent, TowerId } from '../sim/types.ts';
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
  transmute: '#efe6dc',
  destroy: '#9ae66e',
  shatter: '#7fd8ff',
  split: '#ff6b35',
  leak: '#ff5a5a',
  nothing: '#ff9d5c',
};

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private floaters: Floater[] = [];
  private bursts: Burst[] = [];

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
      if (e.type !== 'transmute') {
        this.bursts.push({ x: e.x, y: e.y, color, life: BURST_LIFE, max: BURST_LIFE });
      }
    }
  }

  draw(world: World, hover: { col: number; row: number } | null, selected: TowerId | null): void {
    const { ctx } = this;
    ctx.clearRect(0, 0, BOARD.width, BOARD.height);
    ctx.fillStyle = '#14110f';
    ctx.fillRect(0, 0, BOARD.width, BOARD.height);

    this.drawBuildableCells();
    this.drawLane();
    if (hover && selected) this.drawPlacementPreview(world, hover, selected);
    for (const t of world.towers) this.drawTower(t.x, t.y, t.def, 1);
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

  private drawPlacementPreview(world: World, hover: { col: number; row: number }, selected: TowerId): void {
    const { ctx } = this;
    const def = TOWERS[selected];
    const c = cellCentre(hover.col, hover.row);
    const blocked = !isBuildableCell(hover.col, hover.row) || world.towers.some((t) => t.x === c.x && t.y === c.y);
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

  private drawTower(x: number, y: number, id: TowerId, alpha: number): void {
    const { ctx } = this;
    const def = TOWERS[id];
    const r = 15;

    ctx.fillStyle = '#241f1b';
    ctx.strokeStyle = def.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x - r, y - r, r * 2, r * 2, 5);
    ctx.fill();
    ctx.stroke();

    ctx.globalAlpha = alpha * 0.9;
    ctx.fillStyle = def.color;
    ctx.beginPath();
    ctx.arc(x, y, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.fillStyle = 'rgba(20, 17, 15, 0.9)';
    ctx.font = '700 9px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(def.element[0]!, x, y + 0.5);
  }

  /** Each state gets its own silhouette, so a glance reads the whole lane. */
  private drawCharge(c: Charge): void {
    const { ctx } = this;
    const p = pointAt(c.dist);
    const s = STATES[c.state];
    const r = s.radius;

    if (c.state === 'MOLTEN') {
      const glow = ctx.createRadialGradient(p.x, p.y, 2, p.x, p.y, r * 2.1);
      glow.addColorStop(0, 'rgba(255, 107, 53, 0.42)');
      glow.addColorStop(1, 'rgba(255, 107, 53, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * 2.1, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = s.color;
    ctx.strokeStyle = 'rgba(20, 17, 15, 0.75)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();

    switch (c.state) {
      case 'ORE':
        polygon(ctx, p.x, p.y, r, 6, 0.15);
        break;
      case 'SLAG':
        ctx.rect(p.x - r * 0.8, p.y - r * 0.8, r * 1.6, r * 1.6);
        break;
      case 'CRYSTAL':
        // Diamond, not a square -- Slag already owns the square silhouette.
        polygon(ctx, p.x, p.y, r, 4, 0);
        break;
      case 'VAPOR':
        ctx.globalAlpha = 0.55;
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        break;
      default:
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    }

    ctx.fill();
    ctx.stroke();
    ctx.globalAlpha = 1;

    if (c.state === 'VAPOR') {
      ctx.strokeStyle = s.color;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.arc(p.x, p.y, r + 3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Integrity pips, so chipping away at Ore is visible progress.
    const max = STATES[c.state].integrity;
    if (c.integrity < max) {
      const w = r * 1.8;
      ctx.fillStyle = 'rgba(20, 17, 15, 0.8)';
      ctx.fillRect(p.x - w / 2, p.y - r - 7, w, 3);
      ctx.fillStyle = '#9ae66e';
      ctx.fillRect(p.x - w / 2, p.y - r - 7, (w * c.integrity) / max, 3);
    }

    if (c.flash > 0) {
      ctx.strokeStyle = `rgba(255, 255, 255, ${c.flash / 8})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r + 5, 0, Math.PI * 2);
      ctx.stroke();
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

function polygon(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, sides: number, rot: number): void {
  for (let i = 0; i < sides; i++) {
    const a = rot + (i / sides) * Math.PI * 2;
    const px = x + Math.cos(a) * r;
    const py = y + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}
