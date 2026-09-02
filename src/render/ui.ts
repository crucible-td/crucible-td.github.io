/** DOM chrome around the canvas: readouts, build menu, table reference, overlay. */
import { ELEMENT_ART, ELEMENT_COLOR, MONSTER_ART, TOWER_ART, svgMarkup } from './art.ts';
import {
  barsFor,
  cardState,
  describeMultiplier,
  describeOverrides,
  describeRider,
  describeRiderGains,
  describeStats,
  elementLabel,
  endOverlay,
  matterRows,
  panelKey,
  roundHint,
  waveLabel,
} from './decisions.ts';
import { RESISTANCE } from '../sim/resistance.ts';
import { TOWERS, TOWER_IDS } from '../sim/towers.ts';
import { UPGRADES } from '../sim/upgrades.ts';
import { ELEMENT_IDS, STATES } from '../sim/types.ts';
import type { State, Tower, TowerId, UpgradeId } from '../sim/types.ts';
import type { Speed } from './clock.ts';
import { availableUpgrades, effective } from '../sim/world.ts';
import type { World } from '../sim/world.ts';

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`missing element #${id}`);
  return node as T;
}

export interface UiHandlers {
  /**
   * Always a real tower: the build menu has no "nothing" card. Deselecting is
   * expressed by arming the tower that is already armed, which `armTower`
   * resolves -- so this parameter never needed to admit null.
   */
  onSelect(id: TowerId): void;
  onStartWave(): void;
  onRestart(): void;
  onFreeplay(): void;
  onUpgrade(tower: Tower, id: UpgradeId): void;
  onCloseInspect(): void;
  /** Hovering a branch previews it on the board; null clears the preview. */
  onPreviewUpgrade(id: UpgradeId | null): void;
  onTogglePause(): void;
  onCycleSpeed(): void;
}

export class Ui {
  private buttons = new Map<TowerId, HTMLButtonElement>();

  constructor(private handlers: UiHandlers) {
    this.buildTowerMenu();
    this.buildMatterPanel();
    el<HTMLButtonElement>('startWave').addEventListener('click', () => handlers.onStartWave());
    el<HTMLButtonElement>('restart').addEventListener('click', () => handlers.onRestart());
    el<HTMLButtonElement>('freeplay').addEventListener('click', () => handlers.onFreeplay());
    el<HTMLButtonElement>('inspectClose').addEventListener('click', () => handlers.onCloseInspect());
    el<HTMLButtonElement>('pause').addEventListener('click', () => handlers.onTogglePause());
    el<HTMLButtonElement>('speed').addEventListener('click', () => handlers.onCycleSpeed());
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
      // The icon is the same artwork the board draws, so the silhouette
      // learned here is the one recognised in play.
      btn.innerHTML =
        `<span class="icon">${svgMarkup(TOWER_ART[id], def.color, 30)}</span>` +
        `<span class="body">` +
        `<span class="row"><span class="name">${def.name}</span>` +
        // The glyph before the word, because the glyph is the half that works
        // without English -- and it is the same mark the board stamps beside
        // the tower once it is down.
        `<span class="elem">` +
        `${svgMarkup(ELEMENT_ART[def.element], ELEMENT_COLOR[def.element], 12)}` +
        `${elementLabel(def.element)}</span>` +
        `<span class="cost">${def.cost}g</span></span>` +
        `<span class="blurb">${def.blurb}</span>` +
        `<span class="blurb rider">${describeRider(def.element)}</span></span>`;
      btn.addEventListener('click', () => this.handlers.onSelect(id));
      list.appendChild(btn);
      this.buttons.set(id, btn);
    }
  }

  /**
   * The Matter panel: the resistance table and the layer chain, in one place.
   *
   * These were two separate problems with one answer. The table was folded
   * away in a `<details>` at the bottom of the sidebar, which is a strange
   * place for the thing the entire game is made of; and the chain -- what a
   * layer breaks into -- was written down in DESIGN.md and nowhere the player
   * could see. Both questions get asked about the same layer at the same
   * moment, so they belong in the same row.
   *
   * Bars first, numerals second. The bars are the part that works whatever
   * language you read, which is the whole reason this pass exists; the numeral
   * is there for when "good" is not precise enough.
   */
  private buildMatterPanel(): void {
    const head = ELEMENT_IDS.map(
      (e) =>
        `<th data-el="${e}" title="${elementLabel(e)}">` +
        `${svgMarkup(ELEMENT_ART[e], ELEMENT_COLOR[e], 14)}</th>`,
    ).join('');

    const rows = matterRows()
      .map((s) => {
        const def = STATES[s];
        const cells = ELEMENT_IDS.map((e) => {
          const mult = RESISTANCE[s][e];
          const filled = barsFor(mult);
          if (filled === 0) {
            return `<td data-el="${e}"><span class="wall" title="immune">&#10005;</span></td>`;
          }
          const bars = Array.from(
            { length: 4 },
            (_, i) => `<i${i < filled ? ' class="on"' : ''}></i>`,
          ).join('');
          return (
            `<td data-el="${e}" style="--el: ${ELEMENT_COLOR[e]}">` +
            `<span class="bars">${bars}</span>` +
            `<span class="mult">${describeMultiplier(mult)}</span></td>`
          );
        }).join('');

        // What climbs out when this layer breaks. The trap the game is built
        // around -- shattering a Crystal is correct and fills the lane with
        // two Lava, which Heat cannot touch -- was previously discoverable
        // only by doing it.
        const child = def.breaksInto;
        const chain = child
          ? `<span class="chain">&rarr; ${def.childCount > 1 ? `${def.childCount}&times; ` : ''}` +
            `${svgMarkup(MONSTER_ART[child], STATES[child].color, 13)}` +
            `<span>${STATES[child].label}</span></span>`
          : `<span class="chain last">&rarr; gone</span>`;

        return (
          `<tr data-state="${s}">` +
          `<th>${svgMarkup(MONSTER_ART[s], def.color, 18)}` +
          `<span class="lname" style="color: ${def.color}">${def.label}</span>${chain}</th>` +
          `${cells}</tr>`
        );
      })
      .join('');

    el('matterBody').innerHTML = `<table><tr><th></th>${head}</tr>${rows}</table>`;
  }

  /**
   * What the panel currently describes, so it is only rebuilt on change.
   *
   * Keyed on the branch as well as the tower: keyed on the tower alone, buying
   * an upgrade left the panel still offering both branches, because nothing
   * about the identity had changed.
   */
  private shownTower: string | null = null;

  /**
   * `hoveredState` is the layer the pointer is over on the lane, if any.
   *
   * Lighting its row is what turns the Matter panel from a reference the
   * player has to decide to read into one they learn by accident: point at a
   * Crystal because you want to know what it is, and the panel answers in the
   * same place it will be next time you look.
   */
  sync(
    world: World,
    selected: TowerId | null,
    inspected: Tower | null,
    speed: Speed,
    hoveredState: State | null = null,
  ): void {
    this.syncInspect(world, inspected);
    el('gold').textContent = String(world.gold);
    el('lives').textContent = String(world.lives);
    el('wave').textContent = waveLabel({ waveIndex: world.waveIndex, freeplay: world.freeplay });

    for (const [id, btn] of this.buttons) {
      const state = cardState({ gold: world.gold, cost: TOWERS[id].cost, isSelected: id === selected });
      btn.setAttribute('aria-pressed', String(state.pressed));
      btn.disabled = state.disabled;
      btn.classList.toggle('unaffordable', state.unaffordable);
    }

    // Light up the column for whatever tower the player is holding or
    // inspecting, so "what does this tower actually do" is one glance away.
    const active = selected
      ? TOWERS[selected].element
      : inspected
        ? TOWERS[inspected.def].element
        : null;
    for (const cell of Array.from(el('matterBody').querySelectorAll<HTMLElement>('[data-el]'))) {
      cell.classList.toggle('active', cell.dataset.el === active);
    }
    for (const row of Array.from(el('matterBody').querySelectorAll<HTMLElement>('[data-state]'))) {
      row.classList.toggle('active', row.dataset.state === hoveredState);
    }

    const pause = el<HTMLButtonElement>('pause');
    pause.textContent = speed === 0 ? 'Resume' : 'Pause';
    pause.classList.toggle('active', speed === 0);
    const speedBtn = el<HTMLButtonElement>('speed');
    speedBtn.textContent = `${speed === 0 ? '\u2014' : speed}\u00d7`;
    speedBtn.classList.toggle('active', speed > 1);

    const start = el<HTMLButtonElement>('startWave');
    start.disabled = world.status !== 'idle';
    start.textContent = world.status === 'running' ? 'Wave in progress' : 'Start wave';

    const hint = el('hint');
    if (world.status === 'idle' || world.status === 'running') {
      hint.textContent = roundHint({ waveIndex: world.waveIndex, freeplay: world.freeplay });
    }

    const overlay = el('overlay');
    const result = endOverlay({
      status: world.status,
      waveIndex: world.waveIndex,
      stats: world.stats,
    });
    overlay.hidden = result === null;
    if (result) {
      el('overlayTitle').textContent = result.title;
      el('overlayBody').textContent = result.body;
      el<HTMLButtonElement>('freeplay').hidden = !result.canContinue;
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
    // Keyed on how far the path has been climbed as well as on the tower, so
    // buying a tier rebuilds the panel to offer the next one.
    const key = panelKey(inspected);
    if (this.shownTower !== key) {
      this.shownTower = key;
      const taken = inspected.upgrades.map((id) => UPGRADES[id]);
      const committed = taken[0]?.path;
      const title = committed
        ? `${TOWERS[inspected.def].name} · ${taken[taken.length - 1]!.name}`
        : `${TOWERS[inspected.def].name} upgrades`;
      // Same icon as the board and the build menu, so all three agree about
      // which tower is under discussion.
      el('inspectTitle').innerHTML =
        `${svgMarkup(TOWER_ART[inspected.def], TOWERS[inspected.def].color, 18)}` +
        `<span>${title}</span>`;
      list.replaceChildren();

      // What has already been bought, so the panel reads as a path with a
      // position on it rather than a menu that keeps changing.
      if (taken.length > 0) {
        const owned = document.createElement('p');
        owned.className = 'taken';
        owned.textContent = `Fitted: ${taken.map((u) => u.name).join(' → ')}`;
        list.appendChild(owned);
      }

      const next = availableUpgrades(inspected);
      if (next.length === 0) {
        const done = document.createElement('p');
        done.className = 'taken';
        done.textContent = 'Path complete. There is nothing above this tier.';
        list.appendChild(done);
      }

      for (const up of next) {
        const btn = document.createElement('button');
        btn.className = 'tower';
        btn.dataset.upgrade = up.id;
        btn.style.setProperty('--slot', TOWERS[inspected.def].color);
        const changes = [
          ...describeStats(effective(inspected), up.id),
          ...describeOverrides(up.id),
          ...describeRiderGains(up.id),
        ]
          .map((line) => `<span class="blurb change">${line}</span>`)
          .join('');
        btn.innerHTML =
          `<span class="row"><span class="name">${up.name}</span>` +
          `<span class="elem">tier ${up.tier}</span>` +
          `<span class="cost">${up.cost}g</span></span>` +
          `<span class="blurb">${up.blurb}</span>${changes}`;
        btn.addEventListener('click', () => this.handlers.onUpgrade(inspected, up.id));
        btn.addEventListener('mouseenter', () => this.handlers.onPreviewUpgrade(up.id));
        btn.addEventListener('mouseleave', () => this.handlers.onPreviewUpgrade(null));
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
