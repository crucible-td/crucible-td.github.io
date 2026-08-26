/**
 * Browser entry point: input, the fixed-timestep loop, and nothing else.
 *
 * All game logic lives in src/sim. This file exists to feed it clicks and to
 * ask the renderer to draw whatever came out.
 */
import { Renderer } from './render/canvas.ts';
import { Ui } from './render/ui.ts';
import { BOARD } from './sim/path.ts';
import type { Tower, TowerId } from './sim/types.ts';
import { createWorld, placeTower, startWave, step, towerAt, upgradeTower } from './sim/world.ts';

const TICK_MS = 1000 / 60;
/** Cap catch-up work so a backgrounded tab cannot stall the page on return. */
const MAX_CATCHUP_MS = 250;

const canvas = document.getElementById('board') as HTMLCanvasElement | null;
if (!canvas) throw new Error('missing #board canvas');

const renderer = new Renderer(canvas);
let world = createWorld(Math.floor(Math.random() * 1e9));
let selected: TowerId | null = null;
let hover: { col: number; row: number } | null = null;
/** The placed tower whose upgrade panel is open, if any. */
let inspected: Tower | null = null;

const ui = new Ui({
  onSelect(id) {
    selected = selected === id ? null : id;
    // Picking something to build is a different intent from inspecting what is
    // already built, so it closes the panel.
    if (selected) inspected = null;
  },
  onUpgrade(tower, id) {
    upgradeTower(world, tower, id);
    // Same reason: the branch is bought now, so the panel should say so now.
    ui.sync(world, selected, inspected);
  },
  onCloseInspect() {
    inspected = null;
  },
  onStartWave() {
    startWave(world);
  },
  onRestart() {
    world = createWorld(Math.floor(Math.random() * 1e9));
    selected = null;
    inspected = null;
  },
});

canvas.addEventListener('mousemove', (ev) => {
  const p = renderer.toBoard(ev);
  hover = { col: Math.floor(p.x / BOARD.cell), row: Math.floor(p.y / BOARD.cell) };
});

canvas.addEventListener('mouseleave', () => {
  hover = null;
});

canvas.addEventListener('click', () => {
  if (!hover) return;
  if (!selected) {
    // Nothing queued to build, so a click on an existing tower means "tell me
    // about this one" and opens its upgrade panel. Clicking bare ground closes
    // it again.
    inspected = towerAt(world, hover.col, hover.row) ?? null;
    // Repaint the panel now rather than waiting for the next animation frame.
    // The frame loop would catch up anyway, but only once it runs -- and
    // requestAnimationFrame is throttled in a background or unfocused tab, so
    // "the panel is showing the tower I clicked before this one" is a real
    // thing a player can see.
    ui.sync(world, selected, inspected);
    return;
  }
  // Selection persists after a successful build so a line can be laid down in
  // one pass. Escape or right-click clears it.
  placeTower(world, selected, hover.col, hover.row);
});

canvas.addEventListener('contextmenu', (ev) => {
  ev.preventDefault();
  selected = null;
});

window.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape') {
    selected = null;
    inspected = null;
  }
  if (ev.key === ' ') {
    ev.preventDefault();
    startWave(world);
  }
  const n = Number(ev.key);
  if (n >= 1 && n <= 4) {
    const ids: TowerId[] = ['forge', 'chiller', 'stamp', 'vat'];
    selected = ids[n - 1] ?? null;
  }
});

if (import.meta.env.DEV) {
  // Dev-only console handle. requestAnimationFrame pauses in a hidden tab, so
  // being able to drive the simulation directly is the difference between
  // debugging the game and debugging the browser.
  //   crucible.place('forge', 5, 4); crucible.startWave(); crucible.advance(1200);
  Object.defineProperty(window, 'crucible', {
    value: {
      get world() {
        return world;
      },
      advance(ticks: number) {
        for (let i = 0; i < ticks; i++) step(world);
        return { tick: world.tick, gold: world.gold, lives: world.lives, status: world.status, ...world.stats };
      },
      place: (def: TowerId, col: number, row: number) => placeTower(world, def, col, row),
      startWave: () => startWave(world),
    },
  });
}

let last = performance.now();
let accumulator = 0;

function frame(now: number): void {
  accumulator = Math.min(accumulator + (now - last), MAX_CATCHUP_MS);
  last = now;

  // Fixed timestep: the browser and `npm run sim` must agree tick for tick.
  while (accumulator >= TICK_MS) {
    step(world);
    renderer.ingest(world.events);
    accumulator -= TICK_MS;
  }

  renderer.draw(world, hover, selected);
  ui.sync(world, selected, inspected);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
