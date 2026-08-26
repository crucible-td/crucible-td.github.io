import type { State, TowerId } from '../sim/types.ts';

/**
 * Artwork for towers and monsters, as SVG path data.
 *
 * One definition, two renderers. An SVG path string is understood by both
 * `new Path2D(d)` on the canvas and `<path d="…">` in the DOM, so a tower's
 * silhouette in the build menu is guaranteed to be the same silhouette that
 * appears on the board. That is the whole point of having an icon: you learn
 * it in the panel and recognise it in play. Two separate drawings would drift
 * apart the first time either was edited.
 *
 * Everything is drawn in a 24x24 box and scaled at paint time. The real
 * constraint is size -- a tower is 30px on a 40px grid and a monster between
 * 24px and 35px -- so these are bold silhouettes with one identifying feature
 * each, not illustrations. Detail that does not survive at 30px is noise.
 *
 * This module is render-side and imports nothing from `src/sim` except types.
 */
export interface Art {
  /** Silhouette, filled in the tower's or layer's own colour. */
  body: string;
  /** One identifying detail, filled in `accentColor`. */
  accent?: string;
  /** Accent fill. Monsters share a single dark tone and leave this unset. */
  accentColor?: string;
  /** Face, monsters only. Angled rather than round, which reads as hostile. */
  eyes?: string;
}

/**
 * Towers are machines: geometric silhouettes with a lit or moving part.
 *
 * The silhouettes were chosen by testing a whole set at 30px rather than by
 * drawing each one nicely. Foundry-realistic shapes lost -- fins turned to
 * noise, a tank read as a tree, a lens as a trophy -- while these five stay
 * mutually unmistakable at playing size.
 */
export const TOWER_ART: Record<TowerId, Art> = {
  // A furnace: pitched body, chimney, and a mouth with the fire showing.
  forge: {
    body: 'M12 2 21 9.2V22H3V9.2zM15.8 3h2.8v5.2l-2.8-2.2z',
    accent: 'M9.2 22v-5.2a2.8 2.8 0 0 1 5.6 0V22z',
    accentColor: '#ffd9a0',
  },
  // A finned condenser around a frozen core.
  chiller: {
    body:
      'M12 2l8 5v10l-8 5-8-5V7z' +
      'M1.6 9h2.6v2.2H1.6zM1.6 13h2.6v2.2H1.6zM19.8 9h2.6v2.2h-2.6zM19.8 13h2.6v2.2h-2.6z',
    accent: 'M12 7.4l3.8 2.4v4.4L12 16.6l-3.8-2.4V9.8z',
    accentColor: '#d6f2ff',
  },
  // An anvil. The earlier press -- a trapezoid under a bar -- read as a paper
  // cup; an anvil has mass in its outline, which is the point of the tower.
  stamp: {
    body: 'M2.5 7.2 6 5h11v4.6H6zM9.4 9.6h5.2v5.4H9.4zM5 15h14v4.4H5zM3.8 19.4h16.4v2.4H3.8z',
    accent: 'M7.2 6.1h8.6v1.7H7.2z',
    accentColor: '#8d8d8d',
  },
  // A tank with a banded belly and an outlet valve.
  vat: {
    body: 'M12 2.4a9 9 0 1 1 0 18 9 9 0 0 1 0-18zM4 20.8h16v2.2H4z',
    accent: 'M6.6 10.6h10.8v2.6H6.6zM17.4 14h3.6v2.2h-3.6z',
    accentColor: '#4f8f34',
  },
  // A ring with a bright core -- the most legible shape in the set.
  lens: {
    body: 'M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zM12 7.4a4.6 4.6 0 1 0 0 9.2 4.6 4.6 0 0 0 0-9.2z',
    accent: 'M12 8.8a3.2 3.2 0 1 1 0 6.4 3.2 3.2 0 0 1 0-6.4z',
    accentColor: '#fff6d6',
  },
};

/**
 * Monsters are creatures, each with a different body plan.
 *
 * The silhouette identifies the layer before the colour does: the golem is
 * squat and lopsided, the skitterer low and many-legged, the lava monster
 * upright and dripping, the crystal beast all spines, the wraith legless. That
 * matters because a Crystal breaking into two Molten should read as one
 * creature releasing two different ones, which is what the simulation has
 * always done and the artwork never showed.
 *
 * Monsters carry a dark outline and towers do not, so the two groups read as
 * different kinds of thing at a glance -- alive versus machine.
 */
export const MONSTER_ART: Record<State, Art> = {
  ORE: {
    body:
      'M7 8.4q5-4.2 10 0l1.6 9.2q-7 4-13.2 0zM6.4 8.2 4.6 2.8l4.4 3.6zM17.6 8.2 19.6 3.4l-4.2 3.2z' +
      'M0.8 10h5.4v9.6H0.8zM18.4 11.2h3.6v6.4h-3.6zM7.6 20h3.4v3.4H7.6zM12.8 20h3.4v3.4h-3.4z',
    accent: 'M8.8 15.6h6.4l-1.1 2.4-1.1-1.3-1.1 1.5-1.1-1.5-1 1.3z',
    eyes: 'M8.4 11 11 12.1l-.3 1.7-2.6-1.1zM15.6 11 13 12.1l.3 1.7 2.6-1.1z',
  },
  SLAG: {
    body:
      'M5.6 13q6.4-4.2 12.8 0l1.4 4.8q-7.8 3.6-15.6 0zM8.8 9.8h6.4v3.4H8.8z' +
      'M7.4 7.6 9.8 10.4 8.6 11.6 5.8 9.2zM16.6 7.6 14.2 10.4l1.2 1.2 2.8-2.4z' +
      'M3.8 15 1 18.2l1.5 1.1L5.2 16.5zM20.2 15 23 18.2l-1.5 1.1-2.7-2.8z' +
      'M6.4 18.6 4.8 22.6h1.9l1.7-3.2zM17.6 18.6 19.2 22.6h-1.9l-1.7-3.2z',
    accent: 'M9.6 15.4h4.8l-.8 1.8-.8-1-.8 1.2-.8-1.2-.8 1z',
    eyes: 'M9 10.4 11.2 11.3l-.2 1.4-2.2-.9zM15 10.4 12.8 11.3l.2 1.4 2.2-.9z',
  },
  MOLTEN: {
    body:
      'M12 2.2c3.8 0 6.2 2.8 6.2 6.2v5.2c0 3.4-2.5 5.6-6.2 5.6s-6.2-2.2-6.2-5.6V8.4C5.8 5 8.2 2.2 12 2.2z' +
      'M6.2 6.6 3.4 2.2 8 4.8zM17.8 6.6 20.6 2.4 16 4.8z' +
      'M5.9 9.8 1.4 12.6l1.7 3.5 3.3-1.9zM18.1 9.8l4.5 2.8-1.7 3.5-3.3-1.9z' +
      'M7.8 18.6h1.7v3.8H7.8zM11.1 18.9h1.8v4.4h-1.8zM14.4 18.6h1.7v3.6h-1.7z',
    accent: 'M8.2 12.2h7.6l-1.3 2.9-1.1-1.6-1.1 1.8-1.1-1.8-1.1 1.6z',
    eyes: 'M8.6 7.4 11.2 8.6l-.3 1.8-2.6-1.2zM15.4 7.4 12.8 8.6l.3 1.8 2.6-1.2z',
  },
  CRYSTAL: {
    body: 'M12 1.4l3.4 4.8 4.6-3-1.3 6.2 3.5 3.4-3.9 2.3 1.5 5.7H4.2l1.5-5.7-3.9-2.3 3.5-3.4L4 3.2l4.6 3z',
    accent: 'M8.4 13.2h7.2l-1.2 3-1.2-1.7-1.2 1.9-1.2-1.9-1.2 1.7z',
    eyes: 'M8.8 9.6 11.4 10.7l-.3 1.7-2.6-1.1zM15.2 9.6 12.6 10.7l.3 1.7 2.6-1.1z',
  },
  VAPOR: {
    body:
      'M12 1.4a5.5 5.5 0 0 1 5.5 5.5v3.5q0 7.6-5.5 13-5.5-5.4-5.5-13V6.9A5.5 5.5 0 0 1 12 1.4z' +
      'M6.5 12.6Q3.2 11.2 2.2 7.6q3.8 1 5.2 3.8zM17.5 12.6q3.3-1.4 4.3-5-3.8 1-5.2 3.8z',
    accent: 'M10.4 12h3.2v3.6a1.6 1.6 0 0 1-3.2 0z',
    eyes: 'M8.8 7.4 11.4 8.6l-.3 1.8-2.6-1.2zM15.2 7.4 12.6 8.6l.3 1.8 2.6-1.2z',
  },
};

/**
 * How much larger a creature is drawn than the old bare shape.
 *
 * A body with limbs needs more room than a hexagon did. The lane is 40px wide
 * with 34px of clearance, so even the largest creature still sits inside it.
 */
export const MONSTER_SCALE = 1.35;

/**
 * `Path2D` objects, cached by their own path data.
 *
 * Rebuilding these every frame -- forty creatures at 60fps, tripled at
 * fast-forward -- is exactly the kind of waste that turns a smooth board into
 * a stuttering one. The path string is its own cache key, so there is nothing
 * to keep in sync.
 */
const cache = new Map<string, Path2D>();

export function path(d: string): Path2D {
  let p = cache.get(d);
  if (!p) {
    p = new Path2D(d);
    cache.set(d, p);
  }
  return p;
}

/**
 * Paint one piece of artwork centred on a point, at a given pixel size.
 *
 * `evenodd` matters: the Lens is a ring and the Forge has a mouth, and both
 * are single paths with holes in them.
 */
export function paintArt(
  ctx: CanvasRenderingContext2D,
  art: Art,
  x: number,
  y: number,
  size: number,
  color: string,
  opts: { outline?: string; darkDetail?: string } = {},
): void {
  ctx.save();
  ctx.translate(x - size / 2, y - size / 2);
  ctx.scale(size / 24, size / 24);

  ctx.fillStyle = color;
  if (opts.outline) {
    ctx.strokeStyle = opts.outline;
    ctx.lineWidth = 0.9;
    ctx.lineJoin = 'round';
  }
  const body = path(art.body);
  ctx.fill(body, 'evenodd');
  if (opts.outline) ctx.stroke(body);

  if (art.accent) {
    ctx.fillStyle = art.accentColor ?? opts.darkDetail ?? color;
    if (!art.accentColor && opts.darkDetail) ctx.globalAlpha = 0.78;
    ctx.fill(path(art.accent));
    ctx.globalAlpha = 1;
  }
  if (art.eyes && opts.darkDetail) {
    ctx.fillStyle = opts.darkDetail;
    ctx.fill(path(art.eyes));
  }
  ctx.restore();
}

/** The same artwork as inline SVG, for the build menu and upgrade panel. */
export function svgMarkup(art: Art, color: string, px: number): string {
  const accent = art.accent
    ? `<path d="${art.accent}" fill="${art.accentColor ?? color}"/>`
    : '';
  return (
    `<svg width="${px}" height="${px}" viewBox="0 0 24 24" aria-hidden="true">` +
    `<path d="${art.body}" fill="${color}" fill-rule="evenodd"/>${accent}</svg>`
  );
}
