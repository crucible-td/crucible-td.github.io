/** DOM chrome around the canvas: readouts, build menu, table reference, overlay. */
import { TRANSMUTATION } from '../sim/table.ts';
import type { Outcome } from '../sim/table.ts';
import { TOWERS, TOWER_IDS } from '../sim/towers.ts';
import { ELEMENT_IDS, STATES, STATE_IDS } from '../sim/types.ts';
import type { TowerId } from '../sim/types.ts';
import { WAVES } from '../sim/waves.ts';
import type { World } from '../sim/world.ts';

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`missing element #${id}`);
  return node as T;
}

/** Human-readable one-liner for a table cell. */
export function describeOutcome(o: Outcome): string {
  switch (o.kind) {
    case 'none':
      return '—';
    case 'transmute':
      return `→ ${STATES[o.to].label}`;
    case 'split':
      return `splits ×${o.count}`;
    case 'destroy':
      return o.shatter ? `shatter +${o.gold}` : `destroy +${o.gold}`;
    case 'speed':
      return `speeds ×${o.mult}`;
    case 'damage':
      return 'chips';
  }
}

export interface UiHandlers {
  onSelect(id: TowerId | null): void;
  onStartWave(): void;
  onRestart(): void;
}

export class Ui {
  private buttons = new Map<TowerId, HTMLButtonElement>();

  constructor(private handlers: UiHandlers) {
    this.buildTowerMenu();
    this.buildTableReference();
    el<HTMLButtonElement>('startWave').addEventListener('click', () => handlers.onStartWave());
    el<HTMLButtonElement>('restart').addEventListener('click', () => handlers.onRestart());
  }

  private buildTowerMenu(): void {
    const list = el('towerList');
    for (const id of TOWER_IDS) {
      const def = TOWERS[id];
      const btn = document.createElement('button');
      btn.className = 'tower';
      btn.style.setProperty('--slot', def.color);
      btn.setAttribute('aria-pressed', 'false');
      btn.innerHTML =
        `<span class="row"><span class="name">${def.name}</span><span class="cost">${def.cost}g</span></span>` +
        `<span class="blurb">${def.blurb}</span>`;
      btn.addEventListener('click', () => this.handlers.onSelect(id));
      list.appendChild(btn);
      this.buttons.set(id, btn);
    }
  }

  private buildTableReference(): void {
    const rows = STATE_IDS.map((s) => {
      const cells = ELEMENT_IDS.map((e) => `<td>${describeOutcome(TRANSMUTATION[s][e])}</td>`).join('');
      return `<tr><th>${STATES[s].label}</th>${cells}</tr>`;
    }).join('');
    el('tableBody').innerHTML =
      `<table><tr><th></th>${ELEMENT_IDS.map((e) => `<th>${e[0]! + e.slice(1).toLowerCase()}</th>`).join('')}</tr>${rows}</table>`;
  }

  sync(world: World, selected: TowerId | null): void {
    el('gold').textContent = String(world.gold);
    el('lives').textContent = String(world.lives);
    el('wave').textContent = `${Math.min(world.waveIndex + 1, WAVES.length)}/${WAVES.length}`;

    for (const [id, btn] of this.buttons) {
      btn.setAttribute('aria-pressed', String(id === selected));
      btn.disabled = world.gold < TOWERS[id].cost;
    }

    const start = el<HTMLButtonElement>('startWave');
    start.disabled = world.status !== 'idle';
    start.textContent = world.status === 'running' ? 'Wave in progress' : 'Start wave';

    const hint = el('hint');
    if (world.status === 'idle' && world.waveIndex < WAVES.length) {
      hint.textContent = `Wave ${world.waveIndex + 1}: ${WAVES[world.waveIndex]!.hint}`;
    } else if (world.status === 'running') {
      hint.textContent = WAVES[world.waveIndex]?.hint ?? '';
    }

    const overlay = el('overlay');
    const ended = world.status === 'won' || world.status === 'lost';
    overlay.hidden = !ended;
    if (ended) {
      el('overlayTitle').textContent = world.status === 'won' ? 'Furnace cold' : 'Breach';
      el('overlayBody').textContent =
        world.status === 'won'
          ? `All ten waves processed. ${world.stats.shatters} shattered, ${world.stats.transmutes} transmutations, ${world.stats.goldEarned} gold earned.`
          : `The line failed on wave ${world.waveIndex + 1}. ${world.stats.leaks} charges got through; ${world.stats.splits} were split by badly placed Kinetic.`;
    }
  }
}
