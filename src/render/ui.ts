/** DOM chrome around the canvas: readouts, build menu, table reference, overlay. */
import { RESISTANCE } from '../sim/resistance.ts';
import { TOWERS, TOWER_IDS } from '../sim/towers.ts';
import { UPGRADES, upgradesFor } from '../sim/upgrades.ts';
import { ELEMENT_IDS, STATES, STATE_IDS } from '../sim/types.ts';
import type { Element } from '../sim/types.ts';
import type { State, Tower, TowerId, UpgradeId } from '../sim/types.ts';
import { WAVES } from '../sim/waves.ts';
import type { World } from '../sim/world.ts';

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`missing element #${id}`);
  return node as T;
}

/**
 * Human-readable one-liner for a resistance cell.
 *
 * Zero is the one the player most needs to read at a glance, so it gets a word
 * rather than a number -- an immunity is a wall, not a small multiplier.
 */
/** "HEAT" -> "Heat". Used by the tower cards and the table header alike. */
function elementLabel(e: Element): string {
  return e[0]! + e.slice(1).toLowerCase();
}

export function describeOutcome(mult: number): string {
  if (mult <= 0) return 'immune';
  if (mult === 1) return '×1';
  return `×${mult}`;
}

export interface UiHandlers {
  onSelect(id: TowerId | null): void;
  onStartWave(): void;
  onRestart(): void;
  onUpgrade(tower: Tower, id: UpgradeId): void;
  onCloseInspect(): void;
}

/**
 * "MOLTEN + Kinetic: splits x3 -> chips" for every cell a branch rewrites.
 *
 * Reuses describeOutcome so the upgrade panel and the resistance reference
 * always describe an Outcome the same way.
 */
function describeOverrides(id: UpgradeId): string[] {
  const out: string[] = [];
  for (const [state, row] of Object.entries(UPGRADES[id].overrides ?? {})) {
    for (const [element, outcome] of Object.entries(row)) {
      const before = describeOutcome(RESISTANCE[state as State][element as Element]);
      const label = element[0]! + element.slice(1).toLowerCase();
      // "Vapor + Cold: → Crystal (was → Molten)" -- the new behaviour first,
      // since that is what the player is deciding to buy.
      out.push(`${STATES[state as State].label} + ${label}: ${describeOutcome(outcome)} (was ${before})`);
    }
  }
  return out;
}

export class Ui {
  private buttons = new Map<TowerId, HTMLButtonElement>();

  constructor(private handlers: UiHandlers) {
    this.buildTowerMenu();
    this.buildTableReference();
    el<HTMLButtonElement>('startWave').addEventListener('click', () => handlers.onStartWave());
    el<HTMLButtonElement>('restart').addEventListener('click', () => handlers.onRestart());
    el<HTMLButtonElement>('inspectClose').addEventListener('click', () => handlers.onCloseInspect());
  }

  private buildTowerMenu(): void {
    const list = el('towerList');
    for (const id of TOWER_IDS) {
      const def = TOWERS[id];
      const btn = document.createElement('button');
      btn.className = 'tower';
      btn.style.setProperty('--slot', def.color);
      btn.setAttribute('aria-pressed', 'false');
      // Naming the element on the card is what makes the resistance table
      // readable: there are five towers and only four elements, so without
      // this the table looks like it is missing a column.
      btn.innerHTML =
        `<span class="row"><span class="name">${def.name}</span>` +
        `<span class="elem">${elementLabel(def.element)}</span>` +
        `<span class="cost">${def.cost}g</span></span>` +
        `<span class="blurb">${def.blurb}</span>`;
      btn.addEventListener('click', () => this.handlers.onSelect(id));
      list.appendChild(btn);
      this.buttons.set(id, btn);
    }
  }

  private buildTableReference(): void {
    const rows = STATE_IDS.map((s) => {
      const cells = ELEMENT_IDS.map(
        (e) => `<td data-el="${e}">${describeOutcome(RESISTANCE[s][e])}</td>`,
      ).join('');
      return `<tr><th>${STATES[s].label}</th>${cells}</tr>`;
    }).join('');
    const head = ELEMENT_IDS.map((e) => `<th data-el="${e}">${elementLabel(e)}</th>`).join('');
    el('tableBody').innerHTML = `<table><tr><th></th>${head}</tr>${rows}</table>`;
  }

  /**
   * What the panel currently describes, so it is only rebuilt on change.
   *
   * Keyed on the branch as well as the tower: keyed on the tower alone, buying
   * an upgrade left the panel still offering both branches, because nothing
   * about the identity had changed.
   */
  private shownTower: string | null = null;

  sync(world: World, selected: TowerId | null, inspected: Tower | null): void {
    this.syncInspect(world, inspected);
    el('gold').textContent = String(world.gold);
    el('lives').textContent = String(world.lives);
    el('wave').textContent = `${Math.min(world.waveIndex + 1, WAVES.length)}/${WAVES.length}`;

    for (const [id, btn] of this.buttons) {
      const affordable = world.gold >= TOWERS[id].cost;
      btn.setAttribute('aria-pressed', String(id === selected));
      // The selected tower stays clickable even once it is unaffordable, so it
      // can always be toggled back off. Disabling it stranded the selection:
      // a disabled button fires no click, so the only ways out were Escape or
      // right-click, neither of which is discoverable. Placement is guarded by
      // placeTower regardless, so an unaffordable click still builds nothing.
      btn.disabled = !affordable && id !== selected;
      btn.classList.toggle('unaffordable', !affordable);
    }

    // Light up the column for whatever tower the player is holding or
    // inspecting, so "what does this tower actually do" is one glance away.
    const active = selected
      ? TOWERS[selected].element
      : inspected
        ? TOWERS[inspected.def].element
        : null;
    for (const cell of Array.from(el('tableBody').querySelectorAll<HTMLElement>('[data-el]'))) {
      cell.classList.toggle('active', cell.dataset.el === active);
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
          ? `All ten rounds held. ${world.stats.breaks} layers broken, ${world.stats.kills} charges destroyed, ${world.stats.goldEarned} gold earned.`
          : `The line failed on round ${world.waveIndex + 1}. ${world.stats.leaks} charges got through, and ${world.stats.wasted} shots landed on something immune to them.`;
    }
  }

  /**
   * The upgrade panel for whichever placed tower is being inspected.
   *
   * Rebuilt only when the inspected tower changes; affordability is refreshed
   * every frame, so a branch becomes buyable the moment the gold arrives.
   */
  private syncInspect(world: World, inspected: Tower | null): void {
    const panel = el('inspect');
    panel.hidden = inspected === null;
    if (!inspected) {
      this.shownTower = null;
      return;
    }

    const list = el('upgradeList');
    const key = `${inspected.id}:${inspected.upgrade ?? ''}`;
    if (this.shownTower !== key) {
      this.shownTower = key;
      el('inspectTitle').textContent = `${TOWERS[inspected.def].name} upgrades`;
      list.replaceChildren();

      if (inspected.upgrade) {
        const taken = document.createElement('p');
        taken.className = 'taken';
        taken.textContent = `${UPGRADES[inspected.upgrade].name} fitted. Branches are exclusive and there is no refund.`;
        list.appendChild(taken);
        return;
      }

      for (const up of upgradesFor(inspected.def)) {
        const btn = document.createElement('button');
        btn.className = 'tower';
        btn.dataset.upgrade = up.id;
        btn.style.setProperty('--slot', TOWERS[inspected.def].color);
        const changes = describeOverrides(up.id)
          .map((line) => `<span class="blurb">${line}</span>`)
          .join('');
        btn.innerHTML =
          `<span class="row"><span class="name">${up.name}</span><span class="cost">${up.cost}g</span></span>` +
          `<span class="blurb">${up.blurb}</span>${changes}`;
        btn.addEventListener('click', () => this.handlers.onUpgrade(inspected, up.id));
        list.appendChild(btn);
      }
    }

    for (const btn of Array.from(list.querySelectorAll<HTMLButtonElement>('button[data-upgrade]'))) {
      const up = UPGRADES[btn.dataset.upgrade as UpgradeId];
      const affordable = world.gold >= up.cost;
      btn.disabled = !affordable;
      btn.classList.toggle('unaffordable', !affordable);
    }
  }
}
