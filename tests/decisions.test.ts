import { describe, expect, it } from 'vitest';
import {
  boardAction,
  cardState,
  describeMultiplier,
  describeOverrides,
  describeRider,
  describeRiderGains,
  describeStats,
  elementLabel,
  panelKey,
  rate,
} from '../src/render/decisions.ts';
import { TOWERS } from '../src/sim/towers.ts';
import { UPGRADES } from '../src/sim/upgrades.ts';
import { ELEMENT_IDS } from '../src/sim/types.ts';

/**
 * Presentation is where this project's bugs actually come from. Eight real
 * defects shipped from the interface layer and every one was found by hand in
 * a browser, because the logic lived inside event handlers where no test could
 * reach it.
 *
 * Each case below is named after the bug it would have caught, so the next
 * person to read it knows why the line exists rather than only what it does.
 */
describe('what a click on the board means', () => {
  it('places when a tower is armed and the cell is free', () => {
    expect(boardAction({ selected: true, towerHere: false })).toBe('place');
  });

  it('disarms when you click the tower you just placed', () => {
    // Selection persists after building so a line can be laid in one pass, and
    // the preview is already showing red over an occupied cell -- so the click
    // cannot mean "build". It used to mean nothing at all.
    expect(boardAction({ selected: true, towerHere: true })).toBe('disarm');
  });

  it('inspects a placed tower when nothing is armed', () => {
    expect(boardAction({ selected: false, towerHere: true })).toBe('inspect');
  });

  it('closes the panel when clicking bare ground', () => {
    expect(boardAction({ selected: false, towerHere: false })).toBe('close');
  });

  it('never depends on where the pointer last moved', () => {
    // The touch bug: the handler read its target cell from `hover`, which only
    // a mousemove sets. Phones never send one, so every tap did nothing and the
    // game was unplayable on a phone. The signature is the fix -- there is
    // nowhere to pass hover state even if someone wanted to.
    const args = Object.keys({ selected: true, towerHere: false });
    expect(args).toEqual(['selected', 'towerHere']);
  });
});

describe('how a build-menu card looks', () => {
  const forge = TOWERS.forge.cost;

  it('stays clickable when it is armed but no longer affordable', () => {
    // The stranded selection: disabling the armed card meant no click event,
    // so the only ways to disarm were Escape or right-click -- neither
    // discoverable. It stays enabled and is dimmed instead.
    const s = cardState({ gold: forge - 1, cost: forge, isSelected: true });
    expect(s.disabled).toBe(false);
    expect(s.unaffordable).toBe(true);
    expect(s.pressed).toBe(true);
  });

  it('disables an unaffordable card that is not armed', () => {
    const s = cardState({ gold: forge - 1, cost: forge, isSelected: false });
    expect(s.disabled).toBe(true);
    expect(s.unaffordable).toBe(true);
  });

  it('is plain and enabled when affordable', () => {
    const s = cardState({ gold: forge, cost: forge, isSelected: false });
    expect(s).toEqual({ pressed: false, disabled: false, unaffordable: false });
  });

  it('treats exactly enough gold as affordable', () => {
    expect(cardState({ gold: forge, cost: forge, isSelected: false }).unaffordable).toBe(false);
  });
});

describe('when the upgrade panel rebuilds', () => {
  it('changes when a different tower is inspected', () => {
    // The panel showed the previously clicked tower: keyed on nothing that
    // moved, it never rebuilt.
    expect(panelKey({ id: 1, upgrades: [] })).not.toBe(panelKey({ id: 2, upgrades: [] }));
  });

  it('changes when a tier is bought on the same tower', () => {
    // Keyed on the tower alone, buying a tier left the panel still offering the
    // tier you had just bought.
    expect(panelKey({ id: 1, upgrades: [] })).not.toBe(panelKey({ id: 1, upgrades: ['kiln1'] }));
    expect(panelKey({ id: 1, upgrades: ['kiln1'] })).not.toBe(
      panelKey({ id: 1, upgrades: ['kiln1', 'kiln2'] }),
    );
  });

  it('stays put when nothing has changed, so the panel is not rebuilt every frame', () => {
    expect(panelKey({ id: 3, upgrades: ['damp1'] })).toBe(panelKey({ id: 3, upgrades: ['damp1'] }));
  });
});

describe('describing the table to the player', () => {
  it('calls a wall a wall rather than printing a zero', () => {
    expect(describeMultiplier(0)).toBe('immune');
  });

  it('prints multipliers plainly', () => {
    expect(describeMultiplier(1)).toBe('×1');
    expect(describeMultiplier(2)).toBe('×2');
    expect(describeMultiplier(1.6)).toBe('×1.6');
  });

  it('names elements in prose case', () => {
    expect(elementLabel('HEAT')).toBe('Heat');
    expect(elementLabel('SOLVENT')).toBe('Solvent');
  });

  it('leads with the new behaviour and puts the old one in brackets', () => {
    const [line] = describeOverrides('kiln1');
    expect(line).toContain('Molten + Heat');
    expect(line).toContain('was immune');
  });

  it('describes every cell a branch rewrites', () => {
    // prism3 touches three, and a panel that quietly showed one would be
    // selling the player a smaller upgrade than they are paying for.
    expect(describeOverrides('prism3')).toHaveLength(3);
  });

  it('says nothing about cells a purely numeric branch leaves alone', () => {
    expect(describeOverrides('bellows1')).toEqual([]);
  });
});

describe('describing a stat change', () => {
  const base = { damage: 4, range: 92, cooldown: 30, splash: 0 };

  it('compares against what the tower has now, not what it shipped with', () => {
    // Partway up a path the panel must price the *next* tier, not the whole
    // path from the start.
    const midPath = { ...base, cooldown: 22 };
    const [line] = describeStats(midPath, 'bellows2');
    expect(line).toContain(`Damage 4 → ${UPGRADES.bellows2.stats!.damage!}`);
    const rateLine = describeStats(midPath, 'bellows2')[1]!;
    expect(rateLine).toContain(`${rate(22)} → ${rate(UPGRADES.bellows2.stats!.cooldown!)}`);
  });

  it('reports fire rate as shots per second, climbing as the tower improves', () => {
    // A cooldown in ticks falls when the tower gets better, which reads
    // backwards next to damage.
    expect(Number(rate(30))).toBeLessThan(Number(rate(15)));
  });

  it('stays silent about stats the tier does not touch', () => {
    expect(describeStats(base, 'kiln1')).toEqual([]);
    expect(describeStats(base, 'die1').every((l) => l.startsWith('Range'))).toBe(true);
  });

  it('says nothing when a value would not actually change', () => {
    const already = { ...base, range: UPGRADES.die1.stats!.range! };
    expect(describeStats(already, 'die1')).toEqual([]);
  });
});

describe('describeRider', () => {
  it('names the lingering effect for every element, so no tower card is blank', () => {
    for (const e of ELEMENT_IDS) expect(describeRider(e).length).toBeGreaterThan(0);
  });

  it('gives the two Heat towers one line, because the rider belongs to the element', () => {
    expect(describeRider(TOWERS.forge.element)).toBe(describeRider(TOWERS.lens.element));
  });
});

describe('describeRiderGains', () => {
  it('says a wall-lifting tier starts the rider working there too', () => {
    // Absolute Zero does not merely let the Chiller hurt Crystal, it lets the
    // Chiller *slow* Crystal -- the best reason in the game to climb a path,
    // and invisible in the multiplier alone.
    const lines = describeRiderGains('depo3');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('Crystal');
    expect(lines[0]).toContain('slowed');
  });

  it('says nothing for a tier that only makes an existing counter stronger', () => {
    // die3 takes Crystal + Kinetic from 2.0 to 3.5. The Stamp was already
    // knocking Crystal back, so there is no news here and printing a line
    // every tier would bury the one that matters.
    expect(describeRiderGains('die3')).toEqual([]);
  });

  it('ignores cells rewritten for an element the tower does not throw', () => {
    // recl3 lifts Crystal + Solvent, which is the Vat's own element -- but it
    // also has to not claim anything about the columns it leaves alone.
    expect(describeRiderGains('recl3')).toEqual(['Crystal can now be corroded too']);
    expect(describeRiderGains('bellows1')).toEqual([]);
  });
});
