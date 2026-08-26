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
 * Plan syntax is `towerId@col,row[+upgradeId]`, the same as `npm run sim
 * --loadout`. A tower and its upgrade are two separate purchases: the tower is
 * bought in plan order, and its upgrade is paid for later out of whatever gold
 * is spare, which is how upgrades absorb the late-game surplus.
 */
import { parseArgs } from 'node:util';
import { parseLoadout, describePlacement } from './sim/loadout.ts';
import type { Placement } from './sim/loadout.ts';
import { TOWERS } from './sim/towers.ts';
import { STATE_IDS } from './sim/types.ts';
import type { State, Status, UpgradeId } from './sim/types.ts';
import { WAVES } from './sim/waves.ts';
import { createWorld, placeTower, startWave, step, towerAt, upgradeTower } from './sim/world.ts';
import type { World } from './sim/world.ts';

interface WaveLog {
  wave: number;
  /** Towers bought at the start of this wave, in the order the plan named them. */
  bought: string[];
  goldAtWaveStart: number;
  goldAfter: number;
  livesAfter: number;
  leaks: number;
  livesLost: number;
  breaks: number;
  wasted: number;
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
  upgradesBought: number;
  /** Towers and upgrades still unbought when the run ended. */
  planRemaining: number;
  waves: WaveLog[];
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
    breaks: w.stats.breaks,
    wasted: w.stats.wasted,
    leaksByState: { ...w.stats.leaksByState },
  };
}

export function runCampaign(plan: Placement[], seed: number, maxTicks: number): CampaignResult {
  const w = createWorld(seed);
  const queue = [...plan];
  const waves: WaveLog[] = [];
  /** Upgrades whose tower is built but which are not yet paid for. */
  const pending: { at: Placement; id: UpgradeId }[] = [];
  let built = 0;
  let upgraded = 0;

  while (statusOf(w) === 'idle' && w.waveIndex < WAVES.length) {
    const waveNo = w.waveIndex + 1;
    const goldAtWaveStart = w.gold;

    // Buy greedily from the head of the plan. Stopping at the first tower the
    // player cannot afford is what makes saving strategies representable: an
    // expensive tower at the head of the plan blocks the cheap ones behind it.
    //
    // A tower and its upgrade are two purchases, not one. Charging for both at
    // once made an upgraded entry stall the whole queue -- the player banked
    // gold rather than building, and ended the run *richer*. Boards get built
    // first and upgraded out of what is left over, which is both what a real
    // player does and what makes upgrades a sink for the late surplus.
    const bought: string[] = [];

    while (queue.length > 0 && TOWERS[queue[0]!.def].cost <= w.gold) {
      const p = queue[0]!;
      if (!placeTower(w, p.def, p.col, p.row)) {
        throw new Error(`cannot place ${p.def} at ${p.col},${p.row} -- on the lane, or occupied`);
      }
      queue.shift();
      bought.push(`${p.def}@${p.col},${p.row}`);
      built++;
      if (p.upgrade) pending.push({ at: p, id: p.upgrade });
    }

    // Then settle any upgrades owed on towers already standing, out of what is
    // left. Towers come first deliberately: paying for upgrades ahead of them
    // starves the board and measured catastrophically -- 50% of runs lost and
    // 1.1 lives left, against 100% and 12.5 when towers win the tie. An
    // upgrade is a luxury bought once the line is built, which is exactly the
    // role the late-game surplus needs filling. This runs in the same wave
    // break as the purchase above, so a tower bought on the last wave can
    // still be upgraded rather than stranding its branch unpaid.
    for (let i = 0; i < pending.length; ) {
      const { at, id } = pending[i]!;
      const t = towerAt(w, at.col, at.row);
      if (t && upgradeTower(w, t, id)) {
        pending.splice(i, 1);
        bought.push(`+${id}@${at.col},${at.row}`);
        upgraded++;
      } else {
        i++;
      }
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
      breaks: after.breaks - before.breaks,
      wasted: after.wasted - before.wasted,
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
    upgradesBought: upgraded,
    planRemaining: queue.length + pending.length,
    waves,
  };
}

function printRun(r: CampaignResult): void {
  const head = ['wv', 'bought', 'gold', 'lives', 'leaks', 'lost', 'broke', 'wasted'];
  const rows = r.waves.map((v) => [
    String(v.wave),
    v.bought.join(' ') || '-',
    String(v.goldAtWaveStart),
    String(v.livesAfter),
    String(v.leaks),
    String(v.livesLost),
    String(v.breaks),
    String(v.wasted),
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
  console.log(
    `\n${verdict}, ${r.goldLeft} gold left, ${r.towersBuilt} towers built, ` +
      `${r.upgradesBought} upgrades bought.`,
  );
  if (r.planRemaining > 0) {
    console.log(
      `${r.planRemaining} tower(s) never bought, with ${r.goldLeft} gold still in hand. The run ` +
        `ended before the plan did -- if that gold figure is large, the late economy is paying ` +
        `for towers there is no longer any wave left to place them for.`,
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

  const plan = parseLoadout(values.plan ?? '');
  if (plan.length === 0) throw new Error('--plan is required, e.g. --plan "vat@5,1 stamp@5,5"');
  const runs = Math.max(1, Number(values.runs));
  const seed = Number(values.seed);
  const maxTicks = Number(values['max-ticks']);

  const results = Array.from({ length: runs }, (_, i) => runCampaign(plan, seed + i, maxTicks));

  if (values.json) {
    console.log(JSON.stringify({ plan, runs, seed, results }, null, 2));
    return;
  }

  console.log(`\nPlan: ${plan.map(describePlacement).join(' -> ')}\n`);
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
