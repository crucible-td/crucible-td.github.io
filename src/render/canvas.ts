/**
 * Draws a World. Strictly read-only: rendering never mutates simulation state,
 * which is what lets the same World run identically with no canvas at all.
 */
import { BOARD, PATH_LENGTH, PATH_POINTS, cellCentre, isBuildableCell, pointAt } from '../sim/path.ts';
import { ELEMENT_ART, ELEMENT_COLOR, MONSTER_ART, TOWER_ART, paintArt } from './art.ts';
import { TOWERS } from '../sim/towers.ts';
import { chargeRadius, chargeReadout, layersRemaining, toughnessTier } from './decisions.ts';
import { UPGRADES } from '../sim/upgrades.ts';
import { STATES } from '../sim/types.ts';
import type { Charge, Element, SimEvent, Tower, TowerId, UpgradeId } from '../sim/types.ts';
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

/** Where the i-th shell ring sits, outside a body of radius `r`. */
function ringRadius(r: number, i: number): number {
  return r + 3 + i * 3.5;
}

/**
 * How far a charge's drawing actually reaches, armour included.
 *
 * The rings are decoration and picking deliberately ignores them -- a charge
 * you can see is a charge you can point at, keyed to `chargeRadius` alone --
 * but anything positioned *beside* a charge has to clear them.
 */
function shellRadius(c: Charge): number {
  const r = chargeRadius(c.state, c.scale);
  const tier = toughnessTier(c.scale);
  return tier === 0 ? r : ringRadius(r, tier - 1) + 2;
}

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

  /**
   * The floor and the lane, painted once and blitted every frame.
   *
   * Neither of them ever changes: the plate, its rivets, the channel cut
   * through it and the heat coming out of that channel are all functions of
   * `BOARD` and `PATH_POINTS`, which are constants. Redrawing a hundred rivets
   * and four blurred glow passes sixty times a second -- a hundred and eighty
   * at 3x -- is the same waste the `Path2D` cache in `art.ts` exists to avoid,
   * and it is worse here because the glows go through `ctx.filter`.
   *
   * So it is one `drawImage` per frame instead, and the expensive part happens
   * once in the constructor.
   */
  private floor: HTMLCanvasElement;

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas 2d context unavailable');
    this.ctx = ctx;
    this.floor = this.paintFloor();
  }

  /**
   * The board as a foundry floor: steel plate with a channel cut into it.
   *
   * The old board was a flat fill with a brown line on it and a scatter of
   * dots for buildable ground, which is what "programmer art" meant here. Two
   * things fix most of it. The floor becomes a *material* -- riveted plate,
   * laid only on ground you can actually build on, so "where can this go" is
   * answered by the surface rather than by a legend. And the lane becomes a
   * channel of open metal with a broken crust over it, throwing light onto the
   * plate either side, so the board has a light source and the lane is
   * unmistakably the hot, dangerous part.
   */
  private paintFloor(): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = BOARD.width;
    c.height = BOARD.height;
    const g = c.getContext('2d');
    if (!g) throw new Error('canvas 2d context unavailable');

    g.fillStyle = '#14110f';
    g.fillRect(0, 0, BOARD.width, BOARD.height);

    // Grime, so the floor is not evenly lit. Fixed positions: this is
    // scenery, and `Math.random` has no business anywhere near this project.
    g.save();
    g.filter = 'blur(38px)';
    g.fillStyle = 'rgba(8, 6, 5, 0.75)';
    g.beginPath();
    g.ellipse(80, 540, 150, 70, 0, 0, Math.PI * 2);
    g.ellipse(760, 70, 170, 80, 0, 0, Math.PI * 2);
    g.ellipse(430, 350, 120, 60, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();

    this.paintPlate(g);
    this.paintChannel(g);
    return c;
  }

  /**
   * Steel plate, laid on exactly the cells a tower can stand on.
   *
   * This replaces the scatter of faint dots, and it is a better answer than
   * the dots were: buildable ground is not marked, it is *made of something
   * else*. A player reads "I can bolt a machine to that" without being told.
   */
  private paintPlate(g: CanvasRenderingContext2D): void {
    for (let col = 0; col < BOARD.cols; col++) {
      for (let row = 0; row < BOARD.rows; row++) {
        if (!isBuildableCell(col, row)) continue;
        const x = col * BOARD.cell;
        const y = row * BOARD.cell;

        g.fillStyle = 'rgba(239, 230, 220, 0.045)';
        g.fillRect(x + 1, y + 1, BOARD.cell - 2, BOARD.cell - 2);

        // A lit top-left edge and a dark bottom-right one: the cheapest way to
        // make a flat rectangle read as a raised plate.
        g.strokeStyle = 'rgba(255, 236, 214, 0.05)';
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(x + 1, y + BOARD.cell - 1);
        g.lineTo(x + 1, y + 1);
        g.lineTo(x + BOARD.cell - 1, y + 1);
        g.stroke();
        g.strokeStyle = 'rgba(0, 0, 0, 0.35)';
        g.beginPath();
        g.moveTo(x + BOARD.cell - 1, y + 1);
        g.lineTo(x + BOARD.cell - 1, y + BOARD.cell - 1);
        g.lineTo(x + 1, y + BOARD.cell - 1);
        g.stroke();

        // Rivets every fourth cell, not every cell -- at 40px a rivet in each
        // corner of each tile is a texture of noise rather than of metal.
        if (col % 4 === 0 && row % 4 === 0) {
          for (const [dx, dy] of [
            [6, 6],
            [BOARD.cell - 6, 6],
            [6, BOARD.cell - 6],
            [BOARD.cell - 6, BOARD.cell - 6],
          ] as const) {
            g.fillStyle = 'rgba(255, 232, 204, 0.13)';
            g.beginPath();
            g.arc(x + dx, y + dy, 1.7, 0, Math.PI * 2);
            g.fill();
            g.fillStyle = 'rgba(0, 0, 0, 0.4)';
            g.beginPath();
            g.arc(x + dx, y + dy + 1, 1.4, 0, Math.PI * 2);
            g.fill();
          }
        }
      }
    }
  }

  /** The lane: open metal in a cut channel, with a crust breaking over it. */
  private paintChannel(g: CanvasRenderingContext2D): void {
    g.lineCap = 'round';
    g.lineJoin = 'round';

    // Light thrown onto the plate either side. Restrained on purpose -- the
    // full version of this swallowed the buildable plate, and the plate is
    // carrying real information now.
    g.save();
    g.filter = 'blur(26px)';
    g.strokeStyle = 'rgba(255, 122, 46, 0.20)';
    g.lineWidth = 120;
    this.tracePathOn(g);
    g.stroke();
    g.restore();

    const layers: [string, number][] = [
      ['#0c0908', 56], // the cut edge, dropping into shadow
      ['#2a1d15', 46], // channel wall
      ['#7d2f10', 34], // cooling metal
      ['#c2481a', 24], // the pour
    ];
    for (const [color, width] of layers) {
      g.strokeStyle = color;
      g.lineWidth = width;
      this.tracePathOn(g);
      g.stroke();
    }

    g.save();
    g.filter = 'blur(5px)';
    g.strokeStyle = 'rgba(255, 200, 130, 0.55)';
    g.lineWidth = 5;
    this.tracePathOn(g);
    g.stroke();
    g.restore();

    this.paintCrust(g);

    // Direction of travel. The channel says where the danger is; this says
    // which way it is walking, which the glow alone cannot.
    g.strokeStyle = 'rgba(20, 14, 10, 0.5)';
    g.lineWidth = 2;
    g.setLineDash([10, 24]);
    this.tracePathOn(g);
    g.stroke();
    g.setLineDash([]);

    // The leak point: the only thing on the board hotter than the lane.
    const end = PATH_POINTS[PATH_POINTS.length - 1]!;
    g.save();
    g.filter = 'blur(14px)';
    g.fillStyle = 'rgba(255, 90, 90, 0.75)';
    g.fillRect(end.x - 34, end.y - 30, 34, 60);
    g.restore();
    g.fillStyle = 'rgba(255, 122, 74, 0.85)';
    g.fillRect(end.x - 24, end.y - 23, 24, 46);
  }

  /**
   * Cooled crust floating on the channel.
   *
   * Without it the lane is a smooth glowing tube, which reads as neon rather
   * than as metal. Plates are stepped along the path at a fixed interval and
   * turned to face the direction of travel, so corners get shorter pieces and
   * the whole thing follows the lane rather than sitting on top of it.
   */
  private paintCrust(g: CanvasRenderingContext2D): void {
    const step = 26;
    for (let d = 14, i = 0; d < PATH_LENGTH - 8; d += step, i++) {
      const a = pointAt(d);
      const b = pointAt(Math.min(d + 1, PATH_LENGTH));
      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      // Deterministic variety from the index, never Math.random: two runs of
      // the same seed must paint the same board.
      // Wide enough to cover most of the 46px channel. The first version left
      // narrow plates on a broad glowing band, which read as a neon tube and
      // buried every charge walking on it -- a Lava on an open channel was
      // very nearly camouflage. Crust is now the lane's default state and the
      // heat shows through the cracks between plates, which is both more like
      // metal and far easier to read a charge against.
      const len = 22 + ((i * 7) % 10);
      const wide = 30 + ((i * 5) % 9);
      const off = ((i * 11) % 7) - 3;

      g.save();
      g.translate(a.x, a.y);
      g.rotate(angle);
      g.fillStyle = 'rgba(30, 18, 12, 0.93)';
      g.beginPath();
      g.roundRect(-len / 2, off - wide / 2, len, wide, 3);
      g.fill();
      g.strokeStyle = 'rgba(255, 150, 80, 0.30)';
      g.lineWidth = 1;
      g.stroke();
      g.restore();
    }
  }

  private tracePathOn(g: CanvasRenderingContext2D): void {
    g.beginPath();
    g.moveTo(PATH_POINTS[0]!.x, PATH_POINTS[0]!.y);
    for (let i = 1; i < PATH_POINTS.length; i++) g.lineTo(PATH_POINTS[i]!.x, PATH_POINTS[i]!.y);
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
    hoveredCharge: Charge | null = null,
  ): void {
    const { ctx } = this;
    // One blit for the floor, the channel and everything baked into them.
    ctx.clearRect(0, 0, BOARD.width, BOARD.height);
    ctx.drawImage(this.floor, 0, 0);
    if (hover && selected) this.drawPlacementPreview(world, hover, selected);

    // Show the reach of a tower that is already down: the one being inspected,
    // or whichever one the cursor is over. Range is the whole reason placement
    // matters, so it should not be visible only in the second before you
    // commit to a spot.
    const hovered = hover && !selected ? (towerAt(world, hover.col, hover.row) ?? null) : null;
    const showRange = inspected ?? hovered;
    if (showRange) this.drawRange(showRange, showRange === inspected ? previewUpgrade : null);

    // Cast shadows first, all of them, so no tower's shadow lands on top of a
    // neighbouring tower. A floor with a light source is most of the
    // difference between this and a diagram.
    ctx.save();
    ctx.filter = 'blur(3px)';
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    for (const t of world.towers) {
      ctx.beginPath();
      ctx.ellipse(t.x + 2, t.y + 15, 17, 5.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

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
    // Last, so the tag is never drawn under a creature it is describing.
    if (hoveredCharge) this.drawChargeTag(hoveredCharge);
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

    // The element this tower throws, stamped at its shoulder. Five towers
    // share four elements, so "which column of the table does this one read"
    // is not answerable from the silhouette alone -- and it is the single most
    // important fact about a tower once it is on the board rather than in the
    // menu. Skipped on the placement ghost, which has the build card open
    // right next to it already saying the same thing.
    if (alpha === 1) {
      paintArt(ctx, ELEMENT_ART[def.element], x + r - 2, y - r + 2, 11, ELEMENT_COLOR[def.element]);
    }

    // One pip per tier climbed, along the *bottom* edge. Paths are permanent
    // and three deep, so the board has to show how far each tower has
    // committed -- not merely that it has. These used to run along the top,
    // which is where the element glyph now sits.
    for (let i = 0; i < tiers; i++) {
      ctx.fillStyle = def.color;
      ctx.beginPath();
      ctx.arc(x + r - 3.5 - i * 7, y + r - 3.5, 2.6, 0, Math.PI * 2);
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
    // the easiest. The formula lives in `decisions.ts` because the picking
    // that decides what the pointer is over has to agree with it exactly.
    const r = chargeRadius(c.state, c.scale);
    const size = r * 2;

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

    // Shell rings: how tough this one is, counted rather than measured.
    // Size stopped saying it several rounds ago -- everything past x4.4 draws
    // at the same capped radius -- so the slab wears its weight instead, one
    // ring per tier. Drawn outside the body and never read back by picking,
    // which stays keyed to `chargeRadius` alone.
    const tier = toughnessTier(c.scale);
    for (let i = 0; i < tier; i++) {
      const ring = ringRadius(r, i);
      // Backed in the board's own dark before the colour goes on: Ore's tan
      // and Ash's grey sit close to the lane's own glow, so an unbacked ring
      // vanished on exactly the charges a crowd makes hardest to read.
      ctx.beginPath();
      ctx.arc(p.x, p.y, ring, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(20, 17, 15, 0.75)';
      ctx.lineWidth = 3.4 + i * 0.6;
      ctx.stroke();
      ctx.strokeStyle = s.color;
      ctx.globalAlpha = 0.95 - i * 0.12;
      ctx.lineWidth = 1.6 + i * 0.6;
      ctx.stroke();
      // A slab's outermost ring is fired pale, so the thing that has to be
      // spotted in a crowd of forty differs in kind and not only in count --
      // three rings against two is not a difference anyone reads at a glance
      // while the lane is full.
      if (tier >= 3 && i === tier - 1) {
        ctx.strokeStyle = 'rgba(255, 246, 232, 0.7)';
        ctx.lineWidth = 1.4;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

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

    this.drawLayerPips(c, p.x, p.y, r, s.color);
    this.drawRiders(c, p.x, p.y, r);
  }

  /**
   * How many layers are still to come, as one diamond each.
   *
   * The single mechanic the board could never show. A Crystal and a Gas of the
   * same size look equally finished, and only one of them is about to become
   * four more creatures; the health bar reports this layer's progress and says
   * nothing whatever about the depth behind it. So the pips are permanent
   * rather than shown on hover -- everything else about a charge can be asked
   * for, and this had no tell at all.
   *
   * Drawn below the charge, because the health bar owns the space above it.
   * They count *down* as the stack is broken open, so a Crystal worked through
   * to its last Ash is visibly nearly finished.
   */
  private drawLayerPips(c: Charge, x: number, y: number, r: number, color: string): void {
    const { ctx } = this;
    const n = layersRemaining(c.state);
    // One layer left is the common case and needs no pip: an Ash showing a
    // single mark would be noise on most of the charges on the lane.
    if (n < 2) return;

    // Sized for a canvas that is usually drawn smaller than its 960px: at 4.8px
    // wide these vanished on a laptop, and three of them still fit inside a
    // 40px lane at this size.
    const gap = 8;
    const startX = x - ((n - 1) * gap) / 2;
    ctx.save();
    ctx.fillStyle = color;
    ctx.strokeStyle = 'rgba(20, 17, 15, 0.85)';
    ctx.lineWidth = 0.8;
    for (let i = 0; i < n; i++) {
      ctx.beginPath();
      ctx.moveTo(startX + i * gap, y + r + 2.6);
      ctx.lineTo(startX + i * gap + 3.2, y + r + 5.8);
      ctx.lineTo(startX + i * gap, y + r + 9);
      ctx.lineTo(startX + i * gap - 3.2, y + r + 5.8);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
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
      ctx.ellipse(x, y + r - 3, r * 0.5, r * 0.28, 0, 0, Math.PI * 2);
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


  /**
   * What the pointer is on, spelled out beside it.
   *
   * The complaint this answers is the plainest one in the whole pass: a charge
   * walks past and there is no way to ask what it is or what to hit it with
   * short of reading a table and matching a colour. Now you point at it.
   *
   * It says the three things the lane cannot: what beats this layer and by how
   * much, what does nothing at all to it, and -- the one that decides whether
   * breaking it is a good idea -- what climbs out when it does break. Hovering
   * also lights the matching row in the Matter panel, so a player who does this
   * a few times has learned to read the table without ever being asked to.
   */
  private drawChargeTag(c: Charge): void {
    const { ctx } = this;
    const p = pointAt(c.dist);
    // Cleared of the shell rings rather than of the body, or a slab -- the one
    // charge a player most wants to interrogate -- has the tag sitting on top
    // of its own armour.
    const r = shellRadius(c);
    const info = chargeReadout(c);
    const color = STATES[c.state].color;

    const w = 168;
    // Title line, the "beaten by" eyebrow, then one line per fact.
    const rows = info.counters.length + (info.immunities.length > 0 ? 1 : 0) + 1;
    const h = 42 + rows * 15;

    // Flip to the other side rather than run off the board, and hug the
    // vertical edges the same way.
    let x = p.x + r + 12;
    if (x + w > BOARD.width - 6) x = p.x - r - 12 - w;
    const y = Math.max(6, Math.min(p.y - h / 2, BOARD.height - h - 6));

    ctx.save();
    ctx.fillStyle = 'rgba(9, 7, 6, 0.94)';
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 3);
    ctx.fill();
    ctx.stroke();
    // A stripe in the layer's colour, so the tag is visibly about the thing it
    // is pointing at and not about the board in general.
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, 2);

    ctx.textAlign = 'left';
    ctx.font = '600 12px ui-sans-serif, system-ui, sans-serif';
    ctx.fillStyle = color;
    ctx.fillText(info.label.toUpperCase(), x + 9, y + 17);

    ctx.font = '10px ui-sans-serif, system-ui, sans-serif';
    ctx.fillStyle = '#9b8d80';
    ctx.textAlign = 'right';
    const lives = `${info.hp} hp \u00b7 ${info.leakCost} ${info.leakCost === 1 ? 'life' : 'lives'}`;
    ctx.fillText(lives, x + w - 9, y + 17);
    ctx.textAlign = 'left';

    let ty = y + 46;
    const line = (label: string, value: string, tone: string, glyph?: Element): void => {
      if (glyph) paintArt(ctx, ELEMENT_ART[glyph], x + 15, ty - 3.5, 11, ELEMENT_COLOR[glyph]);
      ctx.fillStyle = tone;
      ctx.font = glyph ? '600 11px ui-sans-serif, system-ui, sans-serif' : '9px ui-sans-serif, system-ui, sans-serif';
      ctx.fillText(label, x + (glyph ? 24 : 9), ty);
      if (value) {
        ctx.textAlign = 'right';
        ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
        ctx.fillText(value, x + w - 9, ty);
        ctx.textAlign = 'left';
      }
      ty += 15;
    };

    ctx.fillStyle = '#6d6259';
    ctx.font = '9px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText('BEATEN BY', x + 9, y + 33);
    for (const cn of info.counters) {
      line(cn.label, `\u00d7${cn.mult}`, ELEMENT_COLOR[cn.element], cn.element);
    }

    if (info.immunities.length > 0) {
      const names = info.immunities.map((i) => i.label).join(', ');
      line(`Nothing at all: ${names}`, '', '#ff5a5a');
    }

    const b = info.breaksInto;
    // "Breaks into 2 lava beasts", not "2 x Lava". Every creature name plurals
    // with a plain s, which is a property of the five words chosen rather than
    // of English -- see MONSTER_NAME. The article is picked off the first
    // letter so a single Ash is "an ash crawler" and not "a ash crawler".
    const spawn = b
      ? b.count > 1
        ? `${b.count} ${b.label}s`
        : `${/^[aeiou]/.test(b.label) ? 'an' : 'a'} ${b.label}`
      : '';
    line(
      b ? `Breaks into ${spawn}` : 'Last layer',
      '',
      b ? STATES[b.state].color : '#6d6259',
    );
    ctx.restore();
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

