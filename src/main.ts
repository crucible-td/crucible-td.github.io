/**
 * Browser entry point: input, the fixed-timestep loop, and nothing else.
 *
 * All game logic lives in src/sim. This file exists to feed it clicks and to
 * ask the renderer to draw whatever came out.
 */
import { Renderer } from './render/canvas.ts';
import { createClock, nextSpeed, ticksFor } from './render/clock.ts';
import type { Speed } from './render/clock.ts';
import { armTower, boardAction, towerForKey } from './render/decisions.ts';
import { Ui } from './render/ui.ts';
import { BOARD } from './sim/path.ts';
import type { Tower, TowerId, UpgradeId } from './sim/types.ts';
import { createWorld, placeTower, startWave, step, towerAt, upgradeTower } from './sim/world.ts';

const canvas = document.getElementById('board') as HTMLCanvasElement | null;
if (!canvas) throw new Error('missing #board canvas');

const renderer = new Renderer(canvas);
let world = createWorld(Math.floor(Math.random() * 1e9));
let selected: TowerId | null = null;
let hover: { col: number; row: number } | null = null;
/** The placed tower whose upgrade panel is open, if any. */
let inspected: Tower | null = null;
/** An upgrade being hovered in the panel, previewed on the board. */
let previewUpgrade: UpgradeId | null = null;
/** How fast the simulation runs. 0 is paused; the tick itself never changes. */
let speed: Speed = 1;
/** The speed to return to when unpausing. */
let resumeSpeed: Speed = 1;

/**
 * Pause and speed, as functions rather than inline handlers, because both the
 * buttons and the keyboard drive them and one implementation is easier to keep
 * honest than two.
 *
 * Each repaints synchronously: while paused no frame advances the sim, so
 * waiting for the next one would leave the control looking dead at exactly the
 * moment the player pressed it.
 */
function togglePause(): void {
  if (speed === 0) {
    speed = resumeSpeed;
  } else {
    resumeSpeed = speed;
    speed = 0;
  }
  ui.sync(world, selected, inspected, speed);
}

function cycleSpeed(): void {
  speed = nextSpeed(speed === 0 ? resumeSpeed : speed);
  resumeSpeed = speed;
  ui.sync(world, selected, inspected, speed);
}

/**
 * Arm a tower, from wherever the intent came from.
 *
 * Both the build card and its number key land here. They used to be two
 * implementations and had drifted apart -- the key neither toggled off nor
 * closed the upgrade panel -- so the decision itself now lives in
 * `decisions.ts` where a test can reach it, and this is only the wiring.
 */
function selectTower(id: TowerId): void {
  const next = armTower(selected, id);
  selected = next.selected;
  if (next.closeInspect) inspected = null;
  // Repaint now: picking a tower lights its column in the resistance table,
  // and that should answer "what does this one do" on the same click.
  ui.sync(world, selected, inspected, speed);
}

const ui = new Ui({
  onSelect(id) {
    selectTower(id);
  },
  onUpgrade(tower, id) {
    upgradeTower(world, tower, id);
    // The hovered branch has just been bought, so the preview is now the
    // tower's actual reach and the ghost ring should stop being drawn.
    previewUpgrade = null;
    // Same reason: the branch is bought now, so the panel should say so now.
    ui.sync(world, selected, inspected, speed);
  },
  onCloseInspect() {
    inspected = null;
    previewUpgrade = null;
  },
  onPreviewUpgrade(id) {
    previewUpgrade = id;
  },
  onTogglePause: togglePause,
  onCycleSpeed: cycleSpeed,
  onStartWave() {
    startWave(world);
  },
  onRestart() {
    world = createWorld(Math.floor(Math.random() * 1e9));
    selected = null;
    inspected = null;
  },
});

/** Which grid cell a pointer event landed on. */
function cellUnder(ev: MouseEvent): { col: number; row: number } {
  const p = renderer.toBoard(ev);
  return { col: Math.floor(p.x / BOARD.cell), row: Math.floor(p.y / BOARD.cell) };
}

canvas.addEventListener('mousemove', (ev) => {
  hover = cellUnder(ev);
});

canvas.addEventListener('mouseleave', () => {
  hover = null;
});

canvas.addEventListener('click', (ev) => {
  // Read the cell from the click itself rather than from the last mousemove.
  // A touch device never sends mousemove, so a hover-derived cell left the
  // game completely unplayable on a phone -- every tap did nothing.
  const cell = cellUnder(ev);
  const here = towerAt(world, cell.col, cell.row);

  switch (boardAction({ selected: selected !== null, towerHere: here !== undefined })) {
    case 'inspect':
      inspected = here ?? null;
      previewUpgrade = null;
      break;
    case 'close':
      inspected = null;
      previewUpgrade = null;
      break;
    case 'disarm':
      selected = null;
      break;
    case 'place':
      // Selection persists after a successful build so a line can be laid down
      // in one pass. Escape, right-click, or clicking a placed tower clears it.
      placeTower(world, selected!, cell.col, cell.row);
      return;
  }

  // Repaint now rather than waiting for the next animation frame. The loop
  // would catch up, but requestAnimationFrame is throttled in a background or
  // unfocused tab, so "the panel is showing the tower I clicked before this
  // one" is a real thing a player can see.
  ui.sync(world, selected, inspected, speed);
});

canvas.addEventListener('contextmenu', (ev) => {
  ev.preventDefault();
  selected = null;
  ui.sync(world, selected, inspected, speed);
});

window.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape') {
    selected = null;
    inspected = null;
    // Repaint now, for the same reason the click handler does: the next
    // animation frame may be a long way off in an unfocused tab, and a build
    // card still lit after the player pressed Escape reads as a stuck menu.
    ui.sync(world, selected, inspected, speed);
  }
  if (ev.key === ' ') {
    ev.preventDefault();
    startWave(world);
  }
  // Digits pick towers, so the speed controls take letters.
  if (ev.key === 'p' || ev.key === 'P') togglePause();
  if (ev.key === 'f' || ev.key === 'F') cycleSpeed();
  const keyed = towerForKey(ev.key);
  if (keyed) selectTower(keyed);
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
const clock = createClock();

function frame(now: number): void {
  // Fixed timestep: the browser and `npm run sim` must agree tick for tick.
  // Speed changes how many of these run per real second, never their size.
  const ticks = ticksFor(clock, now - last, speed);
  last = now;

  for (let i = 0; i < ticks; i++) {
    step(world);
    renderer.ingest(world.events);
  }

  // Rendering continues while paused, so the board stays readable and towers
  // can still be placed and upgraded -- which is most of the point of a pause.
  renderer.draw(world, hover, selected, inspected, previewUpgrade);
  ui.sync(world, selected, inspected, speed);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
