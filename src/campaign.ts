/**
 * Full-campaign playtest harness.
 *
 * `npm run sim` answers "is this wave survivable?" by placing towers free and
 * handing every wave a fresh twenty lives. That is the right question for
 * tuning one wave, and the wrong one for tuning the game: it cannot see whether
 * the player could ever have *afforded* the towers it just placed, and it
 * cannot see damage accumulating across waves.
 *
 * This harness runs all ten waves on a single world, so gold and lives carry
 * over exactly as they do in a real run. Towers come from a purchase plan in
 * priority order: at the start of each wave the next tower in the plan is
 * bought if -- and only if -- the wallet covers it. A plan that front-loads
 * cheap towers therefore behaves differently from one that saves for an
 * expensive one, which is the whole point.
 *
 *   npm run campaign -- --plan "vat@5,1 stamp@5,5 chiller@14,9 stamp@18,3"
 *   npm run campaign -- --plan "$(cat .claude/skills/balance-pass/reference/plan.txt)" --json
 *
 * Plan syntax is `towerId@col,row`, the same as `npm run sim --loadout`.
 */
import { parseArgs } from 'node:util';
import { TOWERS, TOWER_IDS } from './sim/towers.ts';
import { STATE_IDS } from './sim/types.ts';
import type { State, Status, TowerId } from './sim/types.ts';
import { WAVES } from './sim/waves.ts';
import { createWorld, placeTower, startWave, step } from './sim/world.ts';
import type { World } from './sim/world.ts';

interface Purchase {
  def: TowerId;
  col: number;
  row: number;
}

interface WaveLog {
  wave: number;
  /** Towers bought at the start of this wave, in the order the plan named them. */
  bought: string[];
  goldAtWaveStart: number;
  goldAfter: number;
  livesAfter: number;
  leaks: number;
  livesLost: number;
  shatters: number;
  splits: number;
  leaksByState: Record<State, number>;
  cleared: boolean;
}

export interface CampaignResult {
  seed: number;
  won: boolean;
  wavesCleared: number;
  livesLeft: number;
  goldLeft: number;
  towersBuilt: number;
  /** Towers still in the plan when the run ended -- gold the player never spent. */
  planRemaining: number;
  waves: WaveLog[];
}

export function parsePlan(raw: string): Purchase[] {
  if (!raw.trim()) return [];
  return raw
    .split(/[;\s]+/)
    .filter(Boolean)
    .map((entry) => {
      const m = /^([a-z]+)@(\d+),(\d+)$/.exec(entry.trim());
      if (!m) throw new Error(`bad plan entry "${entry}" -- expected e.g. vat@5,1`);
      const def = m[1] as TowerId;
      if (!TOWER_IDS.includes(def)) {
        throw new Error(`unknown tower "${def}" -- known: ${TOWER_IDS.join(', ')}`);
      }
      return { def, col: Number(m[2]), row: Number(m[3]) };
    });
}

/**
 * `step()` mutates `w.status`, but TypeScript cannot see that through the call
 * and narrows the field to whatever the enclosing loop condition proved. Every
 * status read in this file goes through here so the checks stay honest.
 */
function statusOf(w: World): Status {
  return w.status;
}

function snapshot(w: World) {
  return {
    leaks: w.stats.leaks,
    livesLost: w.stats.livesLost,
    shatters: w.stats.shatters,
    splits: w.stats.splits,
    leaksByState: { ...w.stats.leaksByState },
  };
}

export function runCampaign(plan: Purchase[], seed: number, maxTicks: number): CampaignResult {
  const w = createWorld(seed);
  const queue = [...plan];
  const waves: WaveLog[] = [];
  let built = 0;

  while (statusOf(w) === 'idle' && w.waveIndex < WAVES.length) {
    const waveNo = w.waveIndex + 1;
    const goldAtWaveStart = w.gold;

    // Buy greedily from the head of the plan. Stopping at the first tower the
    // player cannot afford is what makes saving strategies representable: an
    // expensive tower at the head of the plan blocks the cheap ones behind it.
    const bought: string[] = [];
    while (queue.length > 0 && TOWERS[queue[0]!.def].cost <= w.gold) {
      const p = queue[0]!;
      if (!placeTower(w, p.def, p.col, p.row)) {
        throw new Error(`cannot place ${p.def} at ${p.col},${p.row} -- on the lane, or occupied`);
      }
      queue.shift();
      bought.push(`${p.def}@${p.col},${p.row}`);
      built++;
    }

    const before = snapshot(w);
    startWave(w);
    let ticks = 0;
    while (statusOf(w) === 'running' && ticks < maxTicks) {
      step(w);
      ticks++;
    }
    const after = snapshot(w);

    const leaksByState = {} as Record<State, number>;
    for (const st of STATE_IDS) leaksByState[st] = after.leaksByState[st] - before.leaksByState[st];

    waves.push({
      wave: waveNo,
      bought,
      goldAtWaveStart,
      goldAfter: w.gold,
      livesAfter: w.lives,
      leaks: after.leaks - before.leaks,
      livesLost: after.livesLost - before.livesLost,
      shatters: after.shatters - before.shatters,
      splits: after.splits - before.splits,
      leaksByState,
      cleared: statusOf(w) !== 'lost' && w.waveIndex >= waveNo,
    });

    if (statusOf(w) === 'lost') break;
    // A wave that neither cleared nor lost hit the tick ceiling; stop rather
    // than spin forever on a stalemate.
    if (statusOf(w) === 'running') break;
  }

  return {
    seed,
    won: statusOf(w) === 'won',
    wavesCleared: w.waveIndex,
    livesLeft: w.lives,
    goldLeft: w.gold,
    towersBuilt: built,
    planRemaining: queue.length,
    waves,
  };
}

function printRun(r: CampaignResult): void {
  const head = ['wv', 'bought', 'gold', 'lives', 'leaks', 'lost', 'shat', 'split'];
  const rows = r.waves.map((v) => [
    String(v.wave),
    v.bought.join(' ') || '-',
    String(v.goldAtWaveStart),
    String(v.livesAfter),
    String(v.leaks),
    String(v.livesLost),
    String(v.shatters),
    String(v.splits),
  ]);
  const widths = head.map((h, i) => Math.max(h.length, ...rows.map((row) => row[i]!.length)));
  const line = (cells: string[]) =>
    cells.map((c, i) => (i === 1 ? c.padEnd(widths[i]!) : c.padStart(widths[i]!))).join('  ');
  console.log(line(head));
  console.log(widths.map((wd) => '-'.repeat(wd)).join('  '));
  for (const row of rows) console.log(line(row));

  const leaky = r.waves.filter((v) => v.leaks > 0);
  if (leaky.length > 0) {
    console.log('\nwhat leaked:');
    for (const v of leaky) {
      const parts = STATE_IDS.filter((s) => v.leaksByState[s] > 0).map((s) => `${s} ${v.leaksByState[s]}`);
      console.log(`  wave ${String(v.wave).padStart(2)}  ${parts.join(', ')}`);
    }
  }

  const verdict = r.won
    ? `WON with ${r.livesLeft}/20 lives`
    : `LOST on wave ${r.wavesCleared + 1} (cleared ${r.wavesCleared})`;
  console.log(`\n${verdict}, ${r.goldLeft} gold left, ${r.towersBuilt} towers built.`);
  if (r.planRemaining > 0) {
    console.log(
      `${r.planRemaining} tower(s) still unbought -- the plan ran out of things to buy before the ` +
        `wallet ran out of gold, so this run was not purchase-limited.`,
    );
  }
}

function main(): void {
  const { values } = parseArgs({
    options: {
      plan: { type: 'string', default: '' },
      runs: { type: 'string', default: '1' },
      seed: { type: 'string', default: '1' },
      'max-ticks': { type: 'string', default: '20000' },
      json: { type: 'boolean', default: false },
    },
    allowPositionals: false,
  });

  const plan = parsePlan(values.plan ?? '');
  if (plan.length === 0) throw new Error('--plan is required, e.g. --plan "vat@5,1 stamp@5,5"');
  const runs = Math.max(1, Number(values.runs));
  const seed = Number(values.seed);
  const maxTicks = Number(values['max-ticks']);

  const results = Array.from({ length: runs }, (_, i) => runCampaign(plan, seed + i, maxTicks));

  if (values.json) {
    console.log(JSON.stringify({ plan, runs, seed, results }, null, 2));
    return;
  }

  console.log(`\nPlan: ${plan.map((p) => `${TOWERS[p.def].name}@${p.col},${p.row}`).join(' -> ')}\n`);
  printRun(results[0]!);

  if (runs > 1) {
    const won = results.filter((r) => r.won).length;
    const avg = (pick: (r: CampaignResult) => number) =>
      (results.reduce((n, r) => n + pick(r), 0) / runs).toFixed(2);
    console.log(
      `\nacross ${runs} seeds: ${((won / runs) * 100).toFixed(0)}% won, ` +
        `avg ${avg((r) => r.wavesCleared)} waves cleared, avg ${avg((r) => r.livesLeft)} lives left.`,
    );
  }
  console.log();
}

// Only run the CLI when invoked directly, so tests can import the harness.
if (import.meta.main) main();
