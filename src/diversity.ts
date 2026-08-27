/**
 * Build-diversity harness.
 *
 * The other two harnesses ask "does this build work?". This one asks the
 * question the game is actually judged on: **how many different builds work,
 * and is any single tower mandatory?**
 *
 * That exists because the previous version of this game failed exactly there.
 * It was balanced, fair and winnable, and it still had one right answer -- the
 * build measurement converged on used three of the four towers and nothing
 * else came close. Difficulty being fair is necessary and not sufficient, so
 * diversity gets a meter rather than an opinion.
 *
 *   npm run diversity
 *   npm run diversity -- --slots 7 --sample 80 --json
 *
 * Every candidate is run through the real campaign, so a build only counts as
 * working if a player could have afforded it round by round.
 */
import { parseArgs } from 'node:util';
import { runCampaign } from './campaign.ts';
import { parseLoadout } from './sim/loadout.ts';
import { BOARD, PATH_LENGTH, cellCentre, isBuildableCell, pointAt } from './sim/path.ts';
import { Rng } from './sim/rng.ts';
import { TOWER_IDS } from './sim/towers.ts';
import { pathsFor, tiersOf } from './sim/upgrades.ts';
import type { TowerId } from './sim/types.ts';
import { AUTHORED_ROUNDS } from './sim/freeplay.ts';

/**
 * Buildable cells spread along the lane, in lane order.
 *
 * Position is held fixed on purpose. Two builds differing only in where the
 * same towers stand are the same strategy wearing a different hat, and
 * counting those as "diversity" would flatter the game exactly where it needs
 * honest measurement.
 */
const SLOTS: [number, number][] = [
  [2, 1],
  [5, 1],
  [5, 5],
  [5, 9],
  [8, 9],
  [8, 13],
  [11, 9],
  [11, 13],
  [12, 13],
  [14, 13],
  [14, 9],
  [14, 7],
  [18, 3],
  [18, 7],
  [19, 9],
  [22, 11],
  [23, 9],
  [23, 11],
];

/**
 * Every buildable cell close enough to the lane to be worth a tower, in lane
 * order.
 *
 * `SLOTS` above is eighteen hand-picked positions, which is the right size for
 * asking "which towers" but far too small for asking "how many". A player is
 * not limited to eighteen: the board has 269 buildable cells and 103 of them
 * sit within a tower's reach of the lane. Measuring whether breadth beats
 * depth means being able to build the board a player would actually build.
 */
export function laneCells(maxDistance = 70): [number, number][] {
  const out: { col: number; row: number; at: number }[] = [];
  for (let row = 0; row < BOARD.rows; row++) {
    for (let col = 0; col < BOARD.cols; col++) {
      if (!isBuildableCell(col, row)) continue;
      const centre = cellCentre(col, row);
      let nearest = Infinity;
      let at = 0;
      // Sampled rather than solved: the lane is a polyline, and six pixels is
      // finer than a tower's reach by an order of magnitude.
      for (let d = 0; d < PATH_LENGTH; d += 6) {
        const p = pointAt(d);
        const gap = Math.hypot(p.x - centre.x, p.y - centre.y);
        if (gap < nearest) {
          nearest = gap;
          at = d;
        }
      }
      if (nearest <= maxDistance) out.push({ col, row, at });
    }
  }
  // Lane order, so taking the first n gives a board that covers the run-up
  // rather than a random scatter -- the way a player fills a lane.
  out.sort((a, b) => a.at - b.at);
  return out.map((c) => [c.col, c.row]);
}

/**
 * A loadout of `n` towers along the lane, cycling through `comp`, with no
 * upgrades named at all.
 *
 * This is the shape of build that exposed the breadth-versus-depth problem: a
 * player who never upgrades and simply spends every coin on another tower.
 * `planFor` above is its opposite -- it gives every tower a tier-3 intent --
 * and the two together are the axis the diversity meter does not measure.
 */
export function breadthPlan(n: number, comp: TowerId[]): string {
  const cells = laneCells();
  const picks: string[] = [];
  for (let i = 0; i < n && i < cells.length; i++) {
    const [col, row] = cells[i]!;
    picks.push(`${comp[i % comp.length]}@${col},${row}`);
  }
  return picks.join(' ');
}

/**
 * The same board as `breadthPlan`, with every tower intending its tier-3 path.
 *
 * The pair is the point: two loadouts identical in shape and position, one
 * spending its gold on more towers and the other on upgrading fewer. That is
 * the axis `runDiversity` cannot see, because it holds slots fixed at eighteen
 * and always intends tier 3, so every build it samples is a depth build.
 */
export function depthPlan(n: number, comp: TowerId[]): string {
  const cells = laneCells();
  const picks: string[] = [];
  for (let i = 0; i < n && i < cells.length; i++) {
    const [col, row] = cells[i]!;
    const tower = comp[i % comp.length]!;
    // Alternate the two branches across slots, as planFor does, so a board is
    // not measured on one branch's numbers alone.
    const path = pathsFor(tower)[i % 2]!;
    const top = tiersOf(tower, path)[2]!;
    picks.push(`${tower}@${col},${row}+${top.id}`);
  }
  return picks.join(' ');
}

export interface BuildResult {
  /** How many of each tower, the thing that actually makes builds different. */
  composition: Record<TowerId, number>;
  label: string;
  won: boolean;
  roundsCleared: number;
  livesLeft: number;
}

/** Median of a list, or 0 when empty. */
function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

export interface DiversityReport {
  builds: BuildResult[];
  winners: BuildResult[];
  /** How deep the sampled builds get. With freeplay there is no ceiling. */
  medianDepth: number;
  deepest: number;
  /** Fraction of winning builds containing each tower. 1 means mandatory. */
  presence: Record<TowerId, number>;
  mustBuild: TowerId[];
  /** Winners whose composition differs from every other winner's. */
  distinctWinners: number;
}

function label(comp: Record<TowerId, number>): string {
  return TOWER_IDS.filter((t) => comp[t] > 0)
    .map((t) => `${comp[t]}${t[0]!.toUpperCase()}`)
    .join('+');
}

/**
 * Lay a composition out along the lane, in tower order, one per slot.
 *
 * Every tower is given a tier-3 path to climb, alternating between its two
 * paths across slots. Without this the meter could not see the main thing that
 * widens the strategy space: a path that lifts an immunity is what lets one
 * tower cover a layer it otherwise cannot touch, so measuring bare towers
 * measures a game nobody plays. The campaign only buys what the wallet
 * reaches, so this is an intent to climb rather than a grant.
 */
function planFor(comp: Record<TowerId, number>, slots: number): string {
  const picks: TowerId[] = [];
  for (const t of TOWER_IDS) for (let i = 0; i < comp[t]; i++) picks.push(t);
  return picks
    .slice(0, slots)
    .map((t, i) => {
      const slot = SLOTS[i];
      if (!slot) throw new Error(`only ${SLOTS.length} lane slots are defined; asked for ${slots}`);
      const [col, row] = slot;
      const path = pathsFor(t)[i % 2]!;
      const top = tiersOf(t, path)[2]!;
      return `${t}@${col},${row}+${top.id}`;
    })
    .join(' ');
}

/** Every way to divide `slots` towers among the tower types. */
function allCompositions(slots: number): Record<TowerId, number>[] {
  const out: Record<TowerId, number>[] = [];
  const walk = (i: number, left: number, acc: Partial<Record<TowerId, number>>) => {
    if (i === TOWER_IDS.length - 1) {
      out.push({ ...acc, [TOWER_IDS[i]!]: left } as Record<TowerId, number>);
      return;
    }
    for (let n = 0; n <= left; n++) walk(i + 1, left - n, { ...acc, [TOWER_IDS[i]!]: n });
  };
  walk(0, slots, {});
  return out;
}

export function runDiversity(
  opts: { slots?: number; sample?: number; seed?: number; rounds?: number } = {},
): DiversityReport {
  const slots = opts.slots ?? 8;
  const seed = opts.seed ?? 1;
  const rounds = opts.rounds ?? AUTHORED_ROUNDS;
  let comps = allCompositions(slots);

  if (opts.sample !== undefined && opts.sample < comps.length) {
    // Deterministic sample: the same seed always measures the same builds, so
    // a diversity regression is a real change rather than a reroll.
    const rng = new Rng(seed);
    const pool = [...comps];
    comps = [];
    for (let i = 0; i < opts.sample; i++) {
      comps.push(pool.splice(Math.floor(rng.range(0, pool.length - 0.001)), 1)[0]!);
    }
  }

  const builds: BuildResult[] = comps.map((composition) => {
    const plan = parseLoadout(planFor(composition, slots));
    const r = runCampaign(plan, seed, 20000, rounds);
    return {
      composition,
      label: label(composition),
      won: r.won,
      roundsCleared: r.wavesCleared,
      livesLeft: r.livesLeft,
    };
  });

  const winners = builds.filter((b) => b.won);
  const presence = {} as Record<TowerId, number>;
  for (const t of TOWER_IDS) {
    presence[t] = winners.length === 0 ? 0 : winners.filter((b) => b.composition[t] > 0).length / winners.length;
  }
  const mustBuild = winners.length === 0 ? [] : TOWER_IDS.filter((t) => presence[t] === 1);
  const distinctWinners = new Set(winners.map((b) => b.label)).size;
  const depths = builds.map((b) => b.roundsCleared);

  return {
    builds,
    winners,
    medianDepth: median(depths),
    deepest: Math.max(...depths),
    presence,
    mustBuild,
    distinctWinners,
  };
}

function main(): void {
  const { values } = parseArgs({
    options: {
      slots: { type: 'string', default: '8' },
      sample: { type: 'string' },
      rounds: { type: 'string' },
      seed: { type: 'string', default: '1' },
      json: { type: 'boolean', default: false },
    },
    allowPositionals: false,
  });

  const slots = Number(values.slots);
  const rounds = values.rounds !== undefined ? Number(values.rounds) : AUTHORED_ROUNDS;
  const report = runDiversity({
    slots,
    rounds,
    seed: Number(values.seed),
    ...(values.sample !== undefined ? { sample: Number(values.sample) } : {}),
  });

  if (values.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(`\n${report.builds.length} builds of ${slots} towers, run to round ${rounds}.\n`);
  console.log(
    `${report.winners.length} cleared all ${rounds} rounds, in ${report.distinctWinners} distinct compositions. ` +
      `Median depth ${report.medianDepth}, deepest ${report.deepest}.\n`,
  );

  const best = [...report.winners].sort((a, b) => b.livesLeft - a.livesLeft).slice(0, 12);
  if (best.length > 0) {
    console.log('best surviving builds:');
    for (const b of best) console.log(`  ${b.label.padEnd(18)} round ${b.roundsCleared}, ${b.livesLeft}/20 lives`);
    console.log();
  }

  console.log('how often each tower appears in a winning build:');
  for (const t of TOWER_IDS) {
    const pct = (report.presence[t] * 100).toFixed(0);
    const flag = report.presence[t] === 1 ? '   <-- in EVERY winner' : '';
    console.log(`  ${t.padEnd(9)} ${pct.padStart(3)}%${flag}`);
  }

  console.log();
  if (report.winners.length === 0) {
    console.log('VERDICT: nothing survives. The game is not winnable at this slot count.');
  } else if (report.mustBuild.length > 0) {
    console.log(`VERDICT: ${report.mustBuild.join(', ')} mandatory -- the game has a right answer again.`);
  } else {
    console.log('VERDICT: no tower is mandatory. More than one strategy works.');
  }
  console.log();
}

if (import.meta.main) main();
