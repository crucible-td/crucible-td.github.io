/** The board and the single lane charges walk along. One map for now. */

export interface Point {
  x: number;
  y: number;
}

export const BOARD = {
  width: 960,
  height: 600,
  cell: 40,
  get cols(): number {
    return Math.floor(this.width / this.cell);
  },
  get rows(): number {
    return Math.floor(this.height / this.cell);
  },
} as const;

/** How close to the lane a tower may be built, in pixels. */
export const PATH_CLEARANCE = 34;

/** The lane, as a polyline. Charges enter at the first point, leak at the last. */
export const PATH_POINTS: Point[] = [
  { x: -20, y: 120 },
  { x: 280, y: 120 },
  { x: 280, y: 300 },
  { x: 120, y: 300 },
  { x: 120, y: 460 },
  { x: 640, y: 460 },
  { x: 640, y: 200 },
  { x: 840, y: 200 },
  { x: 840, y: 540 },
  { x: 980, y: 540 },
];

/** Cumulative distance at each point; last entry is the total lane length. */
const CUMULATIVE: number[] = (() => {
  const out = [0];
  for (let i = 1; i < PATH_POINTS.length; i++) {
    const a = PATH_POINTS[i - 1]!;
    const b = PATH_POINTS[i]!;
    out.push(out[i - 1]! + Math.hypot(b.x - a.x, b.y - a.y));
  }
  return out;
})();

export const PATH_LENGTH: number = CUMULATIVE[CUMULATIVE.length - 1]!;

/** Position of a charge that has travelled `dist` pixels along the lane. */
export function pointAt(dist: number): Point {
  if (dist <= 0) return PATH_POINTS[0]!;
  if (dist >= PATH_LENGTH) return PATH_POINTS[PATH_POINTS.length - 1]!;
  let seg = 1;
  while (seg < CUMULATIVE.length - 1 && CUMULATIVE[seg]! < dist) seg++;
  const a = PATH_POINTS[seg - 1]!;
  const b = PATH_POINTS[seg]!;
  const segStart = CUMULATIVE[seg - 1]!;
  const segLen = CUMULATIVE[seg]! - segStart;
  const t = segLen === 0 ? 0 : (dist - segStart) / segLen;
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function distToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}

/** Shortest distance from an arbitrary point to the lane. */
export function distanceToPath(p: Point): number {
  let best = Infinity;
  for (let i = 1; i < PATH_POINTS.length; i++) {
    best = Math.min(best, distToSegment(p, PATH_POINTS[i - 1]!, PATH_POINTS[i]!));
  }
  return best;
}

/** Pixel centre of a grid cell. */
export function cellCentre(col: number, row: number): Point {
  return { x: col * BOARD.cell + BOARD.cell / 2, y: row * BOARD.cell + BOARD.cell / 2 };
}

/** True if a tower could stand on this cell, ignoring towers already there. */
export function isBuildableCell(col: number, row: number): boolean {
  if (col < 0 || row < 0 || col >= BOARD.cols || row >= BOARD.rows) return false;
  return distanceToPath(cellCentre(col, row)) > PATH_CLEARANCE;
}
