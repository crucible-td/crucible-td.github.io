/**
 * Headless playtest harness.
 *
 * Runs waves with no renderer and no clock, then reports what happened. This
 * is the agent-facing surface of the project: balance questions ("is wave 7
 * survivable with two towers?") become measurements instead of opinions.
 *
 *   npm run sim -- --all-waves
 *   npm run sim -- --wave 7 --loadout "forge@6,1 chiller@9,1 stamp@12,1" --runs 200
 *   npm run sim -- --all-waves --json
 *
 * Loadout syntax is `towerId@col,row`, separated by spaces or semicolons.
 * Towers are placed free of charge so that a wave's difficulty can be measured
 * independently of the economy.
 */
import { parseArgs } from 'node:util';
import { ECONOMY } from './sim/economy.ts';
import { parseLoadout, describePlacement } from './sim/loadout.ts';
import type { Placement } from './sim/loadout.ts';
import { TOWERS } from './sim/towers.ts';
import { STATE_IDS } from './sim/types.ts';
import type { State } from './sim/types.ts';
import { WAVES } from './sim/waves.ts';
import { createWorld, placeTower, startWave, step, towerAt, upgradeTower } from './sim/world.ts';

interface WaveResult {
  wave: number;
  runs: number;
  winRate: number;
  avgLivesLost: number;
  avgLeaks: number;
  avgGold: number;
  avgTicks: number;
  avgBreaks: number;
  /** Shots landing on something immune -- a build with no answer to a layer. */
  avgWasted: number;
  /** Average leaks per run, broken down by the state that got through. */
  leaksByState: Record<State, number>;
}


function runWave(waveIndex: number, loadout: Placement[], seed: number, maxTicks: number) {
  const w = createWorld(seed);
  w.waveIndex = waveIndex;

  // Placement is free here: we are measuring wave pressure, not affordability.
  w.gold = Number.MAX_SAFE_INTEGER;
  for (const p of loadout) {
    if (!placeTower(w, p.def, p.col, p.row)) {
      throw new Error(`cannot place ${p.def} at ${p.col},${p.row} -- on the lane, or occupied`);
    }
    if (p.upgrade) {
      const t = towerAt(w, p.col, p.row)!;
      if (!upgradeTower(w, t, p.upgrade)) {
        throw new Error(`cannot apply ${p.upgrade} to ${p.def} at ${p.col},${p.row}`);
      }
    }
  }
  w.gold = ECONOMY.startGold;

  startWave(w);
  let ticks = 0;
  while (w.status === 'running' && ticks < maxTicks) {
    step(w);
    ticks++;
  }
  return { world: w, ticks, timedOut: ticks >= maxTicks };
}

function measure(waveIndex: number, loadout: Placement[], runs: number, seed: number, maxTicks: number): WaveResult {
  let wins = 0;
  const totals = { lives: 0, leaks: 0, gold: 0, ticks: 0, breaks: 0, wasted: 0 };
  const leaked: Record<State, number> = { ORE: 0, SLAG: 0, MOLTEN: 0, CRYSTAL: 0, VAPOR: 0 };
  for (let i = 0; i < runs; i++) {
    const { world, ticks } = runWave(waveIndex, loadout, seed + i, maxTicks);
    if (world.status !== 'lost') wins++;
    totals.lives += world.stats.livesLost;
    totals.leaks += world.stats.leaks;
    totals.gold += world.stats.goldEarned;
    totals.ticks += ticks;
    totals.breaks += world.stats.breaks;
    totals.wasted += world.stats.wasted;
    for (const st of STATE_IDS) leaked[st] += world.stats.leaksByState[st];
  }
  const avg = (n: number) => Number((n / runs).toFixed(2));
  return {
    wave: waveIndex + 1,
    runs,
    winRate: Number(((wins / runs) * 100).toFixed(1)),
    avgLivesLost: avg(totals.lives),
    avgLeaks: avg(totals.leaks),
    avgGold: avg(totals.gold),
    avgTicks: avg(totals.ticks),
    avgBreaks: avg(totals.breaks),
    avgWasted: avg(totals.wasted),
    leaksByState: {
      ORE: avg(leaked.ORE),
      SLAG: avg(leaked.SLAG),
      MOLTEN: avg(leaked.MOLTEN),
      CRYSTAL: avg(leaked.CRYSTAL),
      VAPOR: avg(leaked.VAPOR),
    },
  };
}

function printTable(results: WaveResult[], loadout: Placement[]): void {
  const desc = loadout.length
    ? loadout.map((p) => `${TOWERS[p.def].name}${describePlacement(p).slice(p.def.length)}`).join(' + ')
    : '(no towers -- raw wave pressure)';
  console.log(`\nLoadout: ${desc}`);
  console.log(`Lives per run: ${ECONOMY.startLives}\n`);
  const head = ['wave', 'runs', 'win%', 'lives lost', 'leaks', 'gold', 'ticks', 'breaks', 'wasted'];
  const rows = results.map((r) => [
    String(r.wave),
    String(r.runs),
    r.winRate.toFixed(1),
    r.avgLivesLost.toFixed(2),
    r.avgLeaks.toFixed(2),
    r.avgGold.toFixed(1),
    r.avgTicks.toFixed(0),
    r.avgBreaks.toFixed(2),
    r.avgWasted.toFixed(2),
  ]);
  const widths = head.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i]!.length)));
  const line = (cells: string[]) => cells.map((c, i) => c.padStart(widths[i]!)).join('  ');
  console.log(line(head));
  console.log(widths.map((wd) => '-'.repeat(wd)).join('  '));
  for (const r of rows) console.log(line(r));

  const leaky = results.filter((r) => r.avgLeaks > 0);
  if (leaky.length > 0) {
    console.log('\nwhat leaked (avg per run):');
    for (const r of leaky) {
      const parts = STATE_IDS.filter((s) => r.leaksByState[s] > 0).map((s) => `${s} ${r.leaksByState[s]}`);
      console.log(`  wave ${String(r.wave).padStart(2)}  ${parts.join(', ')}`);
    }
  }
  console.log();
}

function main(): void {
  const { values } = parseArgs({
    options: {
      wave: { type: 'string' },
      'all-waves': { type: 'boolean', default: false },
      runs: { type: 'string', default: '50' },
      seed: { type: 'string', default: '1' },
      loadout: { type: 'string', default: '' },
      'max-ticks': { type: 'string', default: '20000' },
      json: { type: 'boolean', default: false },
    },
    allowPositionals: false,
  });

  const loadout = parseLoadout(values.loadout ?? '');
  const runs = Math.max(1, Number(values.runs));
  const seed = Number(values.seed);
  const maxTicks = Number(values['max-ticks']);

  const waves = values['all-waves']
    ? WAVES.map((_, i) => i)
    : [Math.max(1, Number(values.wave ?? '1')) - 1];

  for (const i of waves) {
    if (i < 0 || i >= WAVES.length) throw new Error(`no such wave: ${i + 1} (1..${WAVES.length})`);
  }

  const results = waves.map((i) => measure(i, loadout, runs, seed, maxTicks));

  if (values.json) {
    console.log(JSON.stringify({ loadout, runs, seed, results }, null, 2));
  } else {
    printTable(results, loadout);
  }
}

main();
